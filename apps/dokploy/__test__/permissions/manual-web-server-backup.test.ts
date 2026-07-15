import { beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
	audit: vi.fn(),
	checkPermission: vi.fn(),
	findBackupById: vi.fn(),
	keepLatestNBackups: vi.fn(),
	runWebServerBackup: vi.fn(),
}));

vi.mock("@dokploy/server", async (importOriginal) => ({
	...(await importOriginal<typeof import("@dokploy/server")>()),
	findBackupById: mocks.findBackupById,
	keepLatestNBackups: mocks.keepLatestNBackups,
	runWebServerBackup: mocks.runWebServerBackup,
}));

vi.mock("@dokploy/server/services/permission", async (importOriginal) => ({
	...(await importOriginal<
		typeof import("@dokploy/server/services/permission")
	>()),
	checkPermission: mocks.checkPermission,
}));

vi.mock("@/server/api/utils/audit", () => ({ audit: mocks.audit }));

import { backupRouter } from "@/server/api/routers/backup";

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
	mocks.checkPermission.mockResolvedValue(undefined);
	mocks.findBackupById.mockResolvedValue({ backupId: "backup-1" });
});

it("rejects members running a web-server backup", async () => {
	await expect(
		createCaller("member").manualBackupWebServer({ backupId: "backup-1" }),
	).rejects.toMatchObject({ code: "UNAUTHORIZED" });
	expect(mocks.runWebServerBackup).not.toHaveBeenCalled();
});

it("still allows owners to run a web-server backup", async () => {
	await expect(
		createCaller("owner").manualBackupWebServer({ backupId: "backup-1" }),
	).resolves.toBe(true);
	expect(mocks.runWebServerBackup).toHaveBeenCalledOnce();
});
