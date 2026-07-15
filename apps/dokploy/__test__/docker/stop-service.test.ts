import { beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
	execAsync: vi.fn(),
	execAsyncRemote: vi.fn(),
}));

vi.mock("@dokploy/server/utils/process/execAsync", () => mocks);

import {
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
