import { beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
	checkServicePermissionAndAccess: vi.fn(),
	deployPostgres: vi.fn(),
}));

vi.mock("@dokploy/server", async (importOriginal) => ({
	...(await importOriginal<typeof import("@dokploy/server")>()),
	deployPostgres: mocks.deployPostgres,
}));

vi.mock("@dokploy/server/services/permission", async (importOriginal) => ({
	...(await importOriginal<
		typeof import("@dokploy/server/services/permission")
	>()),
	checkServicePermissionAndAccess: mocks.checkServicePermissionAndAccess,
}));

import { postgresRouter } from "@/server/api/routers/postgres";
import {
	fingerprintRestoreInput,
	getOrCreateRestoreOperation,
} from "@/server/api/utils/restore-lock";

const caller = postgresRouter.createCaller({
	req: {} as never,
	res: {} as never,
	db: null as never,
	session: { activeOrganizationId: "org-1" } as never,
	user: { id: "user-1", role: "member" } as never,
});

beforeEach(() => {
	vi.clearAllMocks();
	mocks.checkServicePermissionAndAccess.mockResolvedValue(undefined);
});

it("stops delivering database deployment logs after the subscription closes", async () => {
	let emitLog: ((log: string) => void) | undefined;
	mocks.deployPostgres.mockImplementation(async (_postgresId, onData) => {
		emitLog = onData;
		onData?.("initial log");
		await new Promise(() => {});
	});
	const stream = await caller.deployWithLogs({
		operationId: "00000000-0000-4000-8000-000000000030",
		postgresId: "postgres-cleanup",
	});
	const next = vi.fn();
	const subscription = stream.subscribe({ next });

	await vi.waitFor(() => expect(next).toHaveBeenCalledWith("initial log"));
	subscription.unsubscribe();
	emitLog?.("late log");

	expect(next).not.toHaveBeenCalledWith("late log");
});

it("reattaches to a database deployment when the subscription reconnects", async () => {
	let finishDeployment: (() => void) | undefined;
	mocks.deployPostgres.mockImplementation(async (_postgresId, onData) => {
		onData?.("deployment started");
		await new Promise<void>((resolve) => {
			finishDeployment = resolve;
		});
		onData?.("Deployment completed successfully!");
	});
	const input = {
		operationId: "00000000-0000-4000-8000-000000000031",
		postgresId: "postgres-reconnect",
	};

	const firstStream = await caller.deployWithLogs(input);
	const firstNext = vi.fn();
	const firstSubscription = firstStream.subscribe({ next: firstNext });
	await vi.waitFor(() =>
		expect(firstNext).toHaveBeenCalledWith("deployment started"),
	);
	firstSubscription.unsubscribe();

	const reconnectStream = await caller.deployWithLogs(input);
	const reconnectNext = vi.fn();
	const reconnectComplete = vi.fn();
	reconnectStream.subscribe({
		next: reconnectNext,
		complete: reconnectComplete,
	});
	expect(mocks.deployPostgres).toHaveBeenCalledTimes(1);

	finishDeployment?.();
	await vi.waitFor(() => expect(reconnectComplete).toHaveBeenCalledOnce());
	expect(reconnectNext).toHaveBeenCalledWith(
		"Deployment completed successfully!",
	);
	expect(mocks.deployPostgres).toHaveBeenCalledTimes(1);

	const replayStream = await caller.deployWithLogs(input);
	const replayNext = vi.fn();
	const replayComplete = vi.fn();
	replayStream.subscribe({ next: replayNext, complete: replayComplete });
	await vi.waitFor(() => expect(replayComplete).toHaveBeenCalledOnce());
	expect(replayNext).toHaveBeenCalledWith("Deployment completed successfully!");
	expect(mocks.deployPostgres).toHaveBeenCalledTimes(1);
});

it("rejects a competing database deployment while one is active", async () => {
	let finishDeployment: (() => void) | undefined;
	mocks.deployPostgres.mockImplementation(
		async (_postgresId, _onData) =>
			new Promise<void>((resolve) => {
				finishDeployment = resolve;
			}),
	);
	const firstStream = await caller.deployWithLogs({
		operationId: "00000000-0000-4000-8000-000000000032",
		postgresId: "postgres-busy",
	});
	firstStream.subscribe({});
	await vi.waitFor(() => expect(mocks.deployPostgres).toHaveBeenCalledOnce());

	const competingStream = await caller.deployWithLogs({
		operationId: "00000000-0000-4000-8000-000000000033",
		postgresId: "postgres-busy",
	});
	const error = vi.fn();
	competingStream.subscribe({ error });

	await vi.waitFor(() =>
		expect(error).toHaveBeenCalledWith(
			expect.objectContaining({
				message: "A deployment is already running for this database",
			}),
		),
	);
	expect(mocks.deployPostgres).toHaveBeenCalledTimes(1);
	finishDeployment?.();
});

it("rejects reuse of a deployment operation ID for another database", async () => {
	mocks.deployPostgres.mockResolvedValue(undefined);
	const operationId = "00000000-0000-4000-8000-000000000034";
	const firstStream = await caller.deployWithLogs({
		operationId,
		postgresId: "postgres-original",
	});
	const complete = vi.fn();
	firstStream.subscribe({ complete });
	await vi.waitFor(() => expect(complete).toHaveBeenCalledOnce());

	const changedStream = await caller.deployWithLogs({
		operationId,
		postgresId: "postgres-changed",
	});
	const error = vi.fn();
	changedStream.subscribe({ error });

	await vi.waitFor(() =>
		expect(error).toHaveBeenCalledWith(
			expect.objectContaining({
				message:
					"This deployment operation ID was already used for a different request",
			}),
		),
	);
	expect(mocks.deployPostgres).toHaveBeenCalledTimes(1);
});

it("allows a new operation after the previous database deployment completes", async () => {
	mocks.deployPostgres.mockResolvedValue(undefined);
	for (const operationId of [
		"00000000-0000-4000-8000-000000000035",
		"00000000-0000-4000-8000-000000000036",
	]) {
		const stream = await caller.deployWithLogs({
			operationId,
			postgresId: "postgres-repeat",
		});
		const complete = vi.fn();
		stream.subscribe({ complete });
		await vi.waitFor(() => expect(complete).toHaveBeenCalledOnce());
	}

	expect(mocks.deployPostgres).toHaveBeenCalledTimes(2);
});

it("rejects invalid operation IDs before checking deployment access", async () => {
	await expect(
		caller.deployWithLogs({
			operationId: "x".repeat(65),
			postgresId: "postgres-invalid-operation",
		}),
	).rejects.toThrow();
	expect(mocks.checkServicePermissionAndAccess).not.toHaveBeenCalled();
});

it("does not let deployment history consume the restore operation quota", async () => {
	mocks.deployPostgres.mockResolvedValue(undefined);
	const quotaCaller = postgresRouter.createCaller({
		req: {} as never,
		res: {} as never,
		db: null as never,
		session: { activeOrganizationId: "org-quota" } as never,
		user: { id: "user-quota", role: "member" } as never,
	});
	await Promise.all(
		Array.from({ length: 100 }, async (_, index) => {
			const suffix = index.toString().padStart(6, "0");
			const stream = await quotaCaller.deployWithLogs({
				operationId: `deployment-${suffix}`,
				postgresId: `postgres-quota-${suffix}`,
			});
			await new Promise<void>((resolve, reject) => {
				stream.subscribe({ complete: resolve, error: reject });
			});
		}),
	);

	const restore = getOrCreateRestoreOperation({
		scope: "org-quota:user-quota",
		key: "database:restore-after-deployments",
		fingerprint: fingerprintRestoreInput({ backupFile: "backup.sql" }),
		resourceKey: "postgres:restore-after-deployments",
		run: async () => {},
	});
	await new Promise<void>((resolve) => {
		restore.subscribe(() => {}, resolve);
	});
});
