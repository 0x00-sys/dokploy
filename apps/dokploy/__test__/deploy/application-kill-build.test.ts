import { beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
	audit: vi.fn(),
	checkServicePermissionAndAccess: vi.fn(),
	findApplicationById: vi.fn(),
	killDockerBuild: vi.fn(),
	startService: vi.fn(),
	startServiceRemote: vi.fn(),
	updateApplicationStatus: vi.fn(),
}));

vi.mock("@dokploy/server", async (importOriginal) => ({
	...(await importOriginal<typeof import("@dokploy/server")>()),
	findApplicationById: mocks.findApplicationById,
	startService: mocks.startService,
	startServiceRemote: mocks.startServiceRemote,
	updateApplicationStatus: mocks.updateApplicationStatus,
}));

vi.mock("@dokploy/server/services/permission", async (importOriginal) => ({
	...(await importOriginal<
		typeof import("@dokploy/server/services/permission")
	>()),
	checkServicePermissionAndAccess: mocks.checkServicePermissionAndAccess,
}));

vi.mock("@/server/api/utils/audit", () => ({ audit: mocks.audit }));

vi.mock("@/server/queues/queueSetup", () => ({
	cleanQueuesByApplication: vi.fn(),
	killDockerBuild: mocks.killDockerBuild,
	myQueue: { add: vi.fn() },
}));

import { applicationRouter } from "@/server/api/routers/application";

const caller = applicationRouter.createCaller({
	req: {} as never,
	res: {} as never,
	db: null as never,
	session: { activeOrganizationId: "org-1" } as never,
	user: { id: "user-1", role: "member" } as never,
});

beforeEach(() => {
	vi.clearAllMocks();
	mocks.checkServicePermissionAndAccess.mockResolvedValue(undefined);
	mocks.findApplicationById.mockResolvedValue({
		applicationId: "application-1",
		appName: "app-1",
		serverId: "runtime-server",
		buildServerId: "build-server",
	});
	mocks.killDockerBuild.mockResolvedValue(undefined);
	mocks.startService.mockResolvedValue(undefined);
	mocks.startServiceRemote.mockResolvedValue(undefined);
	mocks.updateApplicationStatus.mockResolvedValue(undefined);
});

it("kills application builds on the configured build server", async () => {
	await caller.killBuild({ applicationId: "application-1" });

	expect(mocks.killDockerBuild).toHaveBeenCalledWith(
		"application",
		"build-server",
	);
});

it("falls back to the runtime server when no build server is configured", async () => {
	mocks.findApplicationById.mockResolvedValue({
		applicationId: "application-1",
		appName: "app-1",
		serverId: "runtime-server",
		buildServerId: null,
	});

	await caller.killBuild({ applicationId: "application-1" });

	expect(mocks.killDockerBuild).toHaveBeenCalledWith(
		"application",
		"runtime-server",
	);
});

it("restores the configured application replica count", async () => {
	mocks.findApplicationById.mockResolvedValue({
		applicationId: "application-1",
		appName: "app-1",
		serverId: null,
		replicas: 3,
		modeSwarm: null,
	});

	await caller.start({ applicationId: "application-1" });

	expect(mocks.startService).toHaveBeenCalledWith("app-1", 3);
});

it("uses the replica count from an explicit swarm mode", async () => {
	mocks.findApplicationById.mockResolvedValue({
		applicationId: "application-1",
		appName: "app-1",
		serverId: "server-1",
		replicas: 3,
		modeSwarm: { Replicated: { Replicas: 5 } },
	});

	await caller.start({ applicationId: "application-1" });

	expect(mocks.startServiceRemote).toHaveBeenCalledWith("server-1", "app-1", 5);
});
