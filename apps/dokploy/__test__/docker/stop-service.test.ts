import { spawnSync } from "node:child_process";
import { beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
	execAsync: vi.fn(),
	execAsyncRemote: vi.fn(),
}));

vi.mock("@dokploy/server/utils/process/execAsync", () => mocks);

import {
	removeService,
	startConfiguredService,
	startService,
	startServiceRemote,
	stopService,
	stopServiceRemote,
} from "@dokploy/server/utils/docker/utils";

beforeEach(() => vi.clearAllMocks());

it("propagates a local Docker stop failure", async () => {
	mocks.execAsync.mockRejectedValue(new Error("docker unavailable"));

	await expect(stopService("app")).rejects.toThrow("docker unavailable");
});

it("propagates a remote Docker stop failure", async () => {
	mocks.execAsyncRemote.mockRejectedValue(new Error("server unavailable"));

	await expect(stopServiceRemote("server-1", "app")).rejects.toThrow(
		"server unavailable",
	);
});

it("starts local and remote services with the requested replica count", async () => {
	mocks.execAsync.mockResolvedValue({ stdout: "", stderr: "" });
	mocks.execAsyncRemote.mockResolvedValue({ stdout: "", stderr: "" });

	await startService("app", 3);
	await startServiceRemote("server-1", "app", 4);

	expect(mocks.execAsync).toHaveBeenCalledWith("docker service scale app=3 ");
	expect(mocks.execAsyncRemote).toHaveBeenCalledWith(
		"server-1",
		"docker service scale app=4 ",
	);
});

it("starts configured services with their saved replica count", async () => {
	mocks.execAsync.mockResolvedValue({ stdout: "", stderr: "" });
	mocks.execAsyncRemote.mockResolvedValue({ stdout: "", stderr: "" });

	await startConfiguredService({
		appName: "local-app",
		serverId: null,
		replicas: 3,
		modeSwarm: null,
	});
	await startConfiguredService({
		appName: "remote-app",
		serverId: "server-1",
		replicas: 3,
		modeSwarm: { Replicated: { Replicas: 5 } },
	});

	expect(mocks.execAsync).toHaveBeenCalledWith(
		"docker service scale local-app=3 ",
	);
	expect(mocks.execAsyncRemote).toHaveBeenCalledWith(
		"server-1",
		"docker service scale remote-app=5 ",
	);
});

it("stops local and remote global services without scaling them", async () => {
	mocks.execAsync.mockResolvedValue({ stdout: "", stderr: "" });
	mocks.execAsyncRemote.mockResolvedValue({ stdout: "", stderr: "" });

	await stopService("local-app", { Global: {} });
	await stopServiceRemote("server-1", "remote-app", { Global: {} });

	expect(mocks.execAsync).toHaveBeenCalledWith(
		expect.stringContaining(
			'docker service update --detach=true --constraint-add "$constraint" local-app',
		),
	);
	expect(mocks.execAsync).toHaveBeenCalledWith(
		expect.stringContaining("node.id==dokploy-stopped-local-app"),
	);
	expect(mocks.execAsyncRemote).toHaveBeenCalledWith(
		"server-1",
		expect.stringContaining(
			'docker service update --detach=true --constraint-add "$constraint" remote-app',
		),
	);
});

it("starts local and remote global services by removing the stop constraint", async () => {
	mocks.execAsync.mockResolvedValue({ stdout: "", stderr: "" });
	mocks.execAsyncRemote.mockResolvedValue({ stdout: "", stderr: "" });

	await startConfiguredService({
		appName: "local-app",
		serverId: null,
		replicas: 1,
		modeSwarm: { Global: {} },
	});
	await startConfiguredService({
		appName: "remote-app",
		serverId: "server-1",
		replicas: 1,
		modeSwarm: { Global: {} },
	});

	expect(mocks.execAsync).toHaveBeenCalledWith(
		expect.stringContaining(
			'docker service update --constraint-rm "$constraint" local-app',
		),
	);
	expect(mocks.execAsyncRemote).toHaveBeenCalledWith(
		"server-1",
		expect.stringContaining(
			'docker service update --constraint-rm "$constraint" remote-app',
		),
	);
});

it("propagates a global service inspect failure instead of reporting success", async () => {
	mocks.execAsync.mockResolvedValue({ stdout: "", stderr: "" });

	await startConfiguredService({
		appName: "local-app",
		serverId: null,
		replicas: 1,
		modeSwarm: { Global: {} },
	});

	const command = mocks.execAsync.mock.calls[0]?.[0];
	expect(command).toEqual(expect.any(String));
	const result = spawnSync(
		"sh",
		[
			"-c",
			`docker() { return 42; }
${command}`,
		],
		{ encoding: "utf8" },
	);

	expect(result.status).toBe(42);
});

it("propagates a local Docker service removal failure", async () => {
	mocks.execAsync.mockRejectedValue(new Error("remove failed"));

	await expect(removeService("app")).rejects.toThrow("remove failed");
});

it("propagates a remote Docker service removal failure", async () => {
	mocks.execAsyncRemote.mockRejectedValue(new Error("remote remove failed"));

	await expect(removeService("app", "server-1")).rejects.toThrow(
		"remote remove failed",
	);
});
