import { beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
	const deleteChain = {
		where: vi.fn(),
		returning: vi.fn(),
	};
	deleteChain.where.mockReturnValue(deleteChain);
	deleteChain.returning.mockResolvedValue([]);

	const insertChain = {
		values: vi.fn(),
		returning: vi.fn(),
	};
	insertChain.values.mockReturnValue(insertChain);
	insertChain.returning.mockResolvedValue([
		{
			deploymentId: "new-deployment",
			logPath: "/var/lib/dokploy/logs/app/new.log",
		},
	]);

	return {
		deleteChain,
		insertChain,
		db: {
			delete: vi.fn(() => deleteChain),
			insert: vi.fn(() => insertChain),
			query: {
				deployments: {
					findMany: vi.fn(),
				},
			},
		},
		execAsync: vi.fn(),
		execAsyncRemote: vi.fn(),
		findApplicationById: vi.fn(),
		findPreviewDeploymentById: vi.fn(),
		findServerById: vi.fn(),
		removeRollbackById: vi.fn(),
	};
});

vi.mock("@dokploy/server/db", () => ({ db: mocks.db }));

vi.mock("@dokploy/server/services/application", () => ({
	findApplicationById: mocks.findApplicationById,
	updateApplicationStatus: vi.fn(),
}));

vi.mock("@dokploy/server/services/server", () => ({
	findServerById: mocks.findServerById,
}));

vi.mock("@dokploy/server/services/preview-deployment", () => ({
	findPreviewDeploymentById: mocks.findPreviewDeploymentById,
	updatePreviewDeployment: vi.fn(),
}));

vi.mock("@dokploy/server/services/rollbacks", () => ({
	removeRollbackById: mocks.removeRollbackById,
}));

vi.mock("@dokploy/server/utils/process/execAsync", () => ({
	execAsync: mocks.execAsync,
	execAsyncRemote: mocks.execAsyncRemote,
}));

import {
	createDeployment,
	createDeploymentPreview,
	removeDeploymentsByPreviewDeploymentId,
} from "@dokploy/server/services/deployment";

beforeEach(() => {
	vi.clearAllMocks();
	mocks.deleteChain.returning.mockResolvedValue([]);
	mocks.findApplicationById.mockResolvedValue({
		applicationId: "application-1",
		appName: "app-1",
		serverId: "runtime-server",
		buildServerId: "build-server",
	});
	mocks.findServerById.mockResolvedValue({ serverId: "build-server" });
	mocks.findPreviewDeploymentById.mockResolvedValue({
		previewDeploymentId: "preview-1",
		appName: "preview-app",
		application: {
			serverId: "runtime-server",
			buildServerId: "build-server",
		},
	});
	mocks.execAsyncRemote.mockResolvedValue({ stdout: "", stderr: "" });
	mocks.db.query.deployments.findMany.mockResolvedValue(
		Array.from({ length: 11 }, (_, index) => ({
			deploymentId: `deployment-${index}`,
			logPath: `/var/lib/dokploy/logs/app-${index}.log`,
			rollbackId: null,
		})),
	);
});

it("removes retained deployment logs from the dedicated build server", async () => {
	await createDeployment({
		applicationId: "application-1",
		title: "Deployment",
		description: "",
	});

	const cleanupCall = mocks.execAsyncRemote.mock.calls.find(([, command]) =>
		command.includes("rm -rf"),
	);

	expect(cleanupCall?.[0]).toBe("build-server");
	expect(cleanupCall?.[1]).toContain("rm -rf /var/lib/dokploy/logs/app-10.log");
});

it("falls back to the runtime server when no build server is configured", async () => {
	mocks.findApplicationById.mockResolvedValue({
		applicationId: "application-1",
		appName: "app-1",
		serverId: "runtime-server",
		buildServerId: null,
	});
	mocks.findServerById.mockResolvedValue({ serverId: "runtime-server" });

	await createDeployment({
		applicationId: "application-1",
		title: "Deployment",
		description: "",
	});

	const cleanupCall = mocks.execAsyncRemote.mock.calls.find(([, command]) =>
		command.includes("rm -rf"),
	);

	expect(cleanupCall?.[0]).toBe("runtime-server");
});

it("records the build server that owns the deployment log", async () => {
	await createDeployment({
		applicationId: "application-1",
		title: "Deployment",
		description: "",
	});

	expect(mocks.insertChain.values).toHaveBeenCalledWith(
		expect.objectContaining({
			buildServerId: "build-server",
		}),
	);
	expect(mocks.insertChain.values.mock.calls[0]?.[0]).not.toHaveProperty(
		"serverId",
	);
});

it("records the runtime server when it owns the deployment log", async () => {
	mocks.findApplicationById.mockResolvedValue({
		applicationId: "application-1",
		appName: "app-1",
		serverId: "runtime-server",
		buildServerId: null,
	});
	mocks.findServerById.mockResolvedValue({ serverId: "runtime-server" });

	await createDeployment({
		applicationId: "application-1",
		title: "Deployment",
		description: "",
	});

	expect(mocks.insertChain.values).toHaveBeenCalledWith(
		expect.objectContaining({
			serverId: "runtime-server",
		}),
	);
});

it("stores preview deployment logs on the dedicated build server", async () => {
	await createDeploymentPreview({
		previewDeploymentId: "preview-1",
		title: "Preview deployment",
		description: "",
	});

	const initializeCall = mocks.execAsyncRemote.mock.calls.find(([, command]) =>
		command.includes("Initializing deployment"),
	);
	const cleanupCall = mocks.execAsyncRemote.mock.calls.find(([, command]) =>
		command.includes("rm -rf"),
	);
	expect(mocks.findServerById).toHaveBeenCalledWith("build-server");
	expect(initializeCall?.[0]).toBe("build-server");
	expect(cleanupCall?.[0]).toBe("build-server");
	expect(mocks.insertChain.values).toHaveBeenCalledWith(
		expect.objectContaining({ buildServerId: "build-server" }),
	);
	expect(mocks.insertChain.values.mock.calls.at(-1)?.[0]).not.toHaveProperty(
		"serverId",
	);
});

it("removes preview logs from build and legacy runtime servers", async () => {
	await removeDeploymentsByPreviewDeploymentId(
		{
			previewDeploymentId: "preview-1",
			appName: "preview-app",
		} as never,
		"build-server",
		"runtime-server",
	);

	expect(mocks.execAsyncRemote.mock.calls).toEqual(
		expect.arrayContaining([
			["build-server", expect.stringContaining("/logs/preview-app")],
			["runtime-server", expect.stringContaining("/logs/preview-app")],
		]),
	);
});

it("removes the oldest log before inserting an eleventh deployment", async () => {
	mocks.db.query.deployments.findMany.mockResolvedValue(
		Array.from({ length: 10 }, (_, index) => ({
			deploymentId: `deployment-${index}`,
			logPath: `/var/lib/dokploy/logs/app-${index}.log`,
			rollbackId: null,
		})),
	);

	await createDeployment({
		applicationId: "application-1",
		title: "Deployment",
		description: "",
	});

	const cleanupCall = mocks.execAsyncRemote.mock.calls.find(([, command]) =>
		command.includes("rm -rf"),
	);

	expect(cleanupCall?.[0]).toBe("build-server");
	expect(cleanupCall?.[1]).toContain("rm -rf /var/lib/dokploy/logs/app-9.log");
});

it("removes retained build-server logs in one SSH command", async () => {
	mocks.db.query.deployments.findMany.mockResolvedValue(
		Array.from({ length: 10 }, (_, index) => ({
			deploymentId: `deployment-${index}`,
			logPath: `/var/lib/dokploy/logs/app-${index}.log`,
			rollbackId: null,
		})),
	);
	mocks.deleteChain.returning.mockResolvedValue([
		{
			deploymentId: "deployment-9",
			logPath: "/var/lib/dokploy/logs/app-9.log",
			serverId: null,
			buildServerId: "build-server",
		},
	]);

	await createDeployment({
		applicationId: "application-1",
		title: "Deployment",
		description: "",
	});

	const cleanupCalls = mocks.execAsyncRemote.mock.calls.filter(([, command]) =>
		command.includes("rm -"),
	);

	expect(cleanupCalls).toHaveLength(1);
	expect(cleanupCalls[0]?.[0]).toBe("build-server");
	expect(cleanupCalls[0]?.[1]).toContain("/var/lib/dokploy/logs/app-9.log");
});

it("groups retained logs by the build server that created them", async () => {
	mocks.db.query.deployments.findMany.mockResolvedValue(
		Array.from({ length: 11 }, (_, index) => ({
			deploymentId: `deployment-${index}`,
			logPath: `/var/lib/dokploy/logs/app-${index}.log`,
			rollbackId: null,
			buildServerId:
				index === 9
					? "previous-build-server"
					: index === 10
						? "oldest-build-server"
						: null,
		})),
	);

	await createDeployment({
		applicationId: "application-1",
		title: "Deployment",
		description: "",
	});

	const cleanupCalls = mocks.execAsyncRemote.mock.calls.filter(([, command]) =>
		command.includes("rm -"),
	);

	expect(cleanupCalls).toEqual(
		expect.arrayContaining([
			[
				"previous-build-server",
				expect.stringContaining("/var/lib/dokploy/logs/app-9.log"),
			],
			[
				"oldest-build-server",
				expect.stringContaining("/var/lib/dokploy/logs/app-10.log"),
			],
		]),
	);
});

it("keeps a log when its deployment record could not be deleted", async () => {
	mocks.db.query.deployments.findMany.mockResolvedValue(
		Array.from({ length: 10 }, (_, index) => ({
			deploymentId: `deployment-${index}`,
			logPath: `/var/lib/dokploy/logs/app-${index}.log`,
			rollbackId: null,
		})),
	);
	mocks.deleteChain.returning.mockRejectedValue(
		new Error("database unavailable"),
	);
	const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});

	try {
		await createDeployment({
			applicationId: "application-1",
			title: "Deployment",
			description: "",
		});
	} finally {
		consoleError.mockRestore();
	}

	const cleanupCalls = mocks.execAsyncRemote.mock.calls.filter(([, command]) =>
		command.includes("rm -"),
	);
	expect(cleanupCalls).toHaveLength(0);
});
