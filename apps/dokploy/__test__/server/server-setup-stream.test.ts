import { beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
	checkPermission: vi.fn(),
	findServerById: vi.fn(),
	serverSetup: vi.fn(),
}));

vi.mock("@dokploy/server", async (importOriginal) => ({
	...(await importOriginal<typeof import("@dokploy/server")>()),
	findServerById: mocks.findServerById,
	serverSetup: mocks.serverSetup,
}));

vi.mock("@dokploy/server/services/permission", async (importOriginal) => ({
	...(await importOriginal<
		typeof import("@dokploy/server/services/permission")
	>()),
	checkPermission: mocks.checkPermission,
}));

import { serverRouter } from "@/server/api/routers/server";

const caller = serverRouter.createCaller({
	req: {} as never,
	res: {} as never,
	db: null as never,
	session: { activeOrganizationId: "org-1" } as never,
	user: { id: "user-1", role: "member" } as never,
});

beforeEach(() => {
	vi.clearAllMocks();
	mocks.checkPermission.mockResolvedValue(undefined);
	mocks.findServerById.mockResolvedValue({
		name: "server-1",
		organizationId: "org-1",
		serverId: "server-1",
	});
});

it("completes the server setup log stream when setup finishes", async () => {
	mocks.serverSetup.mockImplementation(async (_serverId, onData) => {
		onData?.("Setup Server: ✅");
	});
	const stream = await caller.setupWithLogs({ serverId: "server-1" });
	const complete = vi.fn();
	const next = vi.fn();

	stream.subscribe({ complete, next });

	await vi.waitFor(() => expect(complete).toHaveBeenCalledOnce());
	expect(next).toHaveBeenCalledWith("Setup Server: ✅");
});

it("reports server setup failures through the log stream", async () => {
	const failure = new Error("setup failed");
	mocks.serverSetup.mockRejectedValue(failure);
	const stream = await caller.setupWithLogs({ serverId: "server-1" });
	const error = vi.fn();

	stream.subscribe({ error });

	await vi.waitFor(() => expect(error).toHaveBeenCalledWith(failure));
});
