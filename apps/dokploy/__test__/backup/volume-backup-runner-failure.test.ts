import { beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
	backupVolume: vi.fn(),
	createDeploymentVolumeBackup: vi.fn(),
	execAsync: vi.fn(),
	findVolumeBackupById: vi.fn(),
	sendVolumeBackupNotifications: vi.fn(),
	updateDeploymentStatus: vi.fn(),
}));

vi.mock("@dokploy/server/services/deployment", async (importOriginal) => ({
	...(await importOriginal<
		typeof import("@dokploy/server/services/deployment")
	>()),
	createDeploymentVolumeBackup: mocks.createDeploymentVolumeBackup,
	updateDeploymentStatus: mocks.updateDeploymentStatus,
}));

vi.mock("@dokploy/server/services/volume-backups", async (importOriginal) => ({
	...(await importOriginal<
		typeof import("@dokploy/server/services/volume-backups")
	>()),
	findVolumeBackupById: mocks.findVolumeBackupById,
}));

vi.mock("@dokploy/server/utils/process/execAsync", async (importOriginal) => ({
	...(await importOriginal<
		typeof import("@dokploy/server/utils/process/execAsync")
	>()),
	execAsync: mocks.execAsync,
}));

vi.mock(
	"@dokploy/server/utils/volume-backups/backup",
	async (importOriginal) => ({
		...(await importOriginal<
			typeof import("@dokploy/server/utils/volume-backups/backup")
		>()),
		backupVolume: mocks.backupVolume,
	}),
);

vi.mock(
	"@dokploy/server/utils/notifications/volume-backup",
	async (importOriginal) => ({
		...(await importOriginal<
			typeof import("@dokploy/server/utils/notifications/volume-backup")
		>()),
		sendVolumeBackupNotifications: mocks.sendVolumeBackupNotifications,
	}),
);

import { runVolumeBackup } from "@dokploy/server/utils/volume-backups/utils";

beforeEach(() => {
	vi.clearAllMocks();
	mocks.findVolumeBackupById.mockResolvedValue({
		appName: "app-1",
		application: {
			environment: {
				project: { name: "project-1", organizationId: "org-1" },
			},
			serverId: null,
		},
		compose: null,
		keepLatestCount: 0,
		name: "volume-backup-1",
		serviceType: "application",
		volumeBackupId: "volume-backup-1",
		volumeName: "data",
	});
	mocks.createDeploymentVolumeBackup.mockResolvedValue({
		deploymentId: "deployment-1",
		logPath: "/tmp/volume-backup.log",
	});
	mocks.execAsync.mockResolvedValue({ stdout: "", stderr: "" });
	mocks.sendVolumeBackupNotifications.mockResolvedValue(undefined);
	mocks.updateDeploymentStatus.mockResolvedValue(undefined);
});

it("rejects after recording a failed volume backup", async () => {
	const failure = new Error("backup failed");
	mocks.backupVolume.mockRejectedValue(failure);

	await expect(runVolumeBackup("volume-backup-1")).rejects.toBe(failure);
	expect(mocks.updateDeploymentStatus).toHaveBeenCalledWith(
		"deployment-1",
		"error",
	);
});
