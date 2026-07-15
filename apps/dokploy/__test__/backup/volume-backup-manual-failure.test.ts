import { beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
	audit: vi.fn(),
	checkServicePermissionAndAccess: vi.fn(),
	findVolumeBackupById: vi.fn(),
	runVolumeBackup: vi.fn(),
}));

vi.mock("@dokploy/server", async (importOriginal) => ({
	...(await importOriginal<typeof import("@dokploy/server")>()),
	findVolumeBackupById: mocks.findVolumeBackupById,
	runVolumeBackup: mocks.runVolumeBackup,
}));

vi.mock("@dokploy/server/services/permission", async (importOriginal) => ({
	...(await importOriginal<
		typeof import("@dokploy/server/services/permission")
	>()),
	checkServicePermissionAndAccess: mocks.checkServicePermissionAndAccess,
}));

vi.mock("@/server/api/utils/audit", () => ({ audit: mocks.audit }));

import { volumeBackupsRouter } from "@/server/api/routers/volume-backups";

const caller = volumeBackupsRouter.createCaller({
	req: {} as never,
	res: {} as never,
	db: null as never,
	session: { activeOrganizationId: "org-1" } as never,
	user: { id: "user-1", role: "member" } as never,
});

beforeEach(() => {
	vi.clearAllMocks();
	mocks.checkServicePermissionAndAccess.mockResolvedValue(undefined);
	mocks.findVolumeBackupById.mockResolvedValue({
		applicationId: "application-1",
		volumeBackupId: "volume-backup-1",
	});
});

it("reports manual volume backup failures to the dashboard", async () => {
	const failure = new Error("backup failed");
	mocks.runVolumeBackup.mockRejectedValue(failure);

	await expect(
		caller.runManually({ volumeBackupId: "volume-backup-1" }),
	).rejects.toMatchObject({
		code: "INTERNAL_SERVER_ERROR",
		message: failure.message,
	});
	expect(mocks.audit).not.toHaveBeenCalled();
});
