import { beforeEach, describe, expect, it, vi } from "vitest";
import type { InMemoryJob } from "@/server/queues/in-memory-queue";
import type { DeploymentJob } from "@/server/queues/queue-types";

const mocks = vi.hoisted(() => ({
	deployApplication: vi.fn(),
	deployCompose: vi.fn(),
	deployPreviewApplication: vi.fn(),
	rebuildApplication: vi.fn(),
	rebuildCompose: vi.fn(),
	rebuildPreviewApplication: vi.fn(),
	updateApplicationStatus: vi.fn(),
	updateCompose: vi.fn(),
	updatePreviewDeployment: vi.fn(),
}));

vi.mock("@dokploy/server", () => mocks);

import { processDeploymentJob } from "@/server/queues/deployments-queue";

const createJob = (data: DeploymentJob): InMemoryJob => ({
	data,
	getState: () => Promise.resolve("active"),
	id: "job-1",
	name: "deployments",
	remove: () => Promise.resolve(),
	timestamp: Date.now(),
});

beforeEach(() => {
	vi.clearAllMocks();
	mocks.updateApplicationStatus.mockResolvedValue(undefined);
	mocks.updateCompose.mockResolvedValue(undefined);
	mocks.updatePreviewDeployment.mockResolvedValue(undefined);
});

describe("processDeploymentJob failure status", () => {
	it("marks an application as error and rejects the failed job", async () => {
		mocks.deployApplication.mockRejectedValue(new Error("deploy failed"));

		await expect(
			processDeploymentJob(
				createJob({
					applicationId: "app-1",
					applicationType: "application",
					descriptionLog: "",
					titleLog: "deploy",
					type: "deploy",
				}),
			),
		).rejects.toThrow("deploy failed");

		expect(mocks.updateApplicationStatus.mock.calls).toEqual([
			["app-1", "running"],
			["app-1", "error"],
		]);
	});

	it("marks a compose service as error and rejects the failed job", async () => {
		mocks.deployCompose.mockRejectedValue(new Error("compose failed"));

		await expect(
			processDeploymentJob(
				createJob({
					applicationType: "compose",
					composeId: "compose-1",
					descriptionLog: "",
					titleLog: "deploy",
					type: "deploy",
				}),
			),
		).rejects.toThrow("compose failed");

		expect(mocks.updateCompose.mock.calls).toEqual([
			["compose-1", { composeStatus: "running" }],
			["compose-1", { composeStatus: "error" }],
		]);
	});

	it("marks a preview as error and rejects the failed job", async () => {
		mocks.deployPreviewApplication.mockRejectedValue(
			new Error("preview failed"),
		);

		await expect(
			processDeploymentJob(
				createJob({
					applicationId: "app-1",
					applicationType: "application-preview",
					descriptionLog: "",
					previewDeploymentId: "preview-1",
					titleLog: "deploy",
					type: "deploy",
				}),
			),
		).rejects.toThrow("preview failed");

		expect(mocks.updatePreviewDeployment.mock.calls).toEqual([
			["preview-1", { previewStatus: "running" }],
			["preview-1", { previewStatus: "error" }],
		]);
	});

	it("preserves the deployment error when recording error status fails", async () => {
		const consoleError = vi
			.spyOn(console, "error")
			.mockImplementation(() => {});
		mocks.deployApplication.mockRejectedValue(new Error("deploy failed"));
		mocks.updateApplicationStatus
			.mockResolvedValueOnce(undefined)
			.mockRejectedValueOnce(new Error("status update failed"));

		try {
			await expect(
				processDeploymentJob(
					createJob({
						applicationId: "app-1",
						applicationType: "application",
						descriptionLog: "",
						titleLog: "deploy",
						type: "deploy",
					}),
				),
			).rejects.toThrow("deploy failed");

			expect(consoleError).toHaveBeenCalledWith(
				"Failed to record deployment job error status",
				expect.objectContaining({ message: "status update failed" }),
			);
		} finally {
			consoleError.mockRestore();
		}
	});
});
