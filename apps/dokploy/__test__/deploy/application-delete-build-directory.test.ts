import { db } from "@dokploy/server/db";
import { beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
	audit: vi.fn(),
	checkServiceAccess: vi.fn(),
	cleanQueuesByApplication: vi.fn(),
	deleteAllMiddlewares: vi.fn(),
	findApplicationById: vi.fn(),
	removeDeployments: vi.fn(),
	removeDirectoryCode: vi.fn(),
	removeMonitoringDirectory: vi.fn(),
	removeService: vi.fn(),
	removeTraefikConfig: vi.fn(),
}));

vi.mock("@dokploy/server", async (importOriginal) => ({
	...(await importOriginal<typeof import("@dokploy/server")>()),
	IS_CLOUD: false,
	deleteAllMiddlewares: mocks.deleteAllMiddlewares,
	findApplicationById: mocks.findApplicationById,
	removeDeployments: mocks.removeDeployments,
	removeDirectoryCode: mocks.removeDirectoryCode,
	removeMonitoringDirectory: mocks.removeMonitoringDirectory,
	removeService: mocks.removeService,
	removeTraefikConfig: mocks.removeTraefikConfig,
}));

vi.mock("@dokploy/server/services/permission", async (importOriginal) => ({
	...(await importOriginal<
		typeof import("@dokploy/server/services/permission")
	>()),
	checkServiceAccess: mocks.checkServiceAccess,
}));

vi.mock("@/server/api/utils/audit", () => ({ audit: mocks.audit }));

vi.mock("@/server/queues/queueSetup", () => ({
	cleanQueuesByApplication: mocks.cleanQueuesByApplication,
	killDockerBuild: vi.fn(),
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
	vi.restoreAllMocks();
	mocks.checkServiceAccess.mockResolvedValue(undefined);
	mocks.findApplicationById.mockResolvedValue({
		applicationId: "application-1",
		appName: "app-1",
		serverId: "runtime-server",
		buildServerId: "build-server",
		environment: { project: { organizationId: "org-1" } },
	});

	const deleteChain = {
		where: vi.fn(),
		returning: vi.fn().mockResolvedValue([]),
	};
	deleteChain.where.mockReturnValue(deleteChain);
	vi.spyOn(db, "delete").mockReturnValue(deleteChain as never);
});

it("removes application source from the dedicated build server", async () => {
	await caller.delete({ applicationId: "application-1" });

	expect(mocks.removeDirectoryCode).toHaveBeenCalledWith(
		"app-1",
		"build-server",
	);
});
