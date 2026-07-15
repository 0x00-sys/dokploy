import { beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
	checkServicePermissionAndAccess: vi.fn(),
	execAsync: vi.fn(),
	execAsyncRemote: vi.fn(),
	findDeploymentById: vi.fn(),
}));

vi.mock("@dokploy/server", async (importOriginal) => ({
	...(await importOriginal<typeof import("@dokploy/server")>()),
	execAsync: mocks.execAsync,
	execAsyncRemote: mocks.execAsyncRemote,
	findDeploymentById: mocks.findDeploymentById,
}));

vi.mock("@dokploy/server/services/permission", async (importOriginal) => ({
	...(await importOriginal<
		typeof import("@dokploy/server/services/permission")
	>()),
	checkServicePermissionAndAccess: mocks.checkServicePermissionAndAccess,
}));

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
	mocks.execAsyncRemote.mockResolvedValue({
		stdout: "deployment output",
		stderr: "",
	});
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
});

it("reads application deployment logs from the dedicated build server", async () => {
	await expect(
		caller.readLogs({ deploymentId: "deployment-1", tail: 100 }),
	).resolves.toBe("deployment output");

	expect(mocks.execAsyncRemote).toHaveBeenCalledWith(
		"build-server",
		expect.stringContaining("tail -n 100"),
	);
});

it("falls back to the runtime server when no build server is recorded", async () => {
	mocks.findDeploymentById.mockResolvedValue({
		deploymentId: "deployment-1",
		applicationId: "application-1",
		composeId: null,
		serverId: null,
		buildServerId: null,
		logPath: "/var/lib/dokploy/logs/app/deployment.log",
		application: { serverId: "runtime-server" },
		compose: null,
		schedule: null,
	});

	await caller.readLogs({ deploymentId: "deployment-1", tail: 100 });

	expect(mocks.execAsyncRemote).toHaveBeenCalledWith(
		"runtime-server",
		expect.stringContaining("tail -n 100"),
	);
});
