import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
	end: vi.fn(),
	findServerById: vi.fn(),
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

vi.mock("ssh2", () => ({
	Client: class {
		private readyHandler?: () => void;

		on() {
			return this;
		}

		once(event: string, handler: () => void) {
			if (event === "ready") this.readyHandler = handler;
			return this;
		}

		connect() {
			this.readyHandler?.();
			return this;
		}

		shell(_options: unknown, callback: (error: Error) => void) {
			callback(new Error("Unable to open shell channel"));
		}

		end() {
			mocks.end();
		}
	},
}));

vi.mock("@dokploy/server", () => ({
	execAsync: vi.fn(),
	findServerById: mocks.findServerById,
	IS_CLOUD: false,
	validateRequest: vi.fn(() =>
		Promise.resolve({
			user: { id: "user-1" },
			session: { activeOrganizationId: "org-1" },
		}),
	),
}));

vi.mock("public-ip", () => ({ publicIpv4: vi.fn(), publicIpv6: vi.fn() }));
vi.mock("@/server/utils/docker", () => ({ getDockerHost: vi.fn() }));
vi.mock("@/server/wss/utils", () => ({ setupLocalServerSSHKey: vi.fn() }));

import { setupTerminalWebSocketServer } from "@/server/wss/terminal";

describe("SSH terminal", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mocks.wssHandlers.clear();
		mocks.findServerById.mockResolvedValue({
			organizationId: "org-1",
			ipAddress: "192.0.2.1",
			port: 22,
			username: "root",
			sshKeyId: "key-1",
			sshKey: { privateKey: "private-key" },
		});
	});

	it("closes the socket instead of throwing when the shell channel fails", async () => {
		setupTerminalWebSocketServer({ on: vi.fn() } as never);
		const ws = {
			once: vi.fn(),
			on: vi.fn(),
			send: vi.fn(),
			close: vi.fn(),
		};

		await expect(
			mocks.wssHandlers.get("connection")?.(ws, {
				url: "/terminal?serverId=server-1",
				headers: { host: "localhost" },
			}),
		).resolves.toBeUndefined();

		expect(ws.send).toHaveBeenCalledWith("Unable to open shell channel\n");
		expect(ws.close).toHaveBeenCalledOnce();
		expect(mocks.end).toHaveBeenCalledOnce();
	});
});
