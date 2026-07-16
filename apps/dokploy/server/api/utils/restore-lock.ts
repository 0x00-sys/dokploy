import { createHash } from "node:crypto";

const RESTORE_OPERATION_TTL_MS = 24 * 60 * 60 * 1000;
const MAX_RESTORE_OPERATIONS_PER_USER = 100;
const MAX_REPLAY_LOG_LENGTH = 16_384;

interface RestoreOperationState {
	fingerprint: string;
	status: "running" | "completed";
	lastLog?: string;
	logListeners: Set<(log: string) => void>;
	completeListeners: Set<() => void>;
}

export interface RestoreOperation {
	subscribe: (
		onLog: (log: string) => void,
		onComplete: () => void,
	) => () => void;
}

interface RestoreOperationOptions {
	scope: string;
	key: string;
	fingerprint: string;
	resourceKey: string;
	busyMessage?: string;
	capacityMessage?: string;
	mismatchMessage?: string;
	run: (emit: (log: string) => void) => Promise<void>;
}

const globalForRestoreOperations = globalThis as typeof globalThis & {
	__dokployActiveRestores?: Set<string>;
	__dokployRestoreOperationsByUser?: Map<
		string,
		Map<string, RestoreOperationState>
	>;
};

const activeRestores =
	globalForRestoreOperations.__dokployActiveRestores ?? new Set<string>();
const restoreOperationsByUser =
	globalForRestoreOperations.__dokployRestoreOperationsByUser ??
	new Map<string, Map<string, RestoreOperationState>>();

globalForRestoreOperations.__dokployActiveRestores = activeRestores;
globalForRestoreOperations.__dokployRestoreOperationsByUser =
	restoreOperationsByUser;

const normalizeRestoreInput = (value: unknown): unknown => {
	if (Array.isArray(value)) return value.map(normalizeRestoreInput);
	if (value && typeof value === "object") {
		return Object.fromEntries(
			Object.entries(value)
				.sort(([left], [right]) => left.localeCompare(right))
				.map(([key, entry]) => [key, normalizeRestoreInput(entry)]),
		);
	}
	return value;
};

export const fingerprintRestoreInput = (input: unknown): string => {
	const serialized = JSON.stringify(normalizeRestoreInput(input));
	if (serialized === undefined) {
		throw new Error("Restore input cannot be serialized");
	}
	return createHash("sha256").update(serialized).digest("hex");
};

export const getOrCreateRestoreOperation = ({
	scope,
	key,
	fingerprint,
	resourceKey,
	busyMessage = "A restore is already running for this service",
	capacityMessage = "Too many recent restore operations; try again later",
	mismatchMessage = "This restore operation ID was already used for a different request",
	run,
}: RestoreOperationOptions): RestoreOperation => {
	const existingOperations = restoreOperationsByUser.get(scope);
	const existingOperation = existingOperations?.get(key);
	if (existingOperation) {
		if (existingOperation.fingerprint !== fingerprint) {
			throw new Error(mismatchMessage);
		}
		return createRestoreOperation(existingOperation);
	}

	if (activeRestores.has(resourceKey)) throw new Error(busyMessage);
	if (
		existingOperations &&
		existingOperations.size >= MAX_RESTORE_OPERATIONS_PER_USER
	) {
		throw new Error(capacityMessage);
	}

	const operations =
		existingOperations ?? new Map<string, RestoreOperationState>();
	if (!existingOperations) restoreOperationsByUser.set(scope, operations);

	const operation: RestoreOperationState = {
		fingerprint,
		status: "running",
		logListeners: new Set(),
		completeListeners: new Set(),
	};
	operations.set(key, operation);
	activeRestores.add(resourceKey);

	// Let the first subscriber attach before a restore can emit synchronously.
	queueMicrotask(() => {
		const emit = (log: string) => {
			operation.lastLog =
				log.length > MAX_REPLAY_LOG_LENGTH
					? log.slice(-MAX_REPLAY_LOG_LENGTH)
					: log;
			for (const listener of operation.logListeners) listener(log);
		};
		void run(emit)
			.catch((error) => {
				emit(
					`Error: ${error instanceof Error ? error.message : String(error)}`,
				);
			})
			.finally(() => {
				activeRestores.delete(resourceKey);
				operation.status = "completed";
				for (const listener of operation.completeListeners) listener();
				operation.logListeners.clear();
				operation.completeListeners.clear();

				// Keep the terminal state so a delayed WebSocket replay stays idempotent.
				const cleanupTimer = setTimeout(() => {
					if (operations.get(key) === operation) operations.delete(key);
					if (operations.size === 0) restoreOperationsByUser.delete(scope);
				}, RESTORE_OPERATION_TTL_MS);
				cleanupTimer.unref?.();
			});
	});

	return createRestoreOperation(operation);
};

const createRestoreOperation = (
	operation: RestoreOperationState,
): RestoreOperation => ({
	subscribe(onLog, onComplete) {
		if (operation.status === "completed") {
			if (operation.lastLog) onLog(operation.lastLog);
			onComplete();
			return () => {};
		}

		operation.logListeners.add(onLog);
		operation.completeListeners.add(onComplete);
		return () => {
			operation.logListeners.delete(onLog);
			operation.completeListeners.delete(onComplete);
		};
	},
});
