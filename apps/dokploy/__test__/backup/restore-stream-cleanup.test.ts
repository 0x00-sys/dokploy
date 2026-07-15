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
});

it("stops buffering restore logs after the subscription closes", async () => {
	let emitLog: ((log: string) => void) | undefined;
	mocks.restoreWebServerBackup.mockImplementation(
		async (_destination, _backupFile, onData) => {
			emitLog = onData;
			onData?.("initial log");
			await new Promise(() => {});
		},
	);
	const stream = await caller.restoreBackupWithLogs({
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
	}
});
