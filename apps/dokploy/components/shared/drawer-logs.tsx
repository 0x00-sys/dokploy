import { Loader2 } from "lucide-react";
import type { RefObject } from "react";
import { useRef, useState } from "react";
import {
	Sheet,
	SheetContent,
	SheetDescription,
	SheetHeader,
	SheetTitle,
} from "@/components/ui/sheet";
import { VirtualizedDeploymentLogs } from "../dashboard/application/deployments/virtualized-deployment-logs";
import type { LogLine } from "../dashboard/docker/logs/utils";

interface Props {
	isOpen: boolean;
	onClose: () => void;
	filteredLogs: LogLine[];
}

interface DrawerLogRowsProps {
	logs: LogLine[];
	scrollRef: RefObject<HTMLDivElement | null>;
	autoScroll: boolean;
}

export const DrawerLogRows = ({
	logs,
	scrollRef,
	autoScroll,
}: DrawerLogRowsProps) => (
	<VirtualizedDeploymentLogs
		logs={logs}
		scrollRef={scrollRef}
		autoScroll={autoScroll}
	/>
);

export const DrawerLogs = ({ isOpen, onClose, filteredLogs }: Props) => {
	const scrollRef = useRef<HTMLDivElement>(null);
	const [autoScroll, setAutoScroll] = useState(true);

	const handleScroll = () => {
		if (!scrollRef.current) return;

		const { scrollTop, scrollHeight, clientHeight } = scrollRef.current;
		const isAtBottom = Math.abs(scrollHeight - scrollTop - clientHeight) < 10;
		setAutoScroll(isAtBottom);
	};

	return (
		<Sheet
			open={!!isOpen}
			onOpenChange={() => {
				onClose();
			}}
		>
			<SheetContent className="sm:max-w-[740px] flex flex-col">
				<SheetHeader>
					<SheetTitle>Deployment Logs</SheetTitle>
					<SheetDescription>Details of the request log entry.</SheetDescription>
				</SheetHeader>
				<div
					ref={scrollRef}
					onScroll={handleScroll}
					className="h-[720px] overflow-y-auto space-y-0 border p-4 bg-[#fafafa] dark:bg-[#050506] rounded custom-logs-scrollbar"
				>
					{" "}
					{filteredLogs.length > 0 ? (
						<DrawerLogRows
							logs={filteredLogs}
							scrollRef={scrollRef}
							autoScroll={autoScroll}
						/>
					) : (
						<div className="flex justify-center items-center h-full text-muted-foreground">
							<Loader2 className="h-6 w-6 animate-spin" />
						</div>
					)}
				</div>
			</SheetContent>
		</Sheet>
	);
};
