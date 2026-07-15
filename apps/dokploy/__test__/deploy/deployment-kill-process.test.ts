import { beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
	audit: vi.fn(),
	execAsync: vi.fn(),
	execAsyncRemote: vi.fn(),
	findDeploymentById: vi.fn(),
	findServerById: vi.fn(),
	updateDeploymentStatus: vi.fn(),
}));

vi.mock("@dokploy/server", async (importOriginal) => ({
	...(await importOriginal<typeof import("@dokploy/server")>()),
	execAsync: mocks.execAsync,
	execAsyncRemote: mocks.execAsyncRemote,
	findDeploymentById: mocks.findDeploymentById,
	updateDeploymentStatus: mocks.updateDeploymentStatus,
}));

vi.mock("@dokploy/server/services/server", async (importOriginal) => ({
	...(await importOriginal<typeof import("@dokploy/server/services/server")>()),
	findServerById: mocks.findServerById,
}));

vi.mock("@/server/api/utils/audit", () => ({ audit: mocks.audit }));

import { deploymentRouter } from "@/server/api/routers/deployment";

const caller = deploymentRouter.createCaller({
	req: {} as never,
	res: {} as never,
	db: null as never,
	session: { activeOrganizationId: "org-1" } as never,
	user: { id: "user-1", role: "member" } as never,
});

beforeEach(() => {
	vi.clearAllMocks();
	mocks.execAsync.mockResolvedValue({ stdout: "", stderr: "" });
	mocks.execAsyncRemote.mockResolvedValue({ stdout: "", stderr: "" });
	mocks.findServerById.mockResolvedValue({
		serverId: "schedule-server",
		organizationId: "org-1",
	});
	mocks.findDeploymentById.mockResolvedValue({
		deploymentId: "deployment-1",
		applicationId: null,
		composeId: null,
		serverId: "application-server",
		pid: "4321",
		schedule: { serverId: null },
	});
});

it("kills an application schedule process on its recorded server", async () => {
	await caller.killProcess({ deploymentId: "deployment-1" });

	expect(mocks.execAsyncRemote).toHaveBeenCalledWith(
		"application-server",
		"kill -9 4321",
	);
	expect(mocks.execAsync).not.toHaveBeenCalled();
	expect(mocks.updateDeploymentStatus).toHaveBeenCalledWith(
		"deployment-1",
		"error",
	);
});

it("falls back to the schedule server for older deployment rows", async () => {
	mocks.findDeploymentById.mockResolvedValue({
		deploymentId: "deployment-1",
		applicationId: null,
		composeId: null,
		serverId: null,
		pid: "4321",
		schedule: { serverId: "schedule-server" },
	});

	await caller.killProcess({ deploymentId: "deployment-1" });

	expect(mocks.execAsyncRemote).toHaveBeenCalledWith(
		"schedule-server",
		"kill -9 4321",
	);
	expect(mocks.execAsync).not.toHaveBeenCalled();
});
