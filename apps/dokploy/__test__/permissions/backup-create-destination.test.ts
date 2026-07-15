import { beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
	audit: vi.fn(),
	checkServicePermissionAndAccess: vi.fn(),
	createBackup: vi.fn(),
	findBackupById: vi.fn(),
	findDestinationById: vi.fn(),
}));

vi.mock("@dokploy/server", async (importOriginal) => ({
	...(await importOriginal<typeof import("@dokploy/server")>()),
	createBackup: mocks.createBackup,
	findBackupById: mocks.findBackupById,
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
	schedule: "0 0 * * *",
	enabled: false,
	prefix: "/",
	destinationId: "destination-1",
	database: "app",
	databaseType: "postgres" as const,
	backupType: "database" as const,
	postgresId: "postgres-1",
	includeEncryptionKey: false,
	metadata: {},
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
	mocks.findDestinationById.mockResolvedValue({
		destinationId: "destination-1",
		organizationId: "org-1",
	});
	mocks.createBackup.mockResolvedValue({ backupId: "backup-1" });
	mocks.findBackupById.mockResolvedValue({
		backupId: "backup-1",
		enabled: false,
	});
});

it("rejects backup destinations from another organization", async () => {
	mocks.findDestinationById.mockResolvedValue({
		destinationId: "destination-1",
		organizationId: "org-2",
	});

	await expect(caller.create(input)).rejects.toMatchObject({
		code: "UNAUTHORIZED",
	});
	expect(mocks.createBackup).not.toHaveBeenCalled();
});

it("still creates backups with a destination in the active organization", async () => {
	await expect(caller.create(input)).resolves.toBeUndefined();
	expect(mocks.createBackup).toHaveBeenCalledOnce();
});
