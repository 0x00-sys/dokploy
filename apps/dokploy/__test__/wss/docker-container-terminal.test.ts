import { beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
	const wssHandlers = new Map<string, (...args: any[]) => unknown>();
	const stderr = {
		on: vi.fn(),
	};
	const stream = {
		on: vi.fn(),
		stderr,
		write: vi.fn(),
		end: vi.fn(),
	};
	const client = {
		once: vi.fn(),
		on: vi.fn(),
		exec: vi.fn(),
		connect: vi.fn(),
		end: vi.fn(),
	};
	return {
		client,
		stderr,
		stream,
		wssHandlers,
	};
});

vi.mock("ws", () => ({
	WebSocketServer: vi.fn(function WebSocketServer() {
		return {
			on: vi.fn((event: string, handler: (...args: any[]) => unknown) =>
				mocks.wssHandlers.set(event, handler),
			),
			handleUpgrade: vi.fn(),
			emit: vi.fn(),
		};
	}),
}));

vi.mock("ssh2", () => ({
	Client: vi.fn(function Client() {
		return mocks.client;
	}),
}));

vi.mock("node-pty", () => ({ spawn: vi.fn() }));
vi.mock("@dokploy/server", () => ({
	findServerById: vi.fn(() =>
		Promise.resolve({
			organizationId: "org-1",
			sshKeyId: "key-1",
			sshKey: { privateKey: "private" },
			ipAddress: "127.0.0.1",
			port: 22,
			username: "root",
		}),
	),
	IS_CLOUD: false,
	validateRequest: vi.fn(() =>
		Promise.resolve({
			user: { id: "user-1" },
			session: { activeOrganizationId: "org-1" },
		}),
	),
}));

import { setupDockerContainerTerminalWebSocketServer } from "@/server/wss/docker-container-terminal";

beforeEach(() => {
	vi.clearAllMocks();
	mocks.wssHandlers.clear();
	mocks.client.once.mockReturnValue(mocks.client);
	mocks.client.on.mockReturnValue(mocks.client);
	mocks.client.exec.mockImplementation((_command, _options, callback) => {
		callback(null, mocks.stream);
	});
	mocks.client.connect.mockReturnValue(mocks.client);
	mocks.stream.on.mockReturnValue(mocks.stream);
});

it("closes SSH when the socket disconnects before SSH is ready", async () => {
	setupDockerContainerTerminalWebSocketServer({ on: vi.fn() } as never);
	const socketHandlers = new Map<string, Array<() => void>>();
	const ws = {
		on: vi.fn((event: string, handler: () => void) => {
			const handlers = socketHandlers.get(event) ?? [];
			handlers.push(handler);
			socketHandlers.set(event, handlers);
		}),
		once: vi.fn((event: string, handler: () => void) => {
			const handlers = socketHandlers.get(event) ?? [];
			handlers.push(handler);
			socketHandlers.set(event, handlers);
		}),
	};
	await mocks.wssHandlers.get("connection")?.(ws, {
		url: "/docker-container-terminal?containerId=abc123&serverId=server-1",
		headers: { host: "localhost" },
	});

	for (const handler of socketHandlers.get("close") ?? []) handler();

	expect(mocks.client.end).toHaveBeenCalledOnce();
});

it("forwards each remote stdout chunk without making a retained copy", async () => {
	setupDockerContainerTerminalWebSocketServer({ on: vi.fn() } as never);
	const ws = {
		on: vi.fn(),
		once: vi.fn(),
		send: vi.fn(),
		close: vi.fn(),
	};
	await mocks.wssHandlers.get("connection")?.(ws, {
		url: "/docker-container-terminal?containerId=abc123&serverId=server-1",
		headers: { host: "localhost" },
	});

	const readyHandler = mocks.client.once.mock.calls.find(
		([event]) => event === "ready",
	)?.[1];
	readyHandler?.();
	const chunk = { toString: vi.fn(() => "terminal output") };
	const dataHandler = mocks.stream.on.mock.calls.find(
		([event]) => event === "data",
	)?.[1];
	dataHandler?.(chunk);

	expect(chunk.toString).toHaveBeenCalledOnce();
	expect(ws.send).toHaveBeenCalledWith("terminal output");
});
