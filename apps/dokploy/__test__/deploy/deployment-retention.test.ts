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

vi.mock("@dokploy/server/services/rollbacks", () => ({
	removeRollbackById: mocks.removeRollbackById,
}));

vi.mock("@dokploy/server/utils/process/execAsync", () => ({
	execAsync: mocks.execAsync,
	execAsyncRemote: mocks.execAsyncRemote,
}));

import { createDeployment } from "@dokploy/server/services/deployment";

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
