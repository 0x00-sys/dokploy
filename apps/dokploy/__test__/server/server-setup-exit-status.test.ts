import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
	createServerDeployment: vi.fn(() =>
		Promise.resolve({ deploymentId: "deployment-1" }),
	),
	findServerById: vi.fn(() =>
		Promise.resolve({
			serverId: "server-1",
			name: "Production",
			serverType: "server",
			command: "exit 7",
			ipAddress: "192.0.2.1",
			port: 22,
			username: "root",
			sshKeyId: "key-1",
			sshKey: { privateKey: "private-key" },
		}),
	),
	recreateDirectory: vi.fn(() => Promise.resolve()),
	updateDeploymentStatus: vi.fn(() => Promise.resolve()),
	updateServerById: vi.fn(() => Promise.resolve()),
}));

const sshMock = vi.hoisted(() => {
	let readyHandler: (() => void) | undefined;

	return {
		connect: vi.fn(() => queueMicrotask(() => readyHandler?.())),
		end: vi.fn(),
		exec: vi.fn(),
		setReadyHandler(handler: () => void) {
			readyHandler = handler;
		},
		reset() {
			readyHandler = undefined;
		},
	};
});

vi.mock("ssh2", () => ({
	Client: class {
		on() {
			return this;
		}

		once(event: string, handler: () => void) {
			if (event === "ready") sshMock.setReadyHandler(handler);
			return this;
		}

		connect() {
			sshMock.connect();
			return this;
		}

		exec(command: string, callback: (...args: unknown[]) => void) {
			sshMock.exec(command, callback);
		}

		end() {
			sshMock.end();
		}
	},
}));

vi.mock("@dokploy/server/constants", () => ({
	IS_CLOUD: false,
	paths: () => ({ LOGS_PATH: "/tmp/dokploy-logs" }),
}));

vi.mock("@dokploy/server/services/admin", () => ({
	getDokployUrl: vi.fn(),
}));

vi.mock("@dokploy/server/services/deployment", () => ({
	createServerDeployment: mocks.createServerDeployment,
	updateDeploymentStatus: mocks.updateDeploymentStatus,
}));

vi.mock("@dokploy/server/services/server", () => ({
	findServerById: mocks.findServerById,
	updateServerById: mocks.updateServerById,
}));

vi.mock("@dokploy/server/utils/filesystem/directory", () => ({
	recreateDirectory: mocks.recreateDirectory,
}));

vi.mock("@dokploy/server/setup/monitoring-setup", () => ({
	setupMonitoring: vi.fn(),
}));

const { serverSetup } = await import("@dokploy/server/setup/server-setup");

const createStream = () => {
	const handlers = new Map<string, (...args: unknown[]) => void>();
	const stream = {
		stderr: {
			on() {
				return this;
			},
		},
		on(event: string, handler: (...args: unknown[]) => void) {
			handlers.set(event, handler);
			return stream;
		},
		emit(event: string, ...args: unknown[]) {
			handlers.get(event)?.(...args);
		},
	};
	return stream;
};

beforeEach(() => {
	vi.clearAllMocks();
	sshMock.reset();
});

describe("serverSetup", () => {
	it("closes SSH when the setup command channel cannot be opened", async () => {
		sshMock.exec.mockImplementationOnce(
			(_command: string, callback: (error: Error) => void) =>
				callback(new Error("Unable to open command channel")),
		);
		const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});

		try {
			await serverSetup("server-1");

			expect(sshMock.end).toHaveBeenCalledOnce();
			expect(mocks.updateDeploymentStatus).toHaveBeenCalledWith(
				"deployment-1",
				"error",
			);
		} finally {
			consoleSpy.mockRestore();
		}
	});

	it("marks setup as failed when the remote command exits unsuccessfully", async () => {
		const stream = createStream();
		sshMock.exec.mockImplementationOnce(
			(
				_command: string,
				callback: (error: undefined, stream: unknown) => void,
			) => callback(undefined, stream),
		);
		const onData = vi.fn();
		const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});

		try {
			const setup = serverSetup("server-1", onData);
			await vi.waitFor(() => expect(sshMock.exec).toHaveBeenCalledOnce());

			stream.emit("exit", 7);
			stream.emit("close", 7);
			await setup;

			expect(mocks.updateDeploymentStatus).toHaveBeenCalledOnce();
			expect(mocks.updateDeploymentStatus).toHaveBeenCalledWith(
				"deployment-1",
				"error",
			);
			expect(onData).toHaveBeenCalledWith(
				expect.stringContaining("exited with code 7"),
			);
			expect(sshMock.end).toHaveBeenCalledOnce();
		} finally {
			consoleSpy.mockRestore();
		}
	});
});
