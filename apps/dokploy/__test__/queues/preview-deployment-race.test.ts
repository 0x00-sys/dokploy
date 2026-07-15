import { beforeEach, expect, it, vi } from "vitest";

const server = vi.hoisted(() => ({
	deployApplication: vi.fn(),
	deployCompose: vi.fn(),
	deployPreviewApplication: vi.fn(),
	previewDeploymentExists: vi.fn(),
	rebuildApplication: vi.fn(),
	rebuildCompose: vi.fn(),
	rebuildPreviewApplication: vi.fn(),
	updateApplicationStatus: vi.fn(),
	updateCompose: vi.fn(),
	updatePreviewDeployment: vi.fn(),
}));

vi.mock("@dokploy/server", () => server);

import { processDeploymentJob } from "@/server/queues/deployments-queue";

beforeEach(() => {
	vi.clearAllMocks();
});

it("skips a queued preview after its pull request was closed", async () => {
	server.previewDeploymentExists.mockResolvedValue(false);

	await processDeploymentJob({
		data: {
			applicationType: "application-preview",
			applicationId: "application-1",
			previewDeploymentId: "preview-1",
			type: "deploy",
			titleLog: "Preview Deployment",
			descriptionLog: "",
			server: false,
		},
	} as never);

	expect(server.updatePreviewDeployment).not.toHaveBeenCalled();
	expect(server.deployPreviewApplication).not.toHaveBeenCalled();
});
