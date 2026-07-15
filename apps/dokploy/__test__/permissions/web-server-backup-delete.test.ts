import { beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
	audit: vi.fn(),
	findBackupById: vi.fn(),
	removeBackupById: vi.fn(),
	removeScheduleBackup: vi.fn(),
}));

vi.mock("@dokploy/server", async (importOriginal) => ({
	...(await importOriginal<typeof import("@dokploy/server")>()),
	findBackupById: mocks.findBackupById,
	removeBackupById: mocks.removeBackupById,
	removeScheduleBackup: mocks.removeScheduleBackup,
}));

vi.mock("@/server/api/utils/audit", () => ({ audit: mocks.audit }));

import { backupRouter } from "@/server/api/routers/backup";

const webServerBackup = {
	backupId: "backup-1",
	databaseType: "web-server",
	schedule: "0 0 * * *",
	postgresId: null,
	mysqlId: null,
	mariadbId: null,
	mongoId: null,
	libsqlId: null,
	composeId: null,
};

const createCaller = (role: "owner" | "member") =>
	backupRouter.createCaller({
		req: {} as never,
		res: {} as never,
		db: null as never,
		session: { activeOrganizationId: "org-1" } as never,
		user: { id: "user-1", role } as never,
	});

beforeEach(() => {
	vi.clearAllMocks();
	mocks.findBackupById.mockResolvedValue(webServerBackup);
	mocks.removeBackupById.mockResolvedValue(webServerBackup);
});

it("rejects members deleting a web-server backup", async () => {
	await expect(
		createCaller("member").remove({ backupId: "backup-1" }),
	).rejects.toMatchObject({ code: "UNAUTHORIZED" });
	expect(mocks.removeBackupById).not.toHaveBeenCalled();
});

it("still allows owners to delete a web-server backup", async () => {
	await expect(
		createCaller("owner").remove({ backupId: "backup-1" }),
	).resolves.toBe(webServerBackup);
	expect(mocks.removeBackupById).toHaveBeenCalledOnce();
});
