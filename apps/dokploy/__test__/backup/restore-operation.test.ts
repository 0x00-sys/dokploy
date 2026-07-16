import { expect, it, vi } from "vitest";
import {
	fingerprintRestoreInput,
	getOrCreateRestoreOperation,
} from "@/server/api/utils/restore-lock";

it("fingerprints equivalent restore inputs consistently", () => {
	expect(
		fingerprintRestoreInput({
			metadata: { service: "db", credentials: { user: "dokploy" } },
			backupFile: "backup.sql.gz",
		}),
	).toBe(
		fingerprintRestoreInput({
			backupFile: "backup.sql.gz",
			metadata: { credentials: { user: "dokploy" }, service: "db" },
		}),
	);
});

it("replays completed restore operations without running them again", async () => {
	let finishRestore: (() => void) | undefined;
	const run = vi.fn(async (emit: (log: string) => void) => {
		emit("restore started");
		await new Promise<void>((resolve) => {
			finishRestore = resolve;
		});
		emit("restore completed");
	});
	const firstLogs: string[] = [];
	const firstComplete = vi.fn();
	const getOperation = () =>
		getOrCreateRestoreOperation({
			scope: "test-user",
			key: "test:operation-1",
			fingerprint: "request-1",
			resourceKey: "test-resource",
			run,
		});
	getOperation().subscribe((log) => firstLogs.push(log), firstComplete);
	await vi.waitFor(() => expect(firstLogs).toEqual(["restore started"]));

	const reconnectLogs: string[] = [];
	const reconnectComplete = vi.fn();
	getOperation().subscribe((log) => reconnectLogs.push(log), reconnectComplete);
	const rejectedRun = vi.fn(async () => {});
	expect(() =>
		getOrCreateRestoreOperation({
			scope: "test-user",
			key: "test:rejected-operation",
			fingerprint: "request-2",
			resourceKey: "test-resource",
			run: rejectedRun,
		}),
	).toThrow("A restore is already running for this service");
	finishRestore?.();
	await vi.waitFor(() => expect(firstComplete).toHaveBeenCalledOnce());
	expect(firstLogs).toEqual(["restore started", "restore completed"]);
	expect(reconnectLogs).toEqual(["restore completed"]);
	expect(reconnectComplete).toHaveBeenCalledOnce();

	const replayLogs: string[] = [];
	const replayComplete = vi.fn();
	getOperation().subscribe((log) => replayLogs.push(log), replayComplete);
	expect(replayLogs).toEqual(["restore completed"]);
	expect(replayComplete).toHaveBeenCalledOnce();
	expect(run).toHaveBeenCalledTimes(1);
	expect(() =>
		getOrCreateRestoreOperation({
			scope: "test-user",
			key: "test:operation-1",
			fingerprint: "different-request",
			resourceKey: "test-resource",
			run,
		}),
	).toThrow("already used for a different request");

	const retryComplete = vi.fn();
	getOrCreateRestoreOperation({
		scope: "test-user",
		key: "test:rejected-operation",
		fingerprint: "request-2",
		resourceKey: "test-resource",
		run: rejectedRun,
	}).subscribe(vi.fn(), retryComplete);
	await vi.waitFor(() => expect(retryComplete).toHaveBeenCalledOnce());
	expect(rejectedRun).toHaveBeenCalledOnce();
});
