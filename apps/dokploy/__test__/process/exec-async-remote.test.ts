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
});
