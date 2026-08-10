import * as execProcess from "@dokploy/server/utils/process/execAsync";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@dokploy/server/utils/process/execAsync", () => ({
	execAsync: vi.fn(),
	execAsyncRemote: vi.fn(),
}));

import {
	getContainers,
	getContainersByAppNameMatch,
} from "@dokploy/server/services/docker";

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

describe("getContainersByAppNameMatch", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("lists stack task containers across swarm nodes", async () => {
		vi.mocked(execProcess.execAsync).mockResolvedValue({
			stdout: [
				"TASK : task123 | Name: stack-app_web.1 | Node: worker-1 | CurrentState: Running 1 minute ago | Error:",
				"__DOKPLOY_DIVIDER__",
				"TASK : task123 | ContainerId: abcdef1234567890",
			].join("\n"),
			stderr: "",
		});

		await expect(
			getContainersByAppNameMatch("stack-app", "stack"),
		).resolves.toEqual([
			expect.objectContaining({
				containerId: "abcdef123456",
				node: "worker-1",
				state: "running",
			}),
		]);
		expect(execProcess.execAsync).toHaveBeenCalledWith(
			expect.stringContaining("docker stack ps stack-app"),
		);
		expect(execProcess.execAsync).not.toHaveBeenCalledWith(
			expect.stringContaining("grep"),
		);
	});

	it("preserves native container name matching when appType is omitted", async () => {
		vi.mocked(execProcess.execAsync).mockResolvedValue({
			stdout:
				"CONTAINER ID : native123 | Name: native-app | State: running | Status: Up 1 minute\n",
			stderr: "",
		});

		await expect(getContainersByAppNameMatch("native-app")).resolves.toEqual([
			expect.objectContaining({ containerId: "native123" }),
		]);
		expect(execProcess.execAsync).toHaveBeenCalledWith(
			expect.stringContaining("grep '^.*Name: native-app'"),
		);
	});
});
