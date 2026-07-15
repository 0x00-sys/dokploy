import copy from "copy-to-clipboard";
import {
	Check,
	Copy,
	Download as DownloadIcon,
	Loader2,
	Pause,
	Play,
} from "lucide-react";
import React, { useEffect, useMemo, useRef } from "react";
import { AlertBlock } from "@/components/shared/alert-block";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { api } from "@/utils/api";
import { AnalyzeLogs } from "./analyze-logs";
import { LineCountFilter } from "./line-count-filter";
import {
	appendRuntimeLogChunk,
	cloneRuntimeLogBuffer,
	createRuntimeLogBuffer,
} from "./runtime-log-buffer";
import { SinceLogsFilter, type TimeFilter } from "./since-logs-filter";
import { StatusLogsFilter } from "./status-logs-filter";
import { getLogType } from "./utils";
import { VirtualizedRuntimeLogs } from "./virtualized-runtime-logs";

interface Props {
	containerId: string;
	serverId?: string | null;
	runType: "swarm" | "native";
}

export const closeContainerLogSocket = (socket: Pick<WebSocket, "close">) =>
	socket.close();

export const priorities = [
	{
		label: "Info",
		value: "info",
	},
	{
		label: "Success",
		value: "success",
	},
	{
		label: "Warning",
		value: "warning",
	},
	{
		label: "Debug",
		value: "debug",
	},
	{
		label: "Error",
		value: "error",
	},
];

export const DockerLogsId: React.FC<Props> = ({
	containerId,
	serverId,
	runType,
}) => {
	const { data } = api.docker.getConfig.useQuery(
		{
			containerId,
			serverId: serverId ?? undefined,
		},
		{
			enabled: !!containerId,
		},
	);

	const logBufferRef = useRef(createRuntimeLogBuffer(100));
	const pausedLogBufferRef = useRef<ReturnType<
		typeof createRuntimeLogBuffer
	> | null>(null);
	const [logVersion, setLogVersion] = React.useState(0);
	const [autoScroll, setAutoScroll] = React.useState(true);
	const [lines, setLines] = React.useState<number>(100);
	const [search, setSearch] = React.useState<string>("");
	const [showTimestamp, setShowTimestamp] = React.useState(true);
	const [since, setSince] = React.useState<TimeFilter>("all");
	const [typeFilter, setTypeFilter] = React.useState<string[]>([]);
	const [isPaused, setIsPaused] = React.useState(false);
	const hasBufferedMessagesRef = useRef(false);
	const [hasBufferedMessages, setHasBufferedMessages] = React.useState(false);
	const isPausedRef = useRef(false);
	const scrollRef = useRef<HTMLDivElement>(null);
	const [isLoading, setIsLoading] = React.useState(false);
	const [copied, setCopied] = React.useState(false);

	const clearBufferedMessages = () => {
		hasBufferedMessagesRef.current = false;
		setHasBufferedMessages(false);
	};

	const resetLogBuffers = (lineLimit: number) => {
		logBufferRef.current = createRuntimeLogBuffer(lineLimit);
		pausedLogBufferRef.current = null;
		clearBufferedMessages();
		setLogVersion((version) => version + 1);
	};

	const scrollToBottom = () => {
		if (autoScroll && scrollRef.current) {
			scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
		}
	};

	const handleScroll = () => {
		if (!scrollRef.current) return;

		const { scrollTop, scrollHeight, clientHeight } = scrollRef.current;
		const isAtBottom = Math.abs(scrollHeight - scrollTop - clientHeight) < 10;
		setAutoScroll(isAtBottom);
	};

	const handleSearch = (e: React.ChangeEvent<HTMLInputElement>) => {
		setSearch(e.target.value || "");
	};

	const handleLines = (lines: number) => {
		setLines(lines);
	};

	const handleSince = (value: TimeFilter) => {
		setSince(value);
	};

	const handlePauseResume = () => {
		if (isPaused) {
			if (pausedLogBufferRef.current) {
				logBufferRef.current = pausedLogBufferRef.current;
				pausedLogBufferRef.current = null;
				setLogVersion((version) => version + 1);
			}
			clearBufferedMessages();
		} else {
			pausedLogBufferRef.current = cloneRuntimeLogBuffer(logBufferRef.current);
		}
		const newPausedState = !isPaused;
		setIsPaused(newPausedState);
		isPausedRef.current = newPausedState;
	};

	useEffect(() => {
		if (!containerId) return;

		let isCurrentConnection = true;
		let noDataTimeout: NodeJS.Timeout;
		setIsLoading(true);
		resetLogBuffers(lines);
		// Reset pause state when container changes
		setIsPaused(false);
		isPausedRef.current = false;

		const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
		const params = new globalThis.URLSearchParams({
			containerId,
			tail: lines.toString(),
			since,
			search,
			runType,
		});

		if (serverId) {
			params.append("serverId", serverId);
		}

		const wsUrl = `${protocol}//${
			window.location.host
		}/docker-container-logs?${params.toString()}`;
		const ws = new WebSocket(wsUrl);

		const resetNoDataTimeout = () => {
			if (noDataTimeout) clearTimeout(noDataTimeout);
			noDataTimeout = setTimeout(() => {
				if (isCurrentConnection) {
					setIsLoading(false);
				}
			}, 2000); // Wait 2 seconds for data before showing "No logs found"
		};

		ws.onopen = () => {
			if (!isCurrentConnection) {
				ws.close();
				return;
			}
			resetNoDataTimeout();
		};

		ws.onmessage = (e) => {
			if (!isCurrentConnection) return;

			const pausedBuffer = pausedLogBufferRef.current;
			if (isPausedRef.current && pausedBuffer) {
				appendRuntimeLogChunk(pausedBuffer, String(e.data));
				if (!hasBufferedMessagesRef.current) {
					hasBufferedMessagesRef.current = true;
					setHasBufferedMessages(true);
				}
			} else {
				appendRuntimeLogChunk(logBufferRef.current, String(e.data));
				setLogVersion((version) => version + 1);
			}

			setIsLoading(false);
			if (noDataTimeout) clearTimeout(noDataTimeout);
		};

		ws.onerror = (error) => {
			if (!isCurrentConnection) return;
			console.error("WebSocket error:", error);
			setIsLoading(false);
			if (noDataTimeout) clearTimeout(noDataTimeout);
		};

		ws.onclose = (e) => {
			if (!isCurrentConnection) return;
			console.log("WebSocket closed:", e.reason);
			setIsLoading(false);
			if (noDataTimeout) clearTimeout(noDataTimeout);
		};

		return () => {
			isCurrentConnection = false;
			if (noDataTimeout) clearTimeout(noDataTimeout);
			closeContainerLogSocket(ws);
		};
	}, [containerId, serverId, lines, search, since, runType]);

	const handleDownload = () => {
		const logContent = filteredLogs
			.map(
				({ timestamp, message }: { timestamp: Date | null; message: string }) =>
					`${timestamp?.toISOString() || "No timestamp"} ${message}`,
			)
			.join("\n");

		const blob = new Blob([logContent], { type: "text/plain" });
		const url = URL.createObjectURL(blob);
		const a = document.createElement("a");
		const appName = data.Name.replace("/", "") || "app";
		const isoDate = new Date().toISOString();
		a.href = url;
		a.download = `${appName}-${isoDate.slice(0, 10).replace(/-/g, "")}_${isoDate
			.slice(11, 19)
			.replace(/:/g, "")}.log.txt`;
		document.body.appendChild(a);
		a.click();
		document.body.removeChild(a);
		URL.revokeObjectURL(url);
	};

	const handleCopy = async () => {
		const logContent = filteredLogs
			.map(
				({
					timestamp,
					message,
				}: {
					timestamp: Date | null;
					message: string;
				}) =>
					showTimestamp
						? `${timestamp?.toISOString() || "No timestamp"} ${message}`
						: message,
			)
			.join("\n");

		const success = copy(logContent);
		if (success) {
			setCopied(true);
			setTimeout(() => setCopied(false), 2000);
		}
	};

	const filteredLogs = useMemo(() => {
		const logs = logBufferRef.current.logs;
		if (typeFilter.length === 0) return logs;

		return logs.filter((log) => {
			const logType = getLogType(log.message).type;
			return typeFilter.includes(logType);
		});
	}, [logVersion, typeFilter]);

	// Sync isPausedRef with isPaused state
	useEffect(() => {
		isPausedRef.current = isPaused;
	}, [isPaused]);

	useEffect(() => {
		scrollToBottom();

		if (autoScroll && scrollRef.current) {
			scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
		}
	}, [filteredLogs.length, autoScroll]);

	return (
		<div className="flex flex-col gap-4">
			<div className="rounded-lg">
				<div className="space-y-4">
					<div className="flex flex-wrap justify-between items-start sm:items-center gap-4">
						<div className="flex flex-wrap gap-4">
							<LineCountFilter value={lines} onValueChange={handleLines} />

							<SinceLogsFilter
								value={since}
								onValueChange={handleSince}
								showTimestamp={showTimestamp}
								onTimestampChange={setShowTimestamp}
							/>

							<StatusLogsFilter
								value={typeFilter}
								setValue={setTypeFilter}
								title="Log type"
								options={priorities}
							/>

							<Input
								type="search"
								placeholder="Search logs..."
								value={search}
								onChange={handleSearch}
								className="inline-flex h-9 text-sm placeholder-gray-400 w-full sm:w-auto"
							/>
						</div>

						<div className="flex gap-2">
							<Button
								variant="outline"
								size="sm"
								className="h-9"
								onClick={handlePauseResume}
								title={isPaused ? "Resume logs" : "Pause logs"}
							>
								{isPaused ? (
									<Play className="size-4" />
								) : (
									<Pause className="size-4" />
								)}
								<span className="hidden lg:ml-2 lg:inline">
									{isPaused ? "Resume" : "Pause"}
								</span>
							</Button>
							<Button
								variant="outline"
								size="sm"
								className="h-9"
								onClick={handleCopy}
								disabled={filteredLogs.length === 0}
								title="Copy logs to clipboard"
							>
								{copied ? (
									<Check className="size-4" />
								) : (
									<Copy className="size-4" />
								)}
								<span className="hidden lg:ml-2 lg:inline">
									{copied ? "Copied" : "Copy"}
								</span>
							</Button>
							<Button
								variant="outline"
								size="sm"
								className="h-9 sm:w-auto w-full"
								onClick={handleDownload}
								disabled={filteredLogs.length === 0 || !data?.Name}
								title="Download logs as text file"
							>
								<DownloadIcon className="size-4" />
								<span className="hidden lg:ml-2 lg:inline">Download logs</span>
							</Button>
							<AnalyzeLogs logs={filteredLogs} context="runtime" />
						</div>
					</div>
					{isPaused && (
						<AlertBlock type="warning" className="items-center">
							<div className="flex items-center gap-2">
								<Pause className="size-4" />
								<span>
									Logs paused
									{hasBufferedMessages && (
										<span className="ml-1 font-medium">
											(new messages buffered)
										</span>
									)}
								</span>
							</div>
						</AlertBlock>
					)}
					<div
						ref={scrollRef}
						onScroll={handleScroll}
						className="h-[720px] overflow-y-auto space-y-0 border p-4 bg-[#fafafa] dark:bg-[#050506] rounded custom-logs-scrollbar"
					>
						{filteredLogs.length > 0 ? (
							<VirtualizedRuntimeLogs
								logs={filteredLogs}
								scrollRef={scrollRef}
								autoScroll={autoScroll}
								searchTerm={search}
								showTimestamp={showTimestamp}
								version={logVersion}
							/>
						) : isLoading ? (
							<div className="flex justify-center items-center h-full text-muted-foreground">
								<Loader2 className="h-6 w-6 animate-spin" />
							</div>
						) : (
							<div className="flex justify-center items-center h-full text-muted-foreground">
								No logs found
							</div>
						)}
					</div>
				</div>
			</div>
		</div>
	);
};
