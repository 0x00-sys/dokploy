import { beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
	clientConnect: vi.fn(),
	findServerById: vi.fn(),
	spawn: vi.fn(),
	validateRequest: vi.fn(),
	wssHandlers: new Map<string, (...args: any[]) => unknown>(),
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

vi.mock("node:child_process", () => ({ spawn: mocks.spawn }));
vi.mock("ssh2", () => ({
	Client: vi.fn(function Client() {
		return {
			on: vi.fn().mockReturnThis(),
			connect: mocks.clientConnect,
			end: vi.fn(),
		};
	}),
}));

vi.mock("@dokploy/server", () => ({
	findServerById: mocks.findServerById,
	IS_CLOUD: false,
	validateRequest: mocks.validateRequest,
}));
vi.mock("@dokploy/server/utils/docker/utils", () => ({
	encodeBase64: vi.fn((value: string) => value),
}));
vi.mock("@dokploy/server/wss/utils", () => ({
	readValidDirectory: vi.fn(() => true),
}));

import { setupDeploymentLogsWebSocketServer } from "@/server/wss/listen-deployment";

const session = {
	user: { id: "user-1" },
	session: { activeOrganizationId: "org-1" },
};

beforeEach(() => {
	vi.clearAllMocks();
	mocks.wssHandlers.clear();
	mocks.findServerById.mockResolvedValue({
		organizationId: "org-1",
		sshKeyId: "key-1",
	});
	mocks.spawn.mockReturnValue({
		exitCode: null,
		signalCode: null,
		stdout: { on: vi.fn() },
		stderr: { on: vi.fn() },
		on: vi.fn(),
		kill: vi.fn(),
	});
	mocks.validateRequest.mockResolvedValue(session);
});

const openLogStream = (url = "/listen-deployment?logPath=/tmp/build.log") => {
	setupDeploymentLogsWebSocketServer({ on: vi.fn() } as never);
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
			ws.readyState = 3;
			for (const handler of socketHandlers.get("close") ?? []) handler();
		},
	};
};

it("does not start local tailing after disconnecting during authentication", async () => {
	let resolveAuthentication!: (value: typeof session) => void;
	mocks.validateRequest.mockReturnValueOnce(
		new Promise((resolve) => {
			resolveAuthentication = resolve;
		}),
	);
	const { connection, disconnect } = openLogStream();

	disconnect();
	resolveAuthentication(session);
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
	const { connection, disconnect } = openLogStream(
		"/listen-deployment?logPath=/tmp/build.log&serverId=server-1",
	);
	await Promise.resolve();

	disconnect();
	resolveServer({ organizationId: "org-1", sshKeyId: "key-1" });
	await connection;

	expect(mocks.clientConnect).not.toHaveBeenCalled();
});
