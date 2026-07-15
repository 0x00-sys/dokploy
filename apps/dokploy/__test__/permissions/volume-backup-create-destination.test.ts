import { beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
	audit: vi.fn(),
	checkServicePermissionAndAccess: vi.fn(),
	createVolumeBackup: vi.fn(),
	findDestinationById: vi.fn(),
}));

vi.mock("@dokploy/server", async (importOriginal) => ({
	...(await importOriginal<typeof import("@dokploy/server")>()),
	createVolumeBackup: mocks.createVolumeBackup,
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
	mocks.findDestinationById.mockResolvedValue({
		destinationId: "destination-1",
		organizationId: "org-1",
	});
	mocks.createVolumeBackup.mockResolvedValue({
		volumeBackupId: "volume-backup-1",
		enabled: false,
	});
});

it("rejects volume backup destinations from another organization", async () => {
	mocks.findDestinationById.mockResolvedValue({
		destinationId: "destination-1",
		organizationId: "org-2",
	});

	await expect(caller.create(input)).rejects.toMatchObject({
		code: "UNAUTHORIZED",
	});
	expect(mocks.createVolumeBackup).not.toHaveBeenCalled();
});

it("still creates volume backups in the active organization", async () => {
	await expect(caller.create(input)).resolves.toMatchObject({
		volumeBackupId: "volume-backup-1",
	});
	expect(mocks.createVolumeBackup).toHaveBeenCalledOnce();
});
