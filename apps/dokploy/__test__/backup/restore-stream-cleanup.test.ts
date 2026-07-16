import { beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
	checkServicePermissionAndAccess: vi.fn(),
	findDestinationById: vi.fn(),
	findPostgresById: vi.fn(),
	restorePostgresBackup: vi.fn(),
	restoreWebServerBackup: vi.fn(),
}));

vi.mock("@dokploy/server", async (importOriginal) => ({
	...(await importOriginal<typeof import("@dokploy/server")>()),
	findPostgresById: mocks.findPostgresById,
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

vi.mock("@dokploy/server/utils/restore", async (importOriginal) => ({
	...(await importOriginal<typeof import("@dokploy/server/utils/restore")>()),
	restorePostgresBackup: mocks.restorePostgresBackup,
	restoreWebServerBackup: mocks.restoreWebServerBackup,
}));

import { backupRouter } from "@/server/api/routers/backup";

const caller = backupRouter.createCaller({
	req: {} as never,
	res: {} as never,
	db: null as never,
	session: { activeOrganizationId: "org-1" } as never,
	user: { id: "user-1", role: "owner" } as never,
});

beforeEach(() => {
	vi.clearAllMocks();
	mocks.findDestinationById.mockResolvedValue({
		destinationId: "destination-1",
		organizationId: "org-1",
	});
	mocks.findPostgresById.mockResolvedValue({
		postgresId: "postgres-1",
	});
});

it("stops buffering restore logs after the subscription closes", async () => {
	let emitLog: ((log: string) => void) | undefined;
	let finishRestore: (() => void) | undefined;
	mocks.restoreWebServerBackup.mockImplementation(
		async (_destination, _backupFile, onData) => {
			emitLog = onData;
			onData?.("initial log");
			await new Promise<void>((resolve) => {
				finishRestore = resolve;
			});
		},
	);
	const stream = await caller.restoreBackupWithLogs({
		operationId: "00000000-0000-4000-8000-000000000001",
		databaseId: "",
		databaseType: "web-server",
		backupType: "database",
		databaseName: "dokploy",
		backupFile: "webserver-backup.zip",
		destinationId: "destination-1",
		metadata: {},
	});
	const iterator = stream[Symbol.asyncIterator]();

	await expect(iterator.next()).resolves.toEqual({
		done: false,
		value: "initial log",
	});
	await iterator.return?.();

	const originalPush = Array.prototype.push;
	let lateLogPushes = 0;
	Array.prototype.push = function <T>(this: T[], ...items: T[]) {
		if (items.some((value) => Object.is(value, "late log"))) {
			lateLogPushes++;
		}
		return originalPush.apply(this, items);
	};
	try {
		emitLog?.("late log");
		expect(lateLogPushes).toBe(0);
	} finally {
		Array.prototype.push = originalPush;
		finishRestore?.();
		await Promise.resolve();
		await Promise.resolve();
	}
});

it("reuses a restore operation across subscription reconnects", async () => {
	let finishRestore: (() => void) | undefined;
	mocks.restorePostgresBackup.mockImplementation(
		async (_postgres, _destination, _input, onData) => {
			onData?.("restore started");
			await new Promise<void>((resolve) => {
				finishRestore = resolve;
			});
			onData?.("restore completed");
		},
	);
	const input = {
		operationId: "00000000-0000-4000-8000-000000000002",
		databaseId: "postgres-1",
		databaseType: "postgres" as const,
		backupType: "database" as const,
		databaseName: "app",
		backupFile: "postgres.sql.gz",
		destinationId: "destination-1",
		metadata: {},
	};
	const firstStream = await caller.restoreBackupWithLogs(input);
	const firstIterator = firstStream[Symbol.asyncIterator]();

	await expect(firstIterator.next()).resolves.toEqual({
		done: false,
		value: "restore started",
	});

	const secondStream = await caller.restoreBackupWithLogs(input);
	const secondIterator = secondStream[Symbol.asyncIterator]();
	const secondNext = secondIterator.next();

	const competingStream = await caller.restoreBackupWithLogs({
		...input,
		operationId: "00000000-0000-4000-8000-000000000003",
	});
	const competingIterator = competingStream[Symbol.asyncIterator]();
	await expect(competingIterator.next()).rejects.toThrow(
		"A restore is already running for this service",
	);
	expect(mocks.restorePostgresBackup).toHaveBeenCalledTimes(1);

	finishRestore?.();
	await expect(secondNext).resolves.toEqual({
		done: false,
		value: "restore completed",
	});
	await expect(firstIterator.next()).resolves.toEqual({
		done: false,
		value: "restore completed",
	});
	expect(mocks.restorePostgresBackup).toHaveBeenCalledTimes(1);
	await expect(firstIterator.next()).resolves.toEqual({
		done: true,
		value: undefined,
	});
	await expect(secondIterator.next()).resolves.toEqual({
		done: true,
		value: undefined,
	});

	const thirdStream = await caller.restoreBackupWithLogs(input);
	const thirdIterator = thirdStream[Symbol.asyncIterator]();
	await expect(thirdIterator.next()).resolves.toEqual({
		done: false,
		value: "restore completed",
	});
	await expect(thirdIterator.next()).resolves.toEqual({
		done: true,
		value: undefined,
	});
	expect(mocks.restorePostgresBackup).toHaveBeenCalledTimes(1);

	const changedStream = await caller.restoreBackupWithLogs({
		...input,
		backupFile: "other-postgres.sql.gz",
	});
	await expect(changedStream[Symbol.asyncIterator]().next()).rejects.toThrow(
		"already used for a different request",
	);
	expect(mocks.restorePostgresBackup).toHaveBeenCalledTimes(1);

	const nextStream = await caller.restoreBackupWithLogs({
		...input,
		operationId: "00000000-0000-4000-8000-000000000004",
		backupFile: "other-postgres.sql.gz",
	});
	const nextIterator = nextStream[Symbol.asyncIterator]();
	await expect(nextIterator.next()).resolves.toEqual({
		done: false,
		value: "restore started",
	});
	expect(mocks.restorePostgresBackup).toHaveBeenCalledTimes(2);
	finishRestore?.();
	await expect(nextIterator.next()).resolves.toEqual({
		done: false,
		value: "restore completed",
	});
	await expect(nextIterator.next()).resolves.toEqual({
		done: true,
		value: undefined,
	});
});
