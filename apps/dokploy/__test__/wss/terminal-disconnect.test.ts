import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
	canAccessTerminalOverWss: vi.fn(),
	clientConnect: vi.fn(),
	findServerById: vi.fn(),
	validateRequest: vi.fn(),
	wssHandlers: new Map<string, (...args: any[]) => unknown>(),
}));

vi.mock("@/server/wss/authorize", () => ({
	canAccessTerminalOverWss: mocks.canAccessTerminalOverWss,
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

vi.mock("@dokploy/server", () => ({
	execAsync: vi.fn(),
	findServerById: mocks.findServerById,
	IS_CLOUD: false,
	validateRequest: mocks.validateRequest,
}));

vi.mock("public-ip", () => ({ publicIpv4: vi.fn(), publicIpv6: vi.fn() }));
vi.mock("@/server/utils/docker", () => ({ getDockerHost: vi.fn() }));
vi.mock("@/server/wss/utils", () => ({ setupLocalServerSSHKey: vi.fn() }));

import { Client } from "ssh2";
import { setupTerminalWebSocketServer } from "@/server/wss/terminal";

const session = {
	user: { id: "user-1" },
	session: { activeOrganizationId: "org-1" },
};

describe("server terminal disconnects", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mocks.wssHandlers.clear();
		mocks.canAccessTerminalOverWss.mockResolvedValue(true);
		mocks.findServerById.mockResolvedValue({
			organizationId: "org-1",
			sshKeyId: "key-1",
		});
		mocks.validateRequest.mockResolvedValue(session);
	});

	const openTerminal = () => {
		setupTerminalWebSocketServer({ on: vi.fn() } as never);
		const socketHandlers = new Map<string, Array<() => void>>();
		const ws = {
			once: vi.fn((event: string, handler: () => void) => {
				const handlers = socketHandlers.get(event) ?? [];
				handlers.push(handler);
				socketHandlers.set(event, handlers);
			}),
			on: vi.fn(),
			send: vi.fn(),
			close: vi.fn(),
		};
		const connection = mocks.wssHandlers.get("connection")?.(ws, {
			url: "/terminal?serverId=server-1",
			headers: { host: "localhost" },
		});
		return {
			connection,
			disconnect: () => {
				for (const handler of socketHandlers.get("close") ?? []) handler();
			},
		};
	};

	it("does not create SSH after disconnecting during authentication", async () => {
		let resolveAuthentication!: (value: typeof session) => void;
		mocks.validateRequest.mockReturnValueOnce(
			new Promise((resolve) => {
				resolveAuthentication = resolve;
			}),
		);
		const { connection, disconnect } = openTerminal();

		disconnect();
		resolveAuthentication(session);
		await connection;

		expect(Client).not.toHaveBeenCalled();
		expect(mocks.clientConnect).not.toHaveBeenCalled();
	});

	it("does not create SSH after disconnecting during server lookup", async () => {
		let resolveServer!: (value: {
			organizationId: string;
			sshKeyId: string;
		}) => void;
		mocks.findServerById.mockReturnValueOnce(
			new Promise((resolve) => {
				resolveServer = resolve;
			}),
		);
		const { connection, disconnect } = openTerminal();
		await Promise.resolve();

		disconnect();
		resolveServer({ organizationId: "org-1", sshKeyId: "key-1" });
		await connection;

		expect(Client).not.toHaveBeenCalled();
		expect(mocks.clientConnect).not.toHaveBeenCalled();
	});
});
