import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
	createDeploymentSchedule: vi.fn(),
	execAsyncRemote: vi.fn(),
	findScheduleById: vi.fn(),
	getComposeContainer: vi.fn(),
	getServiceContainer: vi.fn(),
	spawnAsync: vi.fn(),
	updateDeployment: vi.fn(),
	updateDeploymentStatus: vi.fn(),
}));

vi.mock("@dokploy/server/services/deployment", () => ({
	createDeploymentSchedule: mocks.createDeploymentSchedule,
	updateDeployment: mocks.updateDeployment,
	updateDeploymentStatus: mocks.updateDeploymentStatus,
}));

vi.mock("@dokploy/server/services/schedule", () => ({
	findScheduleById: mocks.findScheduleById,
}));

vi.mock("@dokploy/server/utils/docker/utils", () => ({
	getComposeContainer: mocks.getComposeContainer,
	getServiceContainer: mocks.getServiceContainer,
}));

vi.mock("@dokploy/server/utils/process/execAsync", () => ({
	execAsyncRemote: mocks.execAsyncRemote,
}));

vi.mock("@dokploy/server/utils/process/spawnAsync", () => ({
	spawnAsync: mocks.spawnAsync,
}));

import {
	runCommand,
	ScheduleRunError,
} from "@dokploy/server/utils/schedules/utils";

const composeSchedule = {
	application: null,
	command: "echo schedule_probe_ok",
	shellType: "sh",
	scheduleType: "compose",
	compose: { serverId: null },
	serviceName: "api",
	appName: "compose-app",
	serverId: null,
};

describe("runCommand result metadata", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mocks.findScheduleById.mockResolvedValue(composeSchedule);
		mocks.createDeploymentSchedule.mockResolvedValue({
			deploymentId: "deployment-1",
			logPath: "/tmp/schedule.log",
		});
		mocks.updateDeploymentStatus.mockResolvedValue(undefined);
	});

	it("returns the created deployment identity on success", async () => {
		mocks.findScheduleById.mockResolvedValue({
			...composeSchedule,
			compose: { serverId: "server-1" },
		});
		mocks.getComposeContainer.mockResolvedValue({ Id: "container-1" });
		mocks.execAsyncRemote.mockResolvedValue({ stdout: "", stderr: "" });

		await expect(runCommand("schedule-1")).resolves.toEqual({
			scheduleId: "schedule-1",
			deploymentId: "deployment-1",
			status: "done",
		});
		expect(mocks.updateDeploymentStatus).toHaveBeenCalledWith(
			"deployment-1",
			"done",
		);
		const remoteCommand = mocks.execAsyncRemote.mock.calls[0]?.[1];
		expect(remoteCommand).toContain(
			"docker exec container-1 sh -c 'echo schedule_probe_ok'",
		);
		expect(remoteCommand).toContain("|| {");
		expect(remoteCommand).toContain("exit 1;");
	});

	it("fails before docker exec and preserves deployment metadata", async () => {
		mocks.getComposeContainer.mockResolvedValue(undefined);

		const error = await runCommand("schedule-1").catch((cause) => cause);

		expect(error).toBeInstanceOf(ScheduleRunError);
		expect(error.result).toEqual({
			scheduleId: "schedule-1",
			deploymentId: "deployment-1",
			status: "error",
			message: 'No running container found for compose service "api"',
		});
		expect(mocks.execAsyncRemote).not.toHaveBeenCalled();
		expect(mocks.spawnAsync).not.toHaveBeenCalled();
		expect(mocks.updateDeploymentStatus).toHaveBeenCalledWith(
			"deployment-1",
			"error",
		);
	});

	it("does not report a completed command as failed when saving done fails", async () => {
		mocks.findScheduleById.mockResolvedValue({
			...composeSchedule,
			compose: { serverId: "server-1" },
		});
		mocks.getComposeContainer.mockResolvedValue({ Id: "container-1" });
		mocks.execAsyncRemote.mockResolvedValue({ stdout: "", stderr: "" });
		mocks.updateDeploymentStatus.mockRejectedValueOnce(
			new Error("status storage unavailable"),
		);

		await expect(runCommand("schedule-1")).resolves.toEqual({
			scheduleId: "schedule-1",
			deploymentId: "deployment-1",
			status: "done",
			warning:
				"Command completed, but its deployment status could not be saved.",
		});
		expect(mocks.updateDeploymentStatus).toHaveBeenCalledOnce();
		expect(mocks.updateDeploymentStatus).toHaveBeenCalledWith(
			"deployment-1",
			"done",
		);
	});

	it("preserves command failure metadata when saving error fails", async () => {
		mocks.getComposeContainer.mockResolvedValue(undefined);
		mocks.updateDeploymentStatus.mockRejectedValueOnce(
			new Error("status storage unavailable"),
		);

		const error = await runCommand("schedule-1").catch((cause) => cause);

		expect(error).toBeInstanceOf(ScheduleRunError);
		expect(error.result).toEqual({
			scheduleId: "schedule-1",
			deploymentId: "deployment-1",
			status: "error",
			message: 'No running container found for compose service "api"',
			warning: "Command failed, but its deployment status could not be saved.",
		});
	});
});
