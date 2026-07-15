import { describe, expect, it } from "vitest";
import {
	appendDeploymentLogChunk,
	createDeploymentLogBuffer,
	EXTRA_LOGS_SEPARATOR,
	getVisibleDeploymentLogCount,
} from "@/components/dashboard/application/deployments/deployment-log-buffer";
import { parseLogs } from "@/components/dashboard/docker/logs/utils";

describe("deployment log buffer", () => {
	it("matches full parsing across arbitrary chunk boundaries", () => {
		const chunks = [
			"2026-01-01T00:00:00.000Z fir",
			"st line\nsecond line\n2026-01-01T00:",
			"00:01.000Z third line",
		];
		const buffer = createDeploymentLogBuffer();
		let completeData = "";

		for (const chunk of chunks) {
			completeData += chunk;
			appendDeploymentLogChunk(buffer, chunk);
			expect(buffer.logs).toEqual(parseLogs(completeData));
		}
	});

	it("replaces a live partial line instead of duplicating it", () => {
		const buffer = createDeploymentLogBuffer();

		appendDeploymentLogChunk(buffer, "building");
		appendDeploymentLogChunk(buffer, " image");

		expect(buffer.logs.map((log) => log.message)).toEqual(["building image"]);
		expect(buffer.pendingText).toBe("building image");
	});

	it("appends completed lines without copying or retaining their raw text", () => {
		const buffer = createDeploymentLogBuffer();
		const logs = buffer.logs;

		appendDeploymentLogChunk(buffer, "first line\nsecond line\n");

		expect(buffer.logs).toBe(logs);
		expect(buffer.logs).toHaveLength(2);
		expect(buffer.pendingText).toBe("");
	});

	it("tracks the extra-log boundary when the separator spans chunks", () => {
		const buffer = createDeploymentLogBuffer();
		const splitAt = 25;

		appendDeploymentLogChunk(
			buffer,
			`deployment complete\n${EXTRA_LOGS_SEPARATOR.slice(0, splitAt)}`,
		);
		expect(buffer.extraLogsStartIndex).toBeNull();

		appendDeploymentLogChunk(
			buffer,
			`${EXTRA_LOGS_SEPARATOR.slice(splitAt)}\nremote diagnostic\n`,
		);

		expect(buffer.extraLogsStartIndex).toBe(1);
		expect(buffer.logs.map((log) => log.message)).toEqual([
			"deployment complete",
			EXTRA_LOGS_SEPARATOR,
			"remote diagnostic",
		]);
		expect(getVisibleDeploymentLogCount(buffer, false)).toBe(1);
		expect(getVisibleDeploymentLogCount(buffer, true)).toBe(3);
	});
});
