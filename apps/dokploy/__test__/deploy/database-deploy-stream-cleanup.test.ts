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

it("stops buffering database deployment logs after the subscription closes", async () => {
	let emitLog: ((log: string) => void) | undefined;
	mocks.deployPostgres.mockImplementation(async (_postgresId, onData) => {
		emitLog = onData;
		onData?.("initial log");
		await new Promise(() => {});
	});
	const stream = await caller.deployWithLogs({ postgresId: "postgres-1" });
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
