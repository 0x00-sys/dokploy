import { beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
	execAsync: vi.fn(),
	execAsyncRemote: vi.fn(),
}));

vi.mock("@dokploy/server/utils/process/execAsync", () => mocks);

import {
	removeService,
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
