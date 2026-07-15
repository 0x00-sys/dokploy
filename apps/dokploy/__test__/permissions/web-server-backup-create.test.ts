import { beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
	audit: vi.fn(),
	createBackup: vi.fn(),
	findBackupById: vi.fn(),
}));

vi.mock("@dokploy/server", async (importOriginal) => ({
	...(await importOriginal<typeof import("@dokploy/server")>()),
	createBackup: mocks.createBackup,
	findBackupById: mocks.findBackupById,
}));

vi.mock("@/server/api/utils/audit", () => ({ audit: mocks.audit }));

import { backupRouter } from "@/server/api/routers/backup";

const backupInput = {
	schedule: "0 0 * * *",
	enabled: false,
	prefix: "/",
	destinationId: "destination-1",
	database: "dokploy",
	databaseType: "web-server" as const,
	backupType: "database" as const,
	userId: "user-1",
	includeEncryptionKey: true,
	metadata: {},
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
	mocks.createBackup.mockResolvedValue({ backupId: "backup-1" });
	mocks.findBackupById.mockResolvedValue({
		backupId: "backup-1",
		enabled: false,
	});
});

it("rejects members before creating a web-server backup", async () => {
	await expect(
		createCaller("member").create(backupInput),
	).rejects.toMatchObject({ code: "UNAUTHORIZED" });
	expect(mocks.createBackup).not.toHaveBeenCalled();
});

it("still allows owners to create a web-server backup", async () => {
	await expect(
		createCaller("owner").create(backupInput),
	).resolves.toBeUndefined();
	expect(mocks.createBackup).toHaveBeenCalledOnce();
});
