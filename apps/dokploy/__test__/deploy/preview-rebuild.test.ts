import { db } from "@dokploy/server/db";
import { rebuildPreviewApplication } from "@dokploy/server/services/application";
import * as deploymentService from "@dokploy/server/services/deployment";
import * as githubService from "@dokploy/server/services/github";
import * as previewDeploymentService from "@dokploy/server/services/preview-deployment";
import * as builders from "@dokploy/server/utils/builders";
import * as execProcess from "@dokploy/server/utils/process/execAsync";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@dokploy/server/services/deployment", () => ({
	createDeploymentPreview: vi.fn(),
	updateDeploymentStatus: vi.fn(),
}));

vi.mock("@dokploy/server/services/github", () => ({
	createPreviewDeploymentComment: vi.fn(),
	getIssueComment: vi.fn(() => "preview status"),
	issueCommentExists: vi.fn(),
	updateIssueComment: vi.fn(),
}));

vi.mock("@dokploy/server/services/preview-deployment", () => ({
	findPreviewDeploymentById: vi.fn(),
	updatePreviewDeployment: vi.fn(),
}));

vi.mock("@dokploy/server/utils/builders", () => ({
	getBuildCommand: vi.fn(),
	mechanizeDockerContainer: vi.fn(),
}));

vi.mock("@dokploy/server/utils/process/execAsync", () => ({
	ExecError: class ExecError extends Error {},
	execAsync: vi.fn(),
	execAsyncRemote: vi.fn(),
}));

const application = {
	applicationId: "application-id",
	name: "Application",
	appName: "application",
	serverId: "runtime-server-id",
	buildServerId: "build-server-id",
	previewEnv: "",
	previewBuildArgs: "",
	previewBuildSecrets: "",
	environment: {
		env: "",
		project: { env: "" },
	},
};

const previewDeployment = {
	previewDeploymentId: "preview-id",
	appName: "preview-application",
	pullRequestNumber: 42,
	pullRequestCommentId: "123",
	branch: "feature",
	domain: { host: "preview.example.com" },
};

describe("rebuildPreviewApplication", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		vi.mocked(db.query.applications.findFirst).mockResolvedValue(
			application as never,
		);
		vi.mocked(
			previewDeploymentService.findPreviewDeploymentById,
		).mockResolvedValue(previewDeployment as never);
		vi.mocked(deploymentService.createDeploymentPreview).mockResolvedValue({
			deploymentId: "deployment-id",
			logPath: "/etc/dokploy/logs/preview-application/build.log",
		} as never);
		vi.mocked(githubService.issueCommentExists).mockResolvedValue(true);
		vi.mocked(builders.getBuildCommand).mockResolvedValue("docker build .");
		vi.mocked(execProcess.execAsyncRemote)
			.mockRejectedValueOnce(new Error("build failed"))
			.mockResolvedValueOnce({ stdout: "", stderr: "" });
	});

	it("writes a failed rebuild's error marker to the runtime server", async () => {
		await expect(
			rebuildPreviewApplication({
				applicationId: application.applicationId,
				titleLog: "Rebuild preview",
				descriptionLog: "",
				previewDeploymentId: previewDeployment.previewDeploymentId,
			}),
		).rejects.toThrow("build failed");

		expect(execProcess.execAsyncRemote).toHaveBeenNthCalledWith(
			1,
			application.serverId,
			expect.stringContaining("docker build ."),
		);
		expect(execProcess.execAsyncRemote).toHaveBeenNthCalledWith(
			2,
			application.serverId,
			expect.stringContaining("Error occurred"),
		);
	});
});
