import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
	const streams: Array<{
		writable: boolean;
		write: ReturnType<typeof vi.fn>;
		end: ReturnType<typeof vi.fn>;
	}> = [];

	return {
		streams,
		createWriteStream: vi.fn(() => {
			const stream = {
				writable: true,
				write: vi.fn(),
				end: vi.fn(),
			};
			streams.push(stream);
			return stream;
		}),
		findScheduleById: vi.fn(),
		createDeploymentSchedule: vi.fn(() =>
			Promise.resolve({
				deploymentId: "deployment-1",
				logPath: "/tmp/deployment.log",
			}),
		),
		updateDeployment: vi.fn(),
		updateDeploymentStatus: vi.fn(),
		getServiceContainer: vi.fn(() => Promise.resolve({ Id: "container-1" })),
		execAsyncRemote: vi.fn(
			(_serverId: string, _command: string, _onData?: (data: string) => void) =>
				Promise.resolve(),
		),
		spawnAsync: vi.fn(() => Promise.resolve()),
	};
});

vi.mock("node:fs", () => ({
	createWriteStream: mocks.createWriteStream,
}));

vi.mock("@dokploy/server/constants", () => ({
	IS_CLOUD: false,
	paths: () => ({ SCHEDULES_PATH: "/tmp/schedules" }),
}));

vi.mock("@dokploy/server/services/deployment", () => ({
	createDeploymentSchedule: mocks.createDeploymentSchedule,
	updateDeployment: mocks.updateDeployment,
	updateDeploymentStatus: mocks.updateDeploymentStatus,
}));

vi.mock("@dokploy/server/services/schedule", () => ({
	findScheduleById: mocks.findScheduleById,
}));

vi.mock("node-schedule", () => ({
	scheduledJobs: {},
	scheduleJob: vi.fn(),
}));

vi.mock("@dokploy/server/utils/docker/utils", () => ({
	getComposeContainer: vi.fn(),
	getServiceContainer: mocks.getServiceContainer,
}));

vi.mock("@dokploy/server/utils/process/execAsync", () => ({
	execAsyncRemote: mocks.execAsyncRemote,
}));

vi.mock("@dokploy/server/utils/process/spawnAsync", () => ({
	spawnAsync: mocks.spawnAsync,
}));

import { runCommand } from "@dokploy/server/utils/schedules/utils";

describe("runCommand", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mocks.streams.length = 0;
	});

	it("closes the log stream after a successful local service command", async () => {
		mocks.findScheduleById.mockResolvedValue({
			application: { appName: "app", serverId: null },
			command: "echo ok",
			shellType: "sh",
			scheduleType: "application",
		});

		await runCommand("schedule-1");

		expect(mocks.streams).toHaveLength(1);
		expect(mocks.streams[0]?.end).toHaveBeenCalledOnce();
	});

	it("closes the log stream after a successful Dokploy server script", async () => {
		mocks.findScheduleById.mockResolvedValue({
			appName: "script",
			scheduleType: "dokploy-server",
		});

		await runCommand("schedule-1");

		expect(mocks.streams).toHaveLength(1);
		expect(mocks.streams[0]?.end).toHaveBeenCalledOnce();
	});

	it("closes the log stream when a Dokploy server script fails", async () => {
		mocks.findScheduleById.mockResolvedValue({
			appName: "script",
			scheduleType: "dokploy-server",
		});
		mocks.spawnAsync.mockRejectedValueOnce(new Error("script failed"));

		await expect(runCommand("schedule-1")).rejects.toThrow("script failed");

		expect(mocks.streams).toHaveLength(1);
		expect(mocks.streams[0]?.end).toHaveBeenCalledOnce();
	});

	it("preserves a remote script failure when piping output through tee", async () => {
		mocks.findScheduleById.mockResolvedValue({
			appName: "script",
			scheduleType: "server",
			serverId: "server-1",
		});

		await runCommand("schedule-1");

		const command = mocks.execAsyncRemote.mock.calls[0]?.[1];
		expect(command).toContain("bash -o pipefail -c");
	});
});
