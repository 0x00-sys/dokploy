import { db } from "@dokploy/server/db";
import { beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
	checkServicePermissionAndAccess: vi.fn(),
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
	vi.restoreAllMocks();
	mocks.checkServicePermissionAndAccess.mockResolvedValue(undefined);
});

it("limits the polled deployment history to the ten displayed records", async () => {
	const findMany = vi
		.spyOn(db.query.deployments, "findMany")
		.mockResolvedValue([]);

	await caller.allByType({ id: "application-1", type: "application" });

	const query = findMany.mock.calls.at(-1)?.[0];
	expect(query?.limit).toBe(10);
});
