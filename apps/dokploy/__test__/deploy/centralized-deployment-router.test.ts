import { beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
	findAllDeploymentsCentralized: vi.fn(),
	findDeploymentUpdatesCentralized: vi.fn(),
	checkPermission: vi.fn(),
}));

vi.mock("@dokploy/server/services/permission", async (importOriginal) => ({
	...(await importOriginal<
		typeof import("@dokploy/server/services/permission")
	>()),
	checkPermission: mocks.checkPermission,
}));

vi.mock("@dokploy/server", async (importOriginal) => ({
	...(await importOriginal<typeof import("@dokploy/server")>()),
	findAllDeploymentsCentralized: mocks.findAllDeploymentsCentralized,
	findDeploymentUpdatesCentralized: mocks.findDeploymentUpdatesCentralized,
}));

import { deploymentRouter } from "@/server/api/routers/deployment";

const caller = deploymentRouter.createCaller({
	req: {} as never,
	res: {} as never,
	db: null as never,
	session: { activeOrganizationId: "org-1" } as never,
	user: { id: "user-1", role: "owner" } as never,
});

beforeEach(() => {
	vi.clearAllMocks();
	mocks.checkPermission.mockResolvedValue(undefined);
	mocks.findAllDeploymentsCentralized.mockResolvedValue([]);
	mocks.findDeploymentUpdatesCentralized.mockResolvedValue({
		items: [],
		deploymentIds: [],
	});
});

it("returns a server cursor with the initial deployment snapshot", async () => {
	const result = await caller.centralizedSnapshot();

	expect(Number.isNaN(Date.parse(result.cursor))).toBe(false);
	expect(result.items).toEqual([]);
	expect(mocks.findAllDeploymentsCentralized).toHaveBeenCalledWith(
		"org-1",
		null,
	);
});

it("keeps the existing centralized deployment response compatible", async () => {
	await expect(caller.allCentralized()).resolves.toEqual([]);
});

it("requests only new and tracked deployment rows during polling", async () => {
	await expect(
		caller.centralizedUpdates({
			after: "2026-01-01T00:00:00.000Z",
			deploymentIds: ["running-1"],
		}),
	).resolves.toEqual({ items: [], deploymentIds: [] });

	expect(mocks.findDeploymentUpdatesCentralized).toHaveBeenCalledWith(
		"org-1",
		null,
		"2026-01-01T00:00:00.000Z",
		["running-1"],
	);
});
