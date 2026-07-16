import { beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
	checkPermission: vi.fn(),
	checkServicePermissionAndAccess: vi.fn(),
	execAsyncStream: vi.fn(),
	findDestinationById: vi.fn(),
	restoreVolume: vi.fn(),
}));

vi.mock("@dokploy/server", async (importOriginal) => ({
	...(await importOriginal<typeof import("@dokploy/server")>()),
	restoreVolume: mocks.restoreVolume,
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

vi.mock("@dokploy/server/utils/process/execAsync", async (importOriginal) => ({
	...(await importOriginal<
		typeof import("@dokploy/server/utils/process/execAsync")
	>()),
	execAsyncStream: mocks.execAsyncStream,
}));

import { volumeBackupsRouter } from "@/server/api/routers/volume-backups";

const caller = volumeBackupsRouter.createCaller({
	req: {} as never,
	res: {} as never,
	db: null as never,
	session: { activeOrganizationId: "volume-restore-org" } as never,
	user: { id: "volume-restore-user", role: "member" } as never,
});

const input = {
	operationId: "00000000-0000-4000-8000-000000000022",
	backupFileName: "data.tar.gz",
	destinationId: "destination-1",
	volumeName: "application-data",
	id: "application-1",
	serviceType: "application" as const,
};

beforeEach(() => {
	vi.clearAllMocks();
	mocks.checkPermission.mockResolvedValue(undefined);
	mocks.checkServicePermissionAndAccess.mockResolvedValue(undefined);
	mocks.findDestinationById.mockResolvedValue({
		destinationId: "destination-1",
		organizationId: "volume-restore-org",
	});
	mocks.restoreVolume.mockResolvedValue("restore command");
});

it("reuses a volume restore operation across subscription reconnects", async () => {
	let finishRestore: (() => void) | undefined;
	mocks.execAsyncStream.mockImplementation(async (_command, onData) => {
		onData?.("restore output");
		await new Promise<void>((resolve) => {
			finishRestore = resolve;
		});
	});

	const firstStream = await caller.restoreVolumeBackupWithLogs(input);
	const firstNext = vi.fn();
	const firstComplete = vi.fn();
	const firstSubscription = firstStream.subscribe({
		complete: firstComplete,
		next: firstNext,
	});
	await vi.waitFor(() => expect(mocks.execAsyncStream).toHaveBeenCalledOnce());
	firstSubscription.unsubscribe();

	const reconnectStream = await caller.restoreVolumeBackupWithLogs(input);
	const reconnectNext = vi.fn();
	const reconnectComplete = vi.fn();
	reconnectStream.subscribe({
		complete: reconnectComplete,
		next: reconnectNext,
	});

	const competingStream = await caller.restoreVolumeBackupWithLogs({
		...input,
		operationId: "00000000-0000-4000-8000-000000000023",
	});
	const competingError = vi.fn();
	competingStream.subscribe({ error: competingError });
	await vi.waitFor(() => expect(competingError).toHaveBeenCalledOnce());
	expect(competingError.mock.calls[0]?.[0]).toMatchObject({
		message: "A restore is already running for this volume",
	});
	expect(mocks.execAsyncStream).toHaveBeenCalledTimes(1);

	finishRestore?.();
	await vi.waitFor(() => expect(reconnectComplete).toHaveBeenCalledOnce());
	expect(firstComplete).not.toHaveBeenCalled();
	expect(firstNext).not.toHaveBeenCalledWith(
		"🎉 All containers/services have been restarted with the restored volume.",
	);
	expect(reconnectNext).toHaveBeenCalledWith(
		"🎉 All containers/services have been restarted with the restored volume.",
	);

	const replayStream = await caller.restoreVolumeBackupWithLogs(input);
	const replayNext = vi.fn();
	const replayComplete = vi.fn();
	replayStream.subscribe({ complete: replayComplete, next: replayNext });
	expect(replayNext).toHaveBeenCalledWith(
		"🎉 All containers/services have been restarted with the restored volume.",
	);
	expect(replayComplete).toHaveBeenCalledOnce();
	expect(mocks.execAsyncStream).toHaveBeenCalledTimes(1);

	const changedStream = await caller.restoreVolumeBackupWithLogs({
		...input,
		backupFileName: "other-data.tar.gz",
	});
	const changedError = vi.fn();
	changedStream.subscribe({ error: changedError });
	await vi.waitFor(() => expect(changedError).toHaveBeenCalledOnce());
	expect(changedError.mock.calls[0]?.[0]).toMatchObject({
		message:
			"This restore operation ID was already used for a different request",
	});
	expect(mocks.execAsyncStream).toHaveBeenCalledTimes(1);

	const nextStream = await caller.restoreVolumeBackupWithLogs({
		...input,
		operationId: "00000000-0000-4000-8000-000000000024",
		backupFileName: "other-data.tar.gz",
	});
	const nextComplete = vi.fn();
	nextStream.subscribe({ complete: nextComplete });
	await vi.waitFor(() =>
		expect(mocks.execAsyncStream).toHaveBeenCalledTimes(2),
	);
	finishRestore?.();
	await vi.waitFor(() => expect(nextComplete).toHaveBeenCalledOnce());
});
