import { beforeEach, describe, expect, it, vi } from "vitest";

const sshMock = vi.hoisted(() => {
	let readyHandler: (() => void) | undefined;
	return {
		end: vi.fn(),
		exec: vi.fn(),
		setReadyHandler(handler: () => void) {
			readyHandler = handler;
		},
		connect() {
			queueMicrotask(() => readyHandler?.());
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

const [{ serverAudit }, { serverValidate }] = await Promise.all([
	import("@dokploy/server/setup/server-audit"),
	import("@dokploy/server/setup/server-validate"),
]);

beforeEach(() => {
	vi.clearAllMocks();
	sshMock.reset();
	sshMock.exec.mockImplementation(
		(_command: string, callback: (error: Error) => void) =>
			callback(new Error("Unable to open command channel")),
	);
});

describe("server diagnostics SSH cleanup", () => {
	it.each([
		["validate", serverValidate],
		["audit", serverAudit],
	])(
		"closes SSH when %s cannot open its command channel",
		async (_name, run) => {
			await expect(run("server-1")).rejects.toThrow(
				"Unable to open command channel",
			);
			expect(sshMock.end).toHaveBeenCalledOnce();
		},
	);
});
