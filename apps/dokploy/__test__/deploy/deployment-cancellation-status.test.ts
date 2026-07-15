import { beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
	audit: vi.fn(),
	cancelDeployment: vi.fn(),
	checkServicePermissionAndAccess: vi.fn(),
	cleanQueuesByApplication: vi.fn(),
	cleanQueuesByCompose: vi.fn(),
	findApplicationById: vi.fn(),
	findComposeById: vi.fn(),
	updateApplicationStatus: vi.fn(),
	updateCompose: vi.fn(),
	updateDeploymentStatus: vi.fn(),
}));

vi.mock("@dokploy/server", async (importOriginal) => ({
	...(await importOriginal<typeof import("@dokploy/server")>()),
	IS_CLOUD: true,
	findApplicationById: mocks.findApplicationById,
	findComposeById: mocks.findComposeById,
	updateApplicationStatus: mocks.updateApplicationStatus,
	updateCompose: mocks.updateCompose,
	updateDeploymentStatus: mocks.updateDeploymentStatus,
}));

vi.mock("@dokploy/server/services/permission", async (importOriginal) => ({
	...(await importOriginal<
		typeof import("@dokploy/server/services/permission")
	>()),
	checkServicePermissionAndAccess: mocks.checkServicePermissionAndAccess,
}));

vi.mock("@/server/api/utils/audit", () => ({ audit: mocks.audit }));

vi.mock("@/server/queues/queueSetup", () => ({
	cleanQueuesByApplication: mocks.cleanQueuesByApplication,
	cleanQueuesByCompose: mocks.cleanQueuesByCompose,
	killDockerBuild: vi.fn(),
	myQueue: { add: vi.fn() },
}));

vi.mock("@/server/utils/deploy", () => ({
	cancelDeployment: mocks.cancelDeployment,
	deploy: vi.fn(),
}));

import { applicationRouter } from "@/server/api/routers/application";
import { composeRouter } from "@/server/api/routers/compose";

const context = {
	req: {} as never,
	res: {} as never,
	db: null as never,
	session: { activeOrganizationId: "org-1" } as never,
	user: { id: "user-1", role: "member" } as never,
};

beforeEach(() => {
	vi.clearAllMocks();
	mocks.cancelDeployment.mockResolvedValue({ success: true });
	mocks.checkServicePermissionAndAccess.mockResolvedValue(undefined);
	mocks.findApplicationById.mockResolvedValue({
		applicationId: "application-1",
		appName: "app-1",
		serverId: "server-1",
		deployments: [{ deploymentId: "application-deployment" }],
	});
	mocks.findComposeById.mockResolvedValue({
		composeId: "compose-1",
		appName: "compose-1",
		name: "Compose",
		serverId: "server-1",
		deployments: [{ deploymentId: "compose-deployment" }],
	});
});

it("records cancelled application deployments as cancelled", async () => {
	await applicationRouter
		.createCaller(context)
		.cancelDeployment({ applicationId: "application-1" });

	expect(mocks.updateDeploymentStatus).toHaveBeenCalledWith(
		"application-deployment",
		"cancelled",
	);
});

it("records cancelled compose deployments as cancelled", async () => {
	await composeRouter
		.createCaller(context)
		.cancelDeployment({ composeId: "compose-1" });

	expect(mocks.updateDeploymentStatus).toHaveBeenCalledWith(
		"compose-deployment",
		"cancelled",
	);
});

it("requires cancellation permission to clear application deployment queues", async () => {
	await applicationRouter
		.createCaller(context)
		.cleanQueues({ applicationId: "application-1" });

	expect(mocks.checkServicePermissionAndAccess).toHaveBeenCalledWith(
		context,
		"application-1",
		{ deployment: ["cancel"] },
	);
	expect(mocks.cleanQueuesByApplication).toHaveBeenCalledWith("application-1");
});

it("requires cancellation permission to clear compose deployment queues", async () => {
	await composeRouter
		.createCaller(context)
		.cleanQueues({ composeId: "compose-1" });

	expect(mocks.checkServicePermissionAndAccess).toHaveBeenCalledWith(
		context,
		"compose-1",
		{ deployment: ["cancel"] },
	);
	expect(mocks.cleanQueuesByCompose).toHaveBeenCalledWith("compose-1");
});

it("does not record an application cancellation when the deploy server rejects it", async () => {
	mocks.cancelDeployment.mockRejectedValueOnce(
		new Error("Cancellation failed"),
	);

	await expect(
		applicationRouter
			.createCaller(context)
			.cancelDeployment({ applicationId: "application-1" }),
	).rejects.toMatchObject({ message: "Cancellation failed" });

	expect(mocks.updateApplicationStatus).not.toHaveBeenCalled();
	expect(mocks.updateDeploymentStatus).not.toHaveBeenCalled();
});

it("does not record a compose cancellation when the deploy server rejects it", async () => {
	mocks.cancelDeployment.mockRejectedValueOnce(
		new Error("Cancellation failed"),
	);

	await expect(
		composeRouter
			.createCaller(context)
			.cancelDeployment({ composeId: "compose-1" }),
	).rejects.toMatchObject({ message: "Cancellation failed" });

	expect(mocks.updateCompose).not.toHaveBeenCalled();
	expect(mocks.updateDeploymentStatus).not.toHaveBeenCalled();
});
