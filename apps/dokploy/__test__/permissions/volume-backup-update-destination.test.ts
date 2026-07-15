import { beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
	audit: vi.fn(),
	checkServicePermissionAndAccess: vi.fn(),
	findDestinationById: vi.fn(),
	findVolumeBackupById: vi.fn(),
	removeVolumeBackupJob: vi.fn(),
	updateVolumeBackup: vi.fn(),
}));

vi.mock("@dokploy/server", async (importOriginal) => ({
	...(await importOriginal<typeof import("@dokploy/server")>()),
	findVolumeBackupById: mocks.findVolumeBackupById,
	removeVolumeBackupJob: mocks.removeVolumeBackupJob,
	updateVolumeBackup: mocks.updateVolumeBackup,
}));

vi.mock("@dokploy/server/services/destination", async (importOriginal) => ({
	...(await importOriginal<
		typeof import("@dokploy/server/services/destination")
	>()),
	findDestinationById: mocks.findDestinationById,
}));

vi.mock("@dokploy/server/services/permission", async (importOriginal) => ({
	...(await importOriginal<
		typeof import("@dokploy/server/services/permission")
	>()),
	checkServicePermissionAndAccess: mocks.checkServicePermissionAndAccess,
}));

vi.mock("@/server/api/utils/audit", () => ({ audit: mocks.audit }));

import { volumeBackupsRouter } from "@/server/api/routers/volume-backups";

const input = {
	volumeBackupId: "volume-backup-1",
	name: "Application data",
	volumeName: "data",
	prefix: "app",
	cronExpression: "0 0 * * *",
	enabled: false,
	applicationId: "application-1",
	destinationId: "destination-1",
};

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
		volumeBackupId: "volume-backup-1",
		applicationId: "application-1",
	});
	mocks.findDestinationById.mockResolvedValue({
		destinationId: "destination-1",
		organizationId: "org-1",
	});
	mocks.updateVolumeBackup.mockResolvedValue({
		volumeBackupId: "volume-backup-1",
		cronExpression: "0 0 * * *",
		enabled: false,
	});
});

it("rejects updated volume backup destinations from another organization", async () => {
	mocks.findDestinationById.mockResolvedValue({
		destinationId: "destination-1",
		organizationId: "org-2",
	});

	await expect(caller.update(input)).rejects.toMatchObject({
		code: "UNAUTHORIZED",
	});
	expect(mocks.updateVolumeBackup).not.toHaveBeenCalled();
});

it("still updates volume backups in the active organization", async () => {
	await expect(caller.update(input)).resolves.toMatchObject({
		volumeBackupId: "volume-backup-1",
	});
	expect(mocks.updateVolumeBackup).toHaveBeenCalledOnce();
});
