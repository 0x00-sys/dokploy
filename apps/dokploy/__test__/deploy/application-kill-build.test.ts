import { beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
	audit: vi.fn(),
	checkServicePermissionAndAccess: vi.fn(),
	findApplicationById: vi.fn(),
	killDockerBuild: vi.fn(),
}));

vi.mock("@dokploy/server", async (importOriginal) => ({
	...(await importOriginal<typeof import("@dokploy/server")>()),
	findApplicationById: mocks.findApplicationById,
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
