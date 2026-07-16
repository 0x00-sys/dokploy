import { beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
	findDestinationById: vi.fn(),
	restoreWebServerBackup: vi.fn(),
}));

vi.mock("@dokploy/server/services/destination", async (importOriginal) => ({
	...(await importOriginal<
		typeof import("@dokploy/server/services/destination")
	>()),
	findDestinationById: mocks.findDestinationById,
}));

vi.mock("@dokploy/server/utils/restore", async (importOriginal) => ({
	...(await importOriginal<typeof import("@dokploy/server/utils/restore")>()),
	restoreWebServerBackup: mocks.restoreWebServerBackup,
}));

import { backupRouter } from "@/server/api/routers/backup";

beforeEach(() => {
	vi.clearAllMocks();
	mocks.findDestinationById.mockResolvedValue({
		destinationId: "destination-1",
		organizationId: "org-1",
	});
	mocks.restoreWebServerBackup.mockResolvedValue(undefined);
});

it("rejects oversized restore operation IDs", async () => {
	const caller = backupRouter.createCaller({
		req: {} as never,
		res: {} as never,
		db: null as never,
		session: { activeOrganizationId: "org-1" } as never,
		user: { id: "user-1", role: "owner" } as never,
	});

	await expect(
		caller.restoreBackupWithLogs({
			operationId: "a".repeat(65),
			databaseId: "",
			databaseType: "web-server",
			backupType: "database",
			databaseName: "dokploy",
			backupFile: "webserver-backup.zip",
			destinationId: "destination-1",
			metadata: {},
		}),
	).rejects.toMatchObject({ code: "BAD_REQUEST" });
	expect(mocks.findDestinationById).not.toHaveBeenCalled();
});

it("rejects members before starting a web-server restore", async () => {
	const caller = backupRouter.createCaller({
		req: {} as never,
		res: {} as never,
		db: null as never,
		session: { activeOrganizationId: "org-1" } as never,
		user: { id: "user-1", role: "member" } as never,
	});

	const subscription = await caller.restoreBackupWithLogs({
		operationId: "00000000-0000-4000-8000-000000000011",
		databaseId: "",
		databaseType: "web-server",
		backupType: "database",
		databaseName: "dokploy",
		backupFile: "webserver-backup.zip",
		destinationId: "destination-1",
		metadata: {},
	});

	await expect(
		subscription[Symbol.asyncIterator]().next(),
	).rejects.toMatchObject({
		code: "UNAUTHORIZED",
	});
	expect(mocks.restoreWebServerBackup).not.toHaveBeenCalled();
});

it("still allows owners to start a web-server restore", async () => {
	const caller = backupRouter.createCaller({
		req: {} as never,
		res: {} as never,
		db: null as never,
		session: { activeOrganizationId: "org-1" } as never,
		user: { id: "user-1", role: "owner" } as never,
	});

	const subscription = await caller.restoreBackupWithLogs({
		operationId: "00000000-0000-4000-8000-000000000012",
		databaseId: "",
		databaseType: "web-server",
		backupType: "database",
		databaseName: "dokploy",
		backupFile: "webserver-backup.zip",
		destinationId: "destination-1",
		metadata: {},
	});

	await expect(subscription[Symbol.asyncIterator]().next()).resolves.toEqual({
		done: true,
		value: undefined,
	});
	expect(mocks.restoreWebServerBackup).toHaveBeenCalledOnce();
});

it("rejects restore destinations from another organization", async () => {
	mocks.findDestinationById.mockResolvedValue({
		destinationId: "destination-2",
		organizationId: "org-2",
	});
	const caller = backupRouter.createCaller({
		req: {} as never,
		res: {} as never,
		db: null as never,
		session: { activeOrganizationId: "org-1" } as never,
		user: { id: "user-1", role: "owner" } as never,
	});

	const subscription = await caller.restoreBackupWithLogs({
		operationId: "00000000-0000-4000-8000-000000000013",
		databaseId: "",
		databaseType: "web-server",
		backupType: "database",
		databaseName: "dokploy",
		backupFile: "webserver-backup.zip",
		destinationId: "destination-2",
		metadata: {},
	});

	await expect(
		subscription[Symbol.asyncIterator]().next(),
	).rejects.toMatchObject({
		code: "UNAUTHORIZED",
	});
	expect(mocks.restoreWebServerBackup).not.toHaveBeenCalled();
});
