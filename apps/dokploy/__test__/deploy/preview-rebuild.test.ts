import { db } from "@dokploy/server/db";
import {
	deployPreviewApplication,
	rebuildPreviewApplication,
} from "@dokploy/server/services/application";
import * as deploymentService from "@dokploy/server/services/deployment";
import * as githubService from "@dokploy/server/services/github";
import * as previewDeploymentService from "@dokploy/server/services/preview-deployment";
import * as builders from "@dokploy/server/utils/builders";
import * as execProcess from "@dokploy/server/utils/process/execAsync";
import * as githubProvider from "@dokploy/server/utils/providers/github";
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
	previewDeploymentExists: vi.fn(),
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

vi.mock("@dokploy/server/utils/providers/github", () => ({
	cloneGithubRepository: vi.fn(),
}));

const application = {
	applicationId: "application-id",
	name: "Application",
	appName: "application",
	serverId: "runtime-server-id",
	buildServerId: "build-server-id",
	buildRegistry: { registryId: "build-registry-id" },
	sourceType: "github",
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

describe("preview application builds", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		application.appName = "application";
		application.buildRegistry = { registryId: "build-registry-id" };
		vi.mocked(db.query.applications.findFirst).mockResolvedValue(
			application as never,
		);
		vi.mocked(
			previewDeploymentService.findPreviewDeploymentById,
		).mockResolvedValue(previewDeployment as never);
		vi.mocked(
			previewDeploymentService.previewDeploymentExists,
		).mockResolvedValue(true);
		vi.mocked(deploymentService.createDeploymentPreview).mockResolvedValue({
			deploymentId: "deployment-id",
			logPath: "/etc/dokploy/logs/preview-application/build.log",
		} as never);
		vi.mocked(githubService.issueCommentExists).mockResolvedValue(true);
		vi.mocked(builders.getBuildCommand).mockResolvedValue("docker build .");
		vi.mocked(githubProvider.cloneGithubRepository).mockResolvedValue(
			"git clone repository;",
		);
		vi.mocked(execProcess.execAsyncRemote)
			.mockRejectedValueOnce(new Error("build failed"))
			.mockResolvedValueOnce({ stdout: "", stderr: "" });
	});

	it("runs an initial preview build on the dedicated build server", async () => {
		vi.mocked(execProcess.execAsyncRemote).mockReset();
		vi.mocked(execProcess.execAsyncRemote).mockResolvedValue({
			stdout: "",
			stderr: "",
		});

		await deployPreviewApplication({
			applicationId: application.applicationId,
			titleLog: "Preview deployment",
			descriptionLog: "",
			previewDeploymentId: previewDeployment.previewDeploymentId,
		});

		expect(execProcess.execAsyncRemote).toHaveBeenCalledWith(
			application.buildServerId,
			expect.stringContaining("git clone repository;docker build ."),
		);
		expect(githubProvider.cloneGithubRepository).toHaveBeenCalledWith(
			expect.objectContaining({ serverId: application.buildServerId }),
		);
		expect(builders.getBuildCommand).toHaveBeenCalledWith(
			expect.objectContaining({
				buildRegistry: application.buildRegistry,
			}),
		);
	});

	it("builds and writes errors on the dedicated build server", async () => {
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
			application.buildServerId,
			expect.stringContaining("docker build ."),
		);
		expect(execProcess.execAsyncRemote).toHaveBeenNthCalledWith(
			2,
			application.buildServerId,
			expect.stringContaining("Error occurred"),
		);
		expect(builders.getBuildCommand).toHaveBeenCalledWith(
			expect.objectContaining({
				buildRegistry: application.buildRegistry,
			}),
		);
	});
});
