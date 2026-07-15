import { TRPCError } from "@trpc/server";
import { beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
	checkPermission: vi.fn(),
	checkServicePermissionAndAccess: vi.fn(),
	findDestinationById: vi.fn(),
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
	checkPermission: mocks.checkPermission,
	checkServicePermissionAndAccess: mocks.checkServicePermissionAndAccess,
}));

import { volumeBackupsRouter } from "@/server/api/routers/volume-backups";

const input = {
	backupFileName: "volume.tar.gz",
	destinationId: "destination-1",
	volumeName: "data",
	id: "application-1",
	serviceType: "application" as const,
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
	mocks.checkPermission.mockResolvedValue(undefined);
	mocks.checkServicePermissionAndAccess.mockResolvedValue(undefined);
	mocks.findDestinationById.mockResolvedValue({
		destinationId: "destination-1",
		organizationId: "org-1",
	});
});

it("rejects volume restores for services the member cannot access", async () => {
	mocks.checkServicePermissionAndAccess.mockRejectedValue(
		new TRPCError({ code: "UNAUTHORIZED" }),
	);

	await expect(caller.restoreVolumeBackupWithLogs(input)).rejects.toMatchObject(
		{
			code: "UNAUTHORIZED",
		},
	);
	expect(mocks.findDestinationById).not.toHaveBeenCalled();
});

it("still allows volume restores for accessible services", async () => {
	await expect(
		caller.restoreVolumeBackupWithLogs(input),
	).resolves.toBeDefined();
	expect(mocks.checkServicePermissionAndAccess).toHaveBeenCalledWith(
		expect.anything(),
		"application-1",
		{ volumeBackup: ["restore"] },
	);
});
