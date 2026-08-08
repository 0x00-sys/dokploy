import { beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
	audit: vi.fn(),
	findBackupById: vi.fn(),
	findDestinationById: vi.fn(),
	removeScheduleBackup: vi.fn(),
	updateBackupById: vi.fn(),
}));

vi.mock("@dokploy/server", async (importOriginal) => ({
	...(await importOriginal<typeof import("@dokploy/server")>()),
	findBackupById: mocks.findBackupById,
	removeScheduleBackup: mocks.removeScheduleBackup,
	updateBackupById: mocks.updateBackupById,
}));

vi.mock("@dokploy/server/services/destination", () => ({
	findDestinationById: mocks.findDestinationById,
}));

vi.mock("@/server/api/utils/audit", () => ({ audit: mocks.audit }));

import { backupRouter } from "@/server/api/routers/backup";

const updateInput = {
	backupId: "backup-1",
	schedule: "0 0 * * *",
	enabled: false,
	prefix: "/",
	destinationId: "destination-1",
	database: "dokploy",
	keepLatestCount: 1,
	serviceName: null,
	metadata: {},
	databaseType: "postgres" as const,
	includeEncryptionKey: true,
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
	mocks.findBackupById.mockResolvedValue({
		backupId: "backup-1",
		databaseType: "web-server",
		enabled: false,
		postgresId: null,
		mysqlId: null,
		mariadbId: null,
		mongoId: null,
		libsqlId: null,
		composeId: null,
	});
	mocks.findDestinationById.mockResolvedValue({ organizationId: "org-1" });
});

it("rejects members updating a web-server backup", async () => {
	await expect(
		createCaller("member").update(updateInput),
	).rejects.toMatchObject({ code: "UNAUTHORIZED" });
	expect(mocks.updateBackupById).not.toHaveBeenCalled();
});

it("still allows owners to update a web-server backup", async () => {
	await expect(
		createCaller("owner").update(updateInput),
	).resolves.toBeUndefined();
	expect(mocks.updateBackupById).toHaveBeenCalledOnce();
});
