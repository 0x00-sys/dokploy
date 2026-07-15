import { expect, it, vi } from "vitest";

vi.mock("@dokploy/server", () => ({ IS_CLOUD: false }));

vi.mock("@dokploy/server/utils/process/execAsync", () => ({
	execAsync: vi.fn(),
	execAsyncRemote: vi.fn(),
}));

vi.mock("@/server/queues/concurrency", () => ({
	resolveBuildsConcurrency: vi.fn(() => 1),
}));

vi.mock("@/server/queues/deployments-queue", () => ({
	processDeploymentJob: vi.fn(),
}));

it("registers one shutdown listener across repeated module evaluation", async () => {
	const existingListeners = new Set(process.listeners("SIGTERM"));

	await import("@/server/queues/queueSetup");
	vi.resetModules();
	await import("@/server/queues/queueSetup");

	const addedListeners = process
		.listeners("SIGTERM")
		.filter((listener) => !existingListeners.has(listener));

	try {
		expect(addedListeners).toHaveLength(1);
	} finally {
		for (const listener of addedListeners) {
			process.removeListener("SIGTERM", listener);
		}
	}
});
