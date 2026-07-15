import { type LogLine, parseLogs } from "../../docker/logs/utils";

export const EXTRA_LOGS_SEPARATOR =
	"===================================EXTRA LOGS============================================";

export interface DeploymentLogBuffer {
	logs: LogLine[];
	pendingText: string;
	hasPendingLog: boolean;
	extraLogsStartIndex: number | null;
}

export const createDeploymentLogBuffer = (): DeploymentLogBuffer => ({
	logs: [],
	pendingText: "",
	hasPendingLog: false,
	extraLogsStartIndex: null,
});

const appendLogs = (buffer: DeploymentLogBuffer, logs: LogLine[]) => {
	for (const log of logs) {
		if (
			buffer.extraLogsStartIndex === null &&
			log.message.includes(EXTRA_LOGS_SEPARATOR)
		) {
			buffer.extraLogsStartIndex = buffer.logs.length;
		}
		buffer.logs.push(log);
	}
};

export const appendDeploymentLogChunk = (
	buffer: DeploymentLogBuffer,
	chunk: string,
) => {
	if (buffer.hasPendingLog) {
		const pendingIndex = buffer.logs.length - 1;
		buffer.logs.pop();
		if (buffer.extraLogsStartIndex === pendingIndex) {
			buffer.extraLogsStartIndex = null;
		}
	}

	const combined = buffer.pendingText + chunk;
	const lastNewline = combined.lastIndexOf("\n");
	const completedText =
		lastNewline === -1 ? "" : combined.slice(0, lastNewline);
	buffer.pendingText =
		lastNewline === -1 ? combined : combined.slice(lastNewline + 1);

	if (completedText) {
		appendLogs(buffer, parseLogs(completedText));
	}

	const pendingLogs = parseLogs(buffer.pendingText);
	appendLogs(buffer, pendingLogs);
	buffer.hasPendingLog = pendingLogs.length > 0;
};

export const getVisibleDeploymentLogCount = (
	buffer: DeploymentLogBuffer,
	includeExtraLogs: boolean,
) =>
	includeExtraLogs || buffer.extraLogsStartIndex === null
		? buffer.logs.length
		: buffer.extraLogsStartIndex;
