import { useVirtualizer } from "@tanstack/react-virtual";
import { type RefObject, useEffect } from "react";
import { TerminalLine } from "./terminal-line";
import type { LogLine } from "./utils";

const ESTIMATED_LOG_ROW_HEIGHT = 24;
const LOG_VIEWPORT_HEIGHT = 720;

interface Props {
	logs: LogLine[];
	scrollRef: RefObject<HTMLDivElement | null>;
	autoScroll: boolean;
	searchTerm: string;
	showTimestamp: boolean;
	version: number;
}

export const VirtualizedRuntimeLogs = ({
	logs,
	scrollRef,
	autoScroll,
	searchTerm,
	showTimestamp,
	version,
}: Props) => {
	const rowVirtualizer = useVirtualizer({
		count: logs.length,
		getScrollElement: () => scrollRef.current,
		estimateSize: () => ESTIMATED_LOG_ROW_HEIGHT,
		initialRect: {
			width: 0,
			height: LOG_VIEWPORT_HEIGHT,
		},
		overscan: 10,
	});
	const totalSize = rowVirtualizer.getTotalSize();

	useEffect(() => {
		if (autoScroll && scrollRef.current) {
			scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
		}
	}, [autoScroll, logs.length, scrollRef, totalSize, version]);

	return (
		<div
			style={{
				height: `${totalSize}px`,
				position: "relative",
				width: "100%",
			}}
		>
			{rowVirtualizer.getVirtualItems().map((virtualRow) => {
				const log = logs[virtualRow.index];
				if (!log) return null;

				return (
					<div
						key={virtualRow.key}
						ref={rowVirtualizer.measureElement}
						data-index={virtualRow.index}
						style={{
							left: 0,
							position: "absolute",
							top: 0,
							transform: `translateY(${virtualRow.start}px)`,
							width: "100%",
						}}
					>
						<TerminalLine
							log={log}
							searchTerm={searchTerm}
							noTimestamp={!showTimestamp}
						/>
					</div>
				);
			})}
		</div>
	);
};
