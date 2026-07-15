import { beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
	execAsync: vi.fn(),
	execAsyncRemote: vi.fn(),
}));

vi.mock("@dokploy/server", () => ({ IS_CLOUD: false }));

vi.mock("@dokploy/server/utils/process/execAsync", () => ({
	execAsync: mocks.execAsync,
	execAsyncRemote: mocks.execAsyncRemote,
}));

vi.mock("@/server/queues/concurrency", () => ({
	resolveBuildsConcurrency: vi.fn(() => 1),
}));

vi.mock("@/server/queues/deployments-queue", () => ({
	processDeploymentJob: vi.fn(),
}));

import { killDockerBuild } from "@/server/queues/queueSetup";

beforeEach(() => {
	vi.clearAllMocks();
	mocks.execAsync.mockResolvedValue({ stdout: "", stderr: "" });
	mocks.execAsyncRemote.mockResolvedValue({ stdout: "", stderr: "" });
});

it("reports local build termination failures to the caller", async () => {
	mocks.execAsync.mockRejectedValue(new Error("pkill failed"));

	await expect(killDockerBuild("application", null)).rejects.toThrow(
		"pkill failed",
	);
});

it("reports remote build termination failures to the caller", async () => {
	mocks.execAsyncRemote.mockRejectedValue(new Error("ssh failed"));

	await expect(killDockerBuild("compose", "server-1")).rejects.toThrow(
		"ssh failed",
	);
});
