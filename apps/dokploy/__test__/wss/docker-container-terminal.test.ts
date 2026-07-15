import { beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
	const wssHandlers = new Map<string, (...args: any[]) => unknown>();
	const findServerById = vi.fn();
	const spawn = vi.fn();
	const validateRequest = vi.fn();
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
		findServerById,
		spawn,
		stderr,
		stream,
		validateRequest,
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

vi.mock("node-pty", () => ({ spawn: mocks.spawn }));
vi.mock("@dokploy/server", () => ({
	findServerById: mocks.findServerById,
	IS_CLOUD: false,
	validateRequest: mocks.validateRequest,
}));

import { setupDockerContainerTerminalWebSocketServer } from "@/server/wss/docker-container-terminal";

beforeEach(() => {
	vi.clearAllMocks();
	mocks.wssHandlers.clear();
	mocks.findServerById.mockResolvedValue({
		organizationId: "org-1",
		sshKeyId: "key-1",
		sshKey: { privateKey: "private" },
		ipAddress: "127.0.0.1",
		port: 22,
		username: "root",
	});
	mocks.client.once.mockReturnValue(mocks.client);
	mocks.client.on.mockReturnValue(mocks.client);
	mocks.client.exec.mockImplementation((_command, _options, callback) => {
		callback(null, mocks.stream);
	});
	mocks.client.connect.mockReturnValue(mocks.client);
	mocks.spawn.mockReturnValue({
		onData: vi.fn(),
		kill: vi.fn(),
		write: vi.fn(),
	});
	mocks.stream.on.mockReturnValue(mocks.stream);
	mocks.validateRequest.mockResolvedValue({
		user: { id: "user-1" },
		session: { activeOrganizationId: "org-1" },
	});
});

const openSocket = (
	url = "/docker-container-terminal?containerId=abc123&serverId=server-1",
) => {
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
		send: vi.fn(),
		close: vi.fn(),
	};
	const connection = mocks.wssHandlers.get("connection")?.(ws, {
		url,
		headers: { host: "localhost" },
	});
	return {
		connection,
		disconnect: () => {
			for (const handler of socketHandlers.get("close") ?? []) handler();
		},
		ws,
	};
};

it("does not start a local terminal after disconnecting during authentication", async () => {
	let resolveAuthentication!: (value: {
		user: { id: string };
		session: { activeOrganizationId: string };
	}) => void;
	mocks.validateRequest.mockReturnValueOnce(
		new Promise((resolve) => {
			resolveAuthentication = resolve;
		}),
	);
	const { connection, disconnect } = openSocket(
		"/docker-container-terminal?containerId=abc123",
	);

	disconnect();
	resolveAuthentication({
		user: { id: "user-1" },
		session: { activeOrganizationId: "org-1" },
	});
	await connection;

	expect(mocks.spawn).not.toHaveBeenCalled();
});

it("does not connect SSH after disconnecting during server lookup", async () => {
	let resolveServer!: (value: {
		organizationId: string;
		sshKeyId: string;
	}) => void;
	mocks.findServerById.mockReturnValueOnce(
		new Promise((resolve) => {
			resolveServer = resolve;
		}),
	);
	const { connection, disconnect } = openSocket();
	await Promise.resolve();

	disconnect();
	resolveServer({ organizationId: "org-1", sshKeyId: "key-1" });
	await connection;

	expect(mocks.client.connect).not.toHaveBeenCalled();
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

it("closes the socket when remote terminal setup fails", async () => {
	mocks.findServerById.mockResolvedValueOnce({
		organizationId: "org-1",
		sshKeyId: null,
	});
	setupDockerContainerTerminalWebSocketServer({ on: vi.fn() } as never);
	const ws = {
		on: vi.fn(),
		once: vi.fn(),
		send: vi.fn(),
		close: vi.fn(),
		readyState: 1,
		OPEN: 1,
	};

	await mocks.wssHandlers.get("connection")?.(ws, {
		url: "/docker-container-terminal?containerId=abc123&serverId=server-1",
		headers: { host: "localhost" },
	});

	expect(ws.send).toHaveBeenCalledWith("No SSH key available for this server");
	expect(ws.close).toHaveBeenCalledOnce();
});
