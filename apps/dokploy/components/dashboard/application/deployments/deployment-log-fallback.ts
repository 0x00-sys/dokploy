import {
	appendDeploymentLogChunk,
	createDeploymentLogBuffer,
	type DeploymentLogBuffer,
} from "./deployment-log-buffer";

interface ReadDeploymentLogsInput {
	deploymentId: string;
	tail: number;
}

type ReadDeploymentLogs = (input: ReadDeploymentLogsInput) => Promise<string>;

export type DeploymentLogState =
	| "loading"
	| "streaming"
	| "snapshot"
	| "closed"
	| "error";

export const shouldLoadDeploymentLogFallback = (hasLogs: boolean) => !hasLogs;

export const resolveDeploymentLogFallback = (
	liveBuffer: DeploymentLogBuffer,
	fallbackBuffer: DeploymentLogBuffer | null,
): {
	buffer: DeploymentLogBuffer;
	state: "snapshot" | "closed" | "error";
} => {
	if (liveBuffer.logs.length > 0) {
		return { buffer: liveBuffer, state: "closed" };
	}
	if (fallbackBuffer) {
		return { buffer: fallbackBuffer, state: "snapshot" };
	}
	return { buffer: liveBuffer, state: "error" };
};

export const getDeploymentLogNotice = (
	state: DeploymentLogState,
	hasLogs: boolean,
) => {
	if (state === "snapshot") {
		return "Live updates are unavailable. Showing the latest saved log snapshot.";
	}
	if (state === "closed") {
		return "Live log connection closed. Showing the logs received before it ended.";
	}
	if (state === "error" && hasLogs) {
		return "Live updates stopped and no saved snapshot could be loaded. Showing the logs received before the connection failed.";
	}
	return null;
};

export const fetchDeploymentLogFallback = async (
	deploymentId: string | undefined,
	readLogs: ReadDeploymentLogs,
): Promise<DeploymentLogBuffer | null> => {
	if (!deploymentId) return null;

	const content = await readLogs({ deploymentId, tail: 10000 });
	const buffer = createDeploymentLogBuffer();
	appendDeploymentLogChunk(buffer, content);

	return buffer.logs.length > 0 ? buffer : null;
};
