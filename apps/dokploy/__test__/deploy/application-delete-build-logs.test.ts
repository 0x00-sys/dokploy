import { expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
	const deleteChain = {
		where: vi.fn(),
		returning: vi.fn().mockResolvedValue([]),
	};
	deleteChain.where.mockReturnValue(deleteChain);

	return {
		db: { delete: vi.fn(() => deleteChain) },
		execAsync: vi.fn(),
		execAsyncRemote: vi.fn(),
	};
});

vi.mock("@dokploy/server/db", () => ({ db: mocks.db }));

vi.mock("@dokploy/server/services/application", () => ({
	findApplicationById: vi.fn(),
	updateApplicationStatus: vi.fn(),
}));

vi.mock("@dokploy/server/utils/process/execAsync", () => ({
	execAsync: mocks.execAsync,
	execAsyncRemote: mocks.execAsyncRemote,
}));

import { removeDeployments } from "@dokploy/server/services/deployment";

it("removes application logs from the dedicated build server", async () => {
	mocks.execAsyncRemote.mockResolvedValue({ stdout: "", stderr: "" });

	await removeDeployments({
		applicationId: "application-1",
		appName: "app-1",
		serverId: "runtime-server",
		buildServerId: "build-server",
	} as never);

	expect(mocks.execAsyncRemote).toHaveBeenCalledWith(
		"build-server",
		expect.stringContaining("/app-1"),
	);
	expect(mocks.execAsync).not.toHaveBeenCalled();
});
