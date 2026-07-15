import { useVirtualizer } from "@tanstack/react-virtual";
import { type RefObject, useEffect } from "react";
import { TerminalLine } from "../../docker/logs/terminal-line";
import type { LogLine } from "../../docker/logs/utils";

const ESTIMATED_LOG_ROW_HEIGHT = 24;
const LOG_VIEWPORT_HEIGHT = 720;

interface Props {
	logs: LogLine[];
	scrollRef: RefObject<HTMLDivElement | null>;
	autoScroll: boolean;
}

export const syncDeploymentLogScroll = (
	scrollElement: Pick<HTMLDivElement, "scrollHeight" | "scrollTop">,
	autoScroll: boolean,
) => {
	if (autoScroll) {
		scrollElement.scrollTop = scrollElement.scrollHeight;
	}
};

export const VirtualizedDeploymentLogs = ({
	logs,
	scrollRef,
	autoScroll,
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
		if (scrollRef.current) {
			syncDeploymentLogScroll(scrollRef.current, autoScroll);
		}
	}, [autoScroll, logs.length, scrollRef, totalSize]);

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
						<TerminalLine log={log} noTimestamp />
					</div>
				);
			})}
		</div>
	);
};
