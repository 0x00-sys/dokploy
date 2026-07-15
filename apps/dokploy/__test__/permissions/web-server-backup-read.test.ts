import { beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
	findBackupById: vi.fn(),
}));

vi.mock("@dokploy/server", async (importOriginal) => ({
	...(await importOriginal<typeof import("@dokploy/server")>()),
	findBackupById: mocks.findBackupById,
}));

import { backupRouter } from "@/server/api/routers/backup";

const webServerBackup = {
	backupId: "backup-1",
	databaseType: "web-server",
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
});

it("rejects members reading a web-server backup", async () => {
	await expect(
		createCaller("member").one({ backupId: "backup-1" }),
	).rejects.toMatchObject({ code: "UNAUTHORIZED" });
});

it("still allows owners to read a web-server backup", async () => {
	await expect(
		createCaller("owner").one({ backupId: "backup-1" }),
	).resolves.toBe(webServerBackup);
});
