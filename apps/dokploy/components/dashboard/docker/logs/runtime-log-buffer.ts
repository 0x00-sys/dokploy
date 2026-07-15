import { type LogLine, parseLogs } from "./utils";

export interface RuntimeLogBuffer {
	logs: LogLine[];
	pendingText: string;
	hasPendingLog: boolean;
	lineLimit: number;
}

export const createRuntimeLogBuffer = (
	lineLimit: number,
): RuntimeLogBuffer => ({
	logs: [],
	pendingText: "",
	hasPendingLog: false,
	lineLimit,
});

export const cloneRuntimeLogBuffer = (
	buffer: RuntimeLogBuffer,
): RuntimeLogBuffer => ({
	...buffer,
	logs: [...buffer.logs],
});

export const appendRuntimeLogChunk = (
	buffer: RuntimeLogBuffer,
	chunk: string,
) => {
	if (buffer.hasPendingLog) {
		buffer.logs.pop();
	}

	const combined = buffer.pendingText + chunk;
	const lastNewline = combined.lastIndexOf("\n");
	const completedText =
		lastNewline === -1 ? "" : combined.slice(0, lastNewline);
	buffer.pendingText =
		lastNewline === -1 ? combined : combined.slice(lastNewline + 1);

	if (completedText) {
		buffer.logs.push(...parseLogs(completedText));
	}

	const pendingLogs = parseLogs(buffer.pendingText);
	buffer.logs.push(...pendingLogs);
	buffer.hasPendingLog = pendingLogs.length > 0;

	const overflow = buffer.logs.length - buffer.lineLimit;
	if (overflow > 0) {
		buffer.logs.splice(0, overflow);
	}
};
