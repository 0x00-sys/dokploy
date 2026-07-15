import { beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
	audit: vi.fn(),
	checkServicePermissionAndAccess: vi.fn(),
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

import { backupRouter } from "@/server/api/routers/backup";

const input = {
	backupId: "backup-1",
	schedule: "0 0 * * *",
	enabled: false,
	prefix: "/",
	destinationId: "destination-1",
	database: "app",
	keepLatestCount: 1,
	serviceName: null,
	metadata: {},
	databaseType: "postgres" as const,
	includeEncryptionKey: false,
};

const caller = backupRouter.createCaller({
	req: {} as never,
	res: {} as never,
	db: null as never,
	session: { activeOrganizationId: "org-1" } as never,
	user: { id: "user-1", role: "member" } as never,
});

beforeEach(() => {
	vi.clearAllMocks();
	mocks.checkServicePermissionAndAccess.mockResolvedValue(undefined);
	mocks.findBackupById.mockResolvedValue({
		backupId: "backup-1",
		databaseType: "postgres",
		postgresId: "postgres-1",
		enabled: false,
	});
	mocks.findDestinationById.mockResolvedValue({
		destinationId: "destination-1",
		organizationId: "org-1",
	});
});

it("rejects updated backup destinations from another organization", async () => {
	mocks.findDestinationById.mockResolvedValue({
		destinationId: "destination-1",
		organizationId: "org-2",
	});

	await expect(caller.update(input)).rejects.toMatchObject({
		code: "UNAUTHORIZED",
	});
	expect(mocks.updateBackupById).not.toHaveBeenCalled();
});

it("still updates backups with a destination in the active organization", async () => {
	await expect(caller.update(input)).resolves.toBeUndefined();
	expect(mocks.updateBackupById).toHaveBeenCalledOnce();
});
