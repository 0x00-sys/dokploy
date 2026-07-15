import { db } from "@dokploy/server/db";
import { beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
	audit: vi.fn(),
	organizationHasServices: vi.fn(),
}));

vi.mock("@dokploy/server", async (importOriginal) => ({
	...(await importOriginal<typeof import("@dokploy/server")>()),
	organizationHasServices: mocks.organizationHasServices,
}));

vi.mock("@/server/api/utils/audit", () => ({ audit: mocks.audit }));

import { organizationRouter } from "@/server/api/routers/organization";

const caller = organizationRouter.createCaller({
	req: {} as never,
	res: {} as never,
	db: null as never,
	session: { activeOrganizationId: "org-1" } as never,
	user: { id: "user-1", role: "owner" } as never,
});

beforeEach(() => {
	vi.clearAllMocks();
	vi.spyOn(db.query.organization, "findFirst").mockResolvedValue({
		id: "org-1",
		name: "Production",
		ownerId: "user-1",
	} as never);
	vi.spyOn(db.query.member, "findFirst").mockResolvedValue({
		organizationId: "org-1",
		userId: "user-1",
		role: "owner",
	} as never);
	vi.spyOn(db.query.organization, "findMany").mockResolvedValue([
		{ id: "org-1" },
		{ id: "org-2" },
	] as never);
});

it("rejects organization deletion while services still exist", async () => {
	mocks.organizationHasServices.mockResolvedValue(true);
	const deleteOrganization = vi.spyOn(db, "delete");

	await expect(
		caller.delete({ organizationId: "org-1" }),
	).rejects.toMatchObject({
		code: "BAD_REQUEST",
		message:
			"Cannot delete organization: it has active services. Delete all services first.",
	});

	expect(mocks.organizationHasServices).toHaveBeenCalledWith("org-1");
	expect(deleteOrganization).not.toHaveBeenCalled();
	expect(mocks.audit).not.toHaveBeenCalled();
});

it("still deletes empty organizations", async () => {
	mocks.organizationHasServices.mockResolvedValue(false);
	const where = vi.fn().mockResolvedValue({ rowCount: 1 });
	const deleteOrganization = vi
		.spyOn(db, "delete")
		.mockReturnValue({ where } as never);

	await expect(caller.delete({ organizationId: "org-1" })).resolves.toEqual({
		rowCount: 1,
	});

	expect(deleteOrganization).toHaveBeenCalledOnce();
	expect(where).toHaveBeenCalledOnce();
	expect(mocks.audit).toHaveBeenCalledOnce();
});
