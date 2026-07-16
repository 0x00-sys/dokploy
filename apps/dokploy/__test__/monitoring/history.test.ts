import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
	checkPermission: vi.fn(),
	checkServiceAccess: vi.fn(),
	findApplicationById: vi.fn(),
	findComposeById: vi.fn(),
	findLibsqlById: vi.fn(),
	findMariadbById: vi.fn(),
	findMongoById: vi.fn(),
	findMySqlById: vi.fn(),
	findPostgresById: vi.fn(),
	findRedisById: vi.fn(),
	getAdvancedStats: vi.fn(),
	getApplicationStats: vi.fn(),
	getContainersByAppNameMatch: vi.fn(),
}));

vi.mock("@dokploy/server", async (importOriginal) => ({
	...(await importOriginal<typeof import("@dokploy/server")>()),
	findApplicationById: mocks.findApplicationById,
	findComposeById: mocks.findComposeById,
	findLibsqlById: mocks.findLibsqlById,
	findMariadbById: mocks.findMariadbById,
	findMongoById: mocks.findMongoById,
	findMySqlById: mocks.findMySqlById,
	findPostgresById: mocks.findPostgresById,
	findRedisById: mocks.findRedisById,
	getApplicationStats: mocks.getApplicationStats,
	getContainersByAppNameMatch: mocks.getContainersByAppNameMatch,
	IS_CLOUD: false,
}));

vi.mock("@dokploy/server/monitoring/utils", () => ({
	getAdvancedStats: mocks.getAdvancedStats,
}));

vi.mock("@dokploy/server/services/permission", async (importOriginal) => ({
	...(await importOriginal<
		typeof import("@dokploy/server/services/permission")
	>()),
	checkPermission: mocks.checkPermission,
	checkServiceAccess: mocks.checkServiceAccess,
}));

import { getApplicationStats } from "@dokploy/server/services/application";
import { applicationRouter } from "@/server/api/routers/application";

const caller = applicationRouter.createCaller({
	req: {} as never,
	res: {} as never,
	db: null as never,
	session: { activeOrganizationId: "org-1" } as never,
	user: { id: "user-1", role: "member" } as never,
});

const service = (appName: string, organizationId = "org-1") => ({
	appName,
	environment: { project: { organizationId } },
});

describe("monitoring history", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mocks.checkPermission.mockResolvedValue(undefined);
		mocks.checkServiceAccess.mockResolvedValue(undefined);
		mocks.getApplicationStats.mockResolvedValue({ cpu: [] });
	});

	it("returns saved samples without requiring a matching local container", async () => {
		const history = {
			cpu: [{ value: "12%", time: "2026-07-16T00:00:00.000Z" }],
			memory: [],
			disk: [],
			network: [],
			block: [],
		};
		mocks.getAdvancedStats.mockResolvedValue(history);

		await expect(getApplicationStats("remote-compose-web-1")).resolves.toBe(
			history,
		);
	});

	it("rejects unsafe history keys at the service boundary", async () => {
		await expect(
			getApplicationStats("../../other-service"),
		).rejects.toMatchObject({ code: "BAD_REQUEST" });
		await expect(getApplicationStats("..")).rejects.toMatchObject({
			code: "BAD_REQUEST",
		});
		expect(mocks.getAdvancedStats).not.toHaveBeenCalled();
	});

	it("derives an authorized remote application's history key", async () => {
		mocks.findApplicationById.mockResolvedValue(service("remote-app"));

		await caller.readAppMonitoring({
			serviceType: "application",
			serviceId: "application-1",
		});

		expect(mocks.checkServiceAccess).toHaveBeenCalledWith(
			expect.anything(),
			"application-1",
			"read",
		);
		expect(mocks.getApplicationStats).toHaveBeenCalledWith("remote-app");
		expect(mocks.getContainersByAppNameMatch).not.toHaveBeenCalled();
	});

	it("rejects a service from another organization", async () => {
		mocks.findApplicationById.mockResolvedValue(service("other-app", "org-2"));

		await expect(
			caller.readAppMonitoring({
				serviceType: "application",
				serviceId: "application-2",
			}),
		).rejects.toMatchObject({ code: "UNAUTHORIZED" });
		expect(mocks.getApplicationStats).not.toHaveBeenCalled();
	});

	it("uses only a container belonging to the authorized compose service", async () => {
		mocks.findComposeById.mockResolvedValue({
			...service("compose-app"),
			composeType: "docker-compose",
			serverId: "server-1",
		});
		mocks.getContainersByAppNameMatch.mockResolvedValue([
			{ containerId: "container123", name: "compose-app-web-1" },
		]);

		await caller.readAppMonitoring({
			serviceType: "compose",
			serviceId: "compose-1",
			containerId: "container123",
		});

		expect(mocks.getContainersByAppNameMatch).toHaveBeenCalledWith(
			"compose-app",
			"docker-compose",
			"server-1",
		);
		expect(mocks.getApplicationStats).toHaveBeenCalledWith("compose-app-web-1");
	});

	it("rejects a container outside the authorized compose service", async () => {
		mocks.findComposeById.mockResolvedValue({
			...service("compose-app"),
			composeType: "docker-compose",
			serverId: null,
		});
		mocks.getContainersByAppNameMatch.mockResolvedValue([]);

		await expect(
			caller.readAppMonitoring({
				serviceType: "compose",
				serviceId: "compose-1",
				containerId: "container123",
			}),
		).rejects.toMatchObject({ code: "NOT_FOUND" });
		expect(mocks.getApplicationStats).not.toHaveBeenCalled();
	});

	it("rejects path-like compose container identifiers before lookup", async () => {
		await expect(
			caller.readAppMonitoring({
				serviceType: "compose",
				serviceId: "compose-1",
				containerId: "../../container",
			}),
		).rejects.toMatchObject({ code: "BAD_REQUEST" });
		expect(mocks.findComposeById).not.toHaveBeenCalled();
	});
});
