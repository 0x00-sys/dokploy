import * as execProcess from "@dokploy/server/utils/process/execAsync";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@dokploy/server/utils/process/execAsync", () => ({
	execAsync: vi.fn(),
	execAsyncRemote: vi.fn(),
}));

import { getContainers } from "@dokploy/server/services/docker";

describe("getContainers", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("returns an empty list when Docker reports no containers", async () => {
		vi.mocked(execProcess.execAsync).mockResolvedValue({
			stdout: "",
			stderr: "",
		});

		await expect(getContainers()).resolves.toEqual([]);
	});

	it("still parses containers from Docker output", async () => {
		vi.mocked(execProcess.execAsync).mockResolvedValue({
			stdout:
				"CONTAINER ID : abc123 | Name: app | Image: nginx:latest | Ports: 80/tcp | State: running | Status: Up 1 minute\n",
			stderr: "",
		});

		await expect(getContainers()).resolves.toEqual([
			{
				containerId: "abc123",
				name: "app",
				image: "nginx:latest",
				ports: "80/tcp",
				state: "running",
				status: "Up 1 minute",
				serverId: undefined,
			},
		]);
	});
});
