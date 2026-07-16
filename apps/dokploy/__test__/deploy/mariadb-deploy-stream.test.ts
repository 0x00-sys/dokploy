import { beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
	checkServicePermissionAndAccess: vi.fn(),
	deployMariadb: vi.fn(),
}));

vi.mock("@dokploy/server", async (importOriginal) => ({
	...(await importOriginal<typeof import("@dokploy/server")>()),
	deployMariadb: mocks.deployMariadb,
}));

vi.mock("@dokploy/server/services/permission", async (importOriginal) => ({
	...(await importOriginal<
		typeof import("@dokploy/server/services/permission")
	>()),
	checkServicePermissionAndAccess: mocks.checkServicePermissionAndAccess,
}));

import { mariadbRouter } from "@/server/api/routers/mariadb";

const caller = mariadbRouter.createCaller({
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

it("completes the deployment log stream when MariaDB deployment finishes", async () => {
	mocks.deployMariadb.mockImplementation(async (_mariadbId, onData) => {
		onData?.("Deployment completed successfully!");
	});
	const stream = await caller.deployWithLogs({
		operationId: "00000000-0000-4000-8000-000000000040",
		mariadbId: "mariadb-success",
	});
	const complete = vi.fn();
	const next = vi.fn();

	stream.subscribe({ complete, next });

	await vi.waitFor(() => expect(complete).toHaveBeenCalledOnce());
	expect(next).toHaveBeenCalledWith("Deployment completed successfully!");
});

it("completes the deployment log stream after a MariaDB deployment failure", async () => {
	mocks.deployMariadb.mockImplementation(async (_mariadbId, onData) => {
		onData?.("Error: deployment failed");
		throw new Error("deployment failed");
	});
	const stream = await caller.deployWithLogs({
		operationId: "00000000-0000-4000-8000-000000000041",
		mariadbId: "mariadb-failure",
	});
	const complete = vi.fn();
	const next = vi.fn();

	stream.subscribe({ complete, next });

	await vi.waitFor(() => expect(complete).toHaveBeenCalledOnce());
	expect(next).toHaveBeenCalledWith("Error: deployment failed");
});
