import copy from "copy-to-clipboard";
import { Check, Copy, Loader2 } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { AnalyzeLogs } from "@/components/dashboard/docker/logs/analyze-logs";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { type LogLine, parseLogs } from "../../docker/logs/utils";
import {
	appendDeploymentLogChunk,
	createDeploymentLogBuffer,
	getVisibleDeploymentLogCount,
} from "./deployment-log-buffer";
import { VirtualizedDeploymentLogs } from "./virtualized-deployment-logs";

interface Props {
	logPath: string | null;
	open: boolean;
	onClose: () => void;
	serverId?: string;
	errorMessage?: string;
}

export const closeDeploymentLogSocket = (socket: Pick<WebSocket, "close">) =>
	socket.close();

export const ShowDeployment = ({
	logPath,
	open,
	onClose,
	serverId,
	errorMessage,
}: Props) => {
	const [showExtraLogs, setShowExtraLogs] = useState(false);
	const logBufferRef = useRef(createDeploymentLogBuffer());
	const [, setLogVersion] = useState(0);
	const [autoScroll, setAutoScroll] = useState(true);
	const scrollRef = useRef<HTMLDivElement>(null);
	const [copied, setCopied] = useState(false);

	const handleScroll = () => {
		if (!scrollRef.current) return;

		const { scrollTop, scrollHeight, clientHeight } = scrollRef.current;
		const isAtBottom = Math.abs(scrollHeight - scrollTop - clientHeight) < 10;
		setAutoScroll(isAtBottom);
	};

	useEffect(() => {
		if (!open || !logPath) return;

		const logBuffer = createDeploymentLogBuffer();
		logBufferRef.current = logBuffer;
		setLogVersion((version) => version + 1);
		const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";

		const wsUrl = `${protocol}//${window.location.host}/listen-deployment?logPath=${logPath}${serverId ? `&serverId=${serverId}` : ""}`;
		const ws = new WebSocket(wsUrl);

		ws.onmessage = (e) => {
			if (logBufferRef.current !== logBuffer) return;
			appendDeploymentLogChunk(logBuffer, String(e.data));
			setLogVersion((version) => version + 1);
		};

		ws.onerror = (error) => {
			console.error("WebSocket error: ", error);
		};

		return () => {
			closeDeploymentLogSocket(ws);
		};
	}, [logPath, open, serverId]);

	const logs = logBufferRef.current.logs;
	const visibleLogCount = getVisibleDeploymentLogCount(
		logBufferRef.current,
		!serverId || showExtraLogs,
	);

	const handleCopy = () => {
		const logContent = logs
			.slice(0, visibleLogCount)
			.map(({ timestamp, message }: LogLine) =>
				`${timestamp?.toISOString() || ""} ${message}`.trim(),
			)
			.join("\n");

		const success = copy(logContent);
		if (success) {
			setCopied(true);
			setTimeout(() => setCopied(false), 2000);
		}
	};

	const optionalErrors = useMemo(
		() => parseLogs(errorMessage || ""),
		[errorMessage],
	);
	const displayedLogs = visibleLogCount > 0 ? logs : optionalErrors;
	const displayedLogCount =
		visibleLogCount > 0 ? visibleLogCount : optionalErrors.length;

	return (
		<Dialog
			open={open}
			onOpenChange={(e) => {
				onClose();
				if (!e) {
					logBufferRef.current = createDeploymentLogBuffer();
					setLogVersion((version) => version + 1);
				}
			}}
		>
			<DialogContent className={"sm:max-w-5xl"}>
				<DialogHeader>
					<DialogTitle>Deployment</DialogTitle>
					<DialogDescription className="flex items-center gap-2">
						<span className="flex items-center gap-2">
							See all the details of this deployment |{" "}
							<Badge variant="blank" className="text-xs">
								{visibleLogCount} lines
							</Badge>
						</span>

						<Button
							variant="outline"
							size="sm"
							className="h-7"
							onClick={handleCopy}
							disabled={visibleLogCount === 0}
						>
							{copied ? (
								<Check className="h-3.5 w-3.5" />
							) : (
								<Copy className="h-3.5 w-3.5" />
							)}
						</Button>
						<AnalyzeLogs
							logs={logs}
							logCount={visibleLogCount}
							context="build"
						/>

						{serverId && (
							<div className="flex items-center space-x-2">
								<Checkbox
									id="show-extra-logs"
									checked={showExtraLogs}
									onCheckedChange={(checked) =>
										setShowExtraLogs(checked as boolean)
									}
								/>
								<label
									htmlFor="show-extra-logs"
									className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
								>
									Show Extra Logs
								</label>
							</div>
						)}
					</DialogDescription>
				</DialogHeader>

				<div
					ref={scrollRef}
					onScroll={handleScroll}
					className="h-[720px] overflow-y-auto space-y-0 border p-4 bg-background rounded custom-logs-scrollbar"
				>
					{" "}
					{displayedLogs.length > 0 ? (
						<VirtualizedDeploymentLogs
							logs={displayedLogs}
							logCount={displayedLogCount}
							scrollRef={scrollRef}
							autoScroll={autoScroll}
						/>
					) : (
						<div className="flex justify-center items-center h-full text-muted-foreground">
							<Loader2 className="h-6 w-6 animate-spin" />
						</div>
					)}
				</div>
			</DialogContent>
		</Dialog>
	);
};
