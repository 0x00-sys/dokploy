import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
	wssHandlers: new Map<string, (...args: any[]) => unknown>(),
	findServerById: vi.fn(),
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
	validateRequest: vi.fn(() =>
		Promise.resolve({
			user: { id: "user-1" },
			session: { activeOrganizationId: "org-1" },
		}),
	),
}));

vi.mock("node-pty", () => ({ spawn: vi.fn() }));
vi.mock("ssh2", () => ({ Client: vi.fn() }));

import { setupDockerContainerLogsWebSocketServer } from "@/server/wss/docker-container-logs";

describe("container log sockets", () => {
	beforeEach(() => {
		vi.useFakeTimers();
		vi.clearAllMocks();
		mocks.wssHandlers.clear();
	});

	afterEach(() => vi.useRealTimers());

	const connect = async () => {
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
		await mocks.wssHandlers.get("connection")?.(ws, {
			url: "/docker-container-logs?containerId=abc123&serverId=server-1",
			headers: { host: "localhost" },
		});
		return ws;
	};

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
