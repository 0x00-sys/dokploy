import { expect, it, vi } from "vitest";
import {
	appendDeploymentLogChunk,
	createDeploymentLogBuffer,
} from "@/components/dashboard/application/deployments/deployment-log-buffer";
import {
	fetchDeploymentLogFallback,
	getDeploymentLogNotice,
	resolveDeploymentLogFallback,
	shouldLoadDeploymentLogFallback,
} from "@/components/dashboard/application/deployments/deployment-log-fallback";

it("loads a bounded deployment log snapshot over HTTP", async () => {
	const readLogs = vi
		.fn()
		.mockResolvedValue("2026-01-01T00:00:00.000Z build complete\n");

	const buffer = await fetchDeploymentLogFallback("deployment-1", readLogs);

	expect(readLogs).toHaveBeenCalledWith({
		deploymentId: "deployment-1",
		tail: 10000,
	});
	expect(buffer?.logs.map((log) => log.message)).toEqual(["build complete"]);
});

it("does not request a snapshot without a deployment record", async () => {
	const readLogs = vi.fn();

	await expect(
		fetchDeploymentLogFallback(undefined, readLogs),
	).resolves.toBeNull();
	expect(readLogs).not.toHaveBeenCalled();
});

it("reports an empty saved log as unavailable", async () => {
	const readLogs = vi.fn().mockResolvedValue("");

	await expect(
		fetchDeploymentLogFallback("deployment-1", readLogs),
	).resolves.toBeNull();
});

it("marks buffered lines as disconnected when the fallback fails", () => {
	expect(getDeploymentLogNotice("error", true)).toContain("connection failed");
	expect(getDeploymentLogNotice("error", false)).toBeNull();
});

it("only loads a fallback when the socket produced no logs", () => {
	expect(shouldLoadDeploymentLogFallback(true)).toBe(false);
	expect(shouldLoadDeploymentLogFallback(false)).toBe(true);
	expect(getDeploymentLogNotice("closed", true)).toContain("connection closed");
});

it("does not replace streamed logs if a fallback resolves later", () => {
	const liveBuffer = createDeploymentLogBuffer();
	const fallbackBuffer = createDeploymentLogBuffer();
	appendDeploymentLogChunk(liveBuffer, "live line\n");
	appendDeploymentLogChunk(fallbackBuffer, "saved line\n");

	expect(resolveDeploymentLogFallback(liveBuffer, fallbackBuffer)).toEqual({
		buffer: liveBuffer,
		state: "closed",
	});
});
