import { beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
	const deleteChain = {
		where: vi.fn(),
		returning: vi.fn(),
	};
	deleteChain.where.mockReturnValue(deleteChain);
	deleteChain.returning.mockResolvedValue([
		{
			deploymentId: "deployment-1",
			logPath: "/var/lib/dokploy/logs/app/deployment.log",
			serverId: null,
			buildServerId: null,
		},
	]);
	const selectChain = {
		from: vi.fn(),
		innerJoin: vi.fn(),
		where: vi.fn(),
	};
	selectChain.from.mockReturnValue(selectChain);
	selectChain.innerJoin.mockReturnValue(selectChain);
	selectChain.where.mockResolvedValue([]);

	return {
		audit: vi.fn(),
		checkServicePermissionAndAccess: vi.fn(),
		db: {
			delete: vi.fn(() => deleteChain),
			select: vi.fn(() => selectChain),
			query: {
				ssoProvider: { findMany: vi.fn().mockResolvedValue([]) },
				webServerSettings: { findFirst: vi.fn().mockResolvedValue({}) },
			},
		},
		execAsync: vi.fn(),
		execAsyncRemote: vi.fn(),
		findDeploymentById: vi.fn(),
	};
});

vi.mock("@dokploy/server/db", () => ({ db: mocks.db }));

vi.mock("@dokploy/server/utils/process/execAsync", () => ({
	execAsync: mocks.execAsync,
	execAsyncRemote: mocks.execAsyncRemote,
}));

vi.mock("@dokploy/server", async (importOriginal) => ({
	...(await importOriginal<typeof import("@dokploy/server")>()),
	findDeploymentById: mocks.findDeploymentById,
}));

vi.mock("@dokploy/server/services/permission", async (importOriginal) => ({
	...(await importOriginal<
		typeof import("@dokploy/server/services/permission")
	>()),
	checkServicePermissionAndAccess: mocks.checkServicePermissionAndAccess,
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
	mocks.checkServicePermissionAndAccess.mockResolvedValue(undefined);
	mocks.execAsync.mockResolvedValue({ stdout: "", stderr: "" });
	mocks.execAsyncRemote.mockResolvedValue({ stdout: "", stderr: "" });
	mocks.findDeploymentById.mockResolvedValue({
		deploymentId: "deployment-1",
		applicationId: null,
		composeId: "compose-1",
		serverId: null,
		buildServerId: null,
		logPath: "/var/lib/dokploy/logs/app/deployment.log",
		application: null,
		compose: { serverId: "compose-server" },
		schedule: null,
	});
});

it("deletes compose deployment logs from the compose server", async () => {
	await caller.removeDeployment({ deploymentId: "deployment-1" });

	expect(mocks.execAsyncRemote).toHaveBeenCalledWith(
		"compose-server",
		"rm -f /var/lib/dokploy/logs/app/deployment.log;",
	);
	expect(mocks.execAsync).not.toHaveBeenCalled();
});

it("deletes application deployment logs from the dedicated build server", async () => {
	mocks.findDeploymentById.mockResolvedValue({
		deploymentId: "deployment-1",
		applicationId: "application-1",
		composeId: null,
		serverId: null,
		buildServerId: "build-server",
		logPath: "/var/lib/dokploy/logs/app/deployment.log",
		application: { serverId: "runtime-server" },
		compose: null,
		schedule: null,
	});

	await caller.removeDeployment({ deploymentId: "deployment-1" });

	expect(mocks.execAsyncRemote).toHaveBeenCalledWith(
		"build-server",
		"rm -f /var/lib/dokploy/logs/app/deployment.log;",
	);
	expect(mocks.execAsync).not.toHaveBeenCalled();
});
