import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
	wssHandlers: new Map<string, (...args: any[]) => unknown>(),
	clientConnect: vi.fn(),
	findServerById: vi.fn(),
	spawn: vi.fn(),
	validateRequest: vi.fn(),
}));

vi.mock("ws", () => ({
	WebSocketServer: vi.fn(function WebSocketServer() {
		return {
			on: vi.fn((event: string, handler: (...args: any[]) => unknown) => {
				mocks.wssHandlers.set(event, handler);
			}),
			handleUpgrade: vi.fn(),
			emit: vi.fn(),
		};
	}),
}));

vi.mock("@dokploy/server", () => ({
	findServerById: mocks.findServerById,
	IS_CLOUD: false,
	validateRequest: mocks.validateRequest,
}));

vi.mock("node-pty", () => ({ spawn: mocks.spawn }));
vi.mock("ssh2", () => ({
	Client: vi.fn(function Client() {
		return {
			on: vi.fn().mockReturnThis(),
			once: vi.fn().mockReturnThis(),
			connect: mocks.clientConnect,
			end: vi.fn(),
		};
	}),
}));

import { Client } from "ssh2";

import { setupDockerContainerLogsWebSocketServer } from "@/server/wss/docker-container-logs";

describe("container log sockets", () => {
	beforeEach(() => {
		vi.useFakeTimers();
		vi.clearAllMocks();
		mocks.wssHandlers.clear();
		mocks.spawn.mockReturnValue({
			onData: vi.fn(),
			kill: vi.fn(),
			write: vi.fn(),
		});
		mocks.validateRequest.mockResolvedValue({
			user: { id: "user-1" },
			session: { activeOrganizationId: "org-1" },
		});
	});

	afterEach(() => vi.useRealTimers());

	const openSocket = (
		url = "/docker-container-logs?containerId=abc123&serverId=server-1",
	) => {
		setupDockerContainerLogsWebSocketServer({ on: vi.fn() } as never);
		const socketHandlers = new Map<string, Array<() => void>>();
		const ws = {
			OPEN: 1,
			readyState: 1,
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
			ping: vi.fn(),
			send: vi.fn(),
			close: vi.fn(() => {
				ws.readyState = 3;
				for (const handler of socketHandlers.get("close") ?? []) handler();
			}),
		};
		const connection = mocks.wssHandlers.get("connection")?.(ws, {
			url,
			headers: { host: "localhost" },
		});
		return {
			connection,
			disconnect: () => {
				ws.readyState = 3;
				for (const handler of socketHandlers.get("close") ?? []) handler();
			},
			ws,
		};
	};

	const connect = async () => {
		const { connection, ws } = openSocket();
		await connection;
		return ws;
	};

	it("does not start local log resources after disconnecting during authentication", async () => {
		let resolveAuthentication!: (value: {
			user: { id: string };
			session: { activeOrganizationId: string };
		}) => void;
		mocks.validateRequest.mockReturnValueOnce(
			new Promise((resolve) => {
				resolveAuthentication = resolve;
			}),
		);
		const { connection, disconnect, ws } = openSocket(
			"/docker-container-logs?containerId=abc123",
		);

		disconnect();
		resolveAuthentication({
			user: { id: "user-1" },
			session: { activeOrganizationId: "org-1" },
		});
		await connection;
		vi.advanceTimersByTime(90_000);

		expect(mocks.spawn).not.toHaveBeenCalled();
		expect(ws.ping).not.toHaveBeenCalled();
		expect(vi.getTimerCount()).toBe(0);
	});

	it("does not open SSH after disconnecting during server lookup", async () => {
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

		expect(Client).not.toHaveBeenCalled();
		expect(mocks.clientConnect).not.toHaveBeenCalled();
		expect(vi.getTimerCount()).toBe(0);
	});

	it("closes the socket and keepalive when a remote server has no SSH key", async () => {
		mocks.findServerById.mockResolvedValue({
			organizationId: "org-1",
			sshKeyId: null,
		});

		const ws = await connect();

		expect(ws.close).toHaveBeenCalledOnce();
		expect(vi.getTimerCount()).toBe(0);
	});

	it("closes the socket and keepalive when remote setup fails", async () => {
		mocks.findServerById.mockRejectedValue(new Error("server unavailable"));

		const ws = await connect();

		expect(ws.close).toHaveBeenCalledOnce();
		expect(vi.getTimerCount()).toBe(0);
	});
});
