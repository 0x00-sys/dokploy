import { beforeEach, describe, expect, it, vi } from "vitest";

const sshMock = vi.hoisted(() => {
	let readyHandler: (() => void) | undefined;
	return {
		end: vi.fn(),
		exec: vi.fn(),
		connect: vi.fn(() => {
			queueMicrotask(() => readyHandler?.());
		}),
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

		exec(command: string, callback: (error?: Error) => void) {
			sshMock.exec(command, callback);
		}

		end() {
			sshMock.end();
		}
	},
}));

vi.mock("@dokploy/server/services/server", () => ({
	findServerById: vi.fn(() =>
		Promise.resolve({
			serverId: "server-1",
			ipAddress: "192.0.2.1",
			port: 22,
			username: "root",
			sshKeyId: "key-1",
			sshKey: { privateKey: "private-key" },
		}),
	),
}));

const { execAsyncRemote } = await import(
	"@dokploy/server/utils/process/execAsync"
);

beforeEach(() => {
	vi.clearAllMocks();
	sshMock.reset();
});

const createStream = () => {
	const handlers = new Map<string, (...args: unknown[]) => void>();
	const stderrHandlers = new Map<string, (...args: unknown[]) => void>();
	const stream = {
		stderr: {
			on(event: string, handler: (...args: unknown[]) => void) {
				stderrHandlers.set(event, handler);
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
		emitStderr(event: string, ...args: unknown[]) {
			stderrHandlers.get(event)?.(...args);
		},
	};
	return stream;
};

describe("execAsyncRemote", () => {
	it("closes the SSH connection when opening the command channel fails", async () => {
		sshMock.exec.mockImplementationOnce(
			(_command: string, callback: (error?: Error) => void) => {
				callback(new Error("Unable to open command channel"));
			},
		);

		await expect(execAsyncRemote("server-1", "docker ps")).rejects.toThrow(
			"Unable to open command channel",
		);
		expect(sshMock.end).toHaveBeenCalledOnce();
	});

	it("bounds captured output while streaming the full remote command", async () => {
		const output = "x".repeat(2 * 1024 * 1024);
		const stream = createStream();
		sshMock.exec.mockImplementationOnce(
			(
				_command: string,
				callback: (error: undefined, channel: typeof stream) => void,
			) => {
				callback(undefined, stream);
				stream.emit("data", output);
				stream.emitStderr("data", output);
				stream.emit("close", 0, "");
			},
		);
		let streamedBytes = 0;

		const result = await execAsyncRemote(
			"server-1",
			"docker pull image",
			(data) => {
				streamedBytes += Buffer.byteLength(data);
			},
		);

		expect(streamedBytes).toBe(4 * 1024 * 1024);
		expect(result.stdout).toHaveLength(1024 * 1024);
		expect(result.stderr).toHaveLength(1024 * 1024);
	});

	it("preserves complete remote output when no stream callback is used", async () => {
		const output = "x".repeat(2 * 1024 * 1024);
		const stream = createStream();
		sshMock.exec.mockImplementationOnce(
			(
				_command: string,
				callback: (error: undefined, channel: typeof stream) => void,
			) => {
				callback(undefined, stream);
				stream.emit("data", output);
				stream.emit("close", 0, "");
			},
		);

		const result = await execAsyncRemote("server-1", "cat large-file");

		expect(result.stdout).toHaveLength(2 * 1024 * 1024);
	});
});
