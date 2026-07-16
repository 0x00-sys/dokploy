import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
	wssHandlers: new Map<string, (...args: any[]) => unknown>(),
	execAsync: vi.fn(),
	execAsyncRemote: vi.fn(),
	findServerById: vi.fn(),
	getLastAdvancedStatsFile: vi.fn(() => Promise.resolve({})),
	listContainers: vi.fn(),
	recordAdvancedStats: vi.fn<() => Promise<unknown>>(() => Promise.resolve()),
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
	docker: {
		listContainers: mocks.listContainers,
	},
	execAsync: mocks.execAsync.mockResolvedValue({
		stdout:
			'{"BlockIO":"0B / 0B","CPUPerc":"0%","Container":"app","ID":"container-1","MemPerc":"0%","MemUsage":"0B / 0B","Name":"app","NetIO":"0B / 0B"}',
		stderr: "",
	}),
	execAsyncRemote: mocks.execAsyncRemote,
	findServerById: mocks.findServerById,
	getHostSystemStats: vi.fn(),
	getLastAdvancedStatsFile: mocks.getLastAdvancedStatsFile,
	IS_CLOUD: false,
	recordAdvancedStats: mocks.recordAdvancedStats,
	validateRequest: mocks.validateRequest,
}));

import { setupDockerStatsMonitoringSocketServer } from "@/server/wss/docker-stats";

const flush = async () => {
	for (let i = 0; i < 10; i++) {
		await Promise.resolve();
	}
};

describe("Docker stats monitoring", () => {
	beforeEach(() => {
		vi.useFakeTimers();
		vi.clearAllMocks();
		mocks.wssHandlers.clear();
		mocks.findServerById.mockResolvedValue({ organizationId: "org-1" });
		mocks.validateRequest.mockResolvedValue({
			user: { id: "user-1" },
			session: { activeOrganizationId: "org-1" },
		});
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	it("does not overlap polls when Docker responds slowly", async () => {
		let resolveContainers!: (containers: unknown[]) => void;
		const containers = new Promise<unknown[]>((resolve) => {
			resolveContainers = resolve;
		});
		mocks.listContainers.mockReturnValue(containers);

		const server = { on: vi.fn() };
		setupDockerStatsMonitoringSocketServer(server as never);

		const socketHandlers = new Map<string, () => void>();
		const ws = {
			on: vi.fn((event: string, handler: () => void) => {
				socketHandlers.set(event, handler);
			}),
			send: vi.fn(),
			close: vi.fn(() => socketHandlers.get("close")?.()),
		};
		const connection = mocks.wssHandlers.get("connection");
		expect(connection).toBeDefined();
		await connection?.(ws, {
			url: "/listen-docker-stats-monitoring?appName=app&appType=docker-compose",
			headers: { host: "localhost" },
		});

		vi.advanceTimersByTime(1300);
		await flush();
		vi.advanceTimersByTime(3900);
		await flush();

		expect(mocks.listContainers).toHaveBeenCalledOnce();

		resolveContainers([{ Id: "container-1", State: "running" }]);
		await flush();
		vi.advanceTimersByTime(1300);
		await flush();

		expect(mocks.listContainers).toHaveBeenCalledTimes(2);
	});

	it("shares one poll across viewers of the same monitoring target", async () => {
		mocks.listContainers.mockResolvedValue([
			{ Id: "container-1", State: "running" },
		]);

		setupDockerStatsMonitoringSocketServer({ on: vi.fn() } as never);
		const connection = mocks.wssHandlers.get("connection");
		const sockets = Array.from({ length: 8 }, () => {
			const handlers = new Map<string, () => void>();
			return {
				handlers,
				ws: {
					on: vi.fn((event: string, handler: () => void) => {
						handlers.set(event, handler);
					}),
					send: vi.fn(),
					close: vi.fn(() => handlers.get("close")?.()),
				},
			};
		});

		await Promise.all(
			sockets.map(({ ws }) =>
				connection?.(ws, {
					url: "/listen-docker-stats-monitoring?appName=app&appType=docker-compose",
					headers: { host: "localhost" },
				}),
			),
		);

		expect(vi.getTimerCount()).toBe(1);
		vi.advanceTimersByTime(1300);
		await flush();

		expect(mocks.listContainers).toHaveBeenCalledOnce();
		for (const { ws } of sockets) {
			expect(ws.send).toHaveBeenCalledOnce();
		}

		for (const { handlers } of sockets.slice(0, -1)) {
			handlers.get("close")?.();
		}
		expect(vi.getTimerCount()).toBe(1);

		sockets.at(-1)?.handlers.get("close")?.();
		expect(vi.getTimerCount()).toBe(0);
	});

	it("does not start polling when the socket closes during authentication", async () => {
		let resolveAuthentication!: (value: {
			user: { id: string };
			session: { activeOrganizationId: string };
		}) => void;
		mocks.validateRequest.mockReturnValueOnce(
			new Promise((resolve) => {
				resolveAuthentication = resolve;
			}),
		);

		setupDockerStatsMonitoringSocketServer({ on: vi.fn() } as never);
		const socketHandlers = new Map<string, () => void>();
		const ws = {
			on: vi.fn((event: string, handler: () => void) => {
				socketHandlers.set(event, handler);
			}),
			send: vi.fn(),
			close: vi.fn(() => socketHandlers.get("close")?.()),
		};
		const connection = mocks.wssHandlers.get("connection")?.(ws, {
			url: "/listen-docker-stats-monitoring?appName=app&appType=application",
			headers: { host: "localhost" },
		});

		socketHandlers.get("close")?.();
		resolveAuthentication({
			user: { id: "user-1" },
			session: { activeOrganizationId: "org-1" },
		});
		await connection;

		vi.advanceTimersByTime(5200);
		await flush();

		expect(mocks.listContainers).not.toHaveBeenCalled();
		expect(vi.getTimerCount()).toBe(0);
	});

	it("collects stats from the selected remote server", async () => {
		mocks.listContainers.mockResolvedValue([]);
		mocks.execAsyncRemote.mockResolvedValueOnce({
			stdout:
				'{"BlockIO":"0B / 0B","CPUPerc":"0%","Container":"app","ID":"remote-container","MemPerc":"0%","MemUsage":"0B / 0B","Name":"app","NetIO":"0B / 0B"}',
			stderr: "",
		});

		const server = { on: vi.fn() };
		setupDockerStatsMonitoringSocketServer(server as never);

		const socketHandlers = new Map<string, () => void>();
		const ws = {
			on: vi.fn((event: string, handler: () => void) => {
				socketHandlers.set(event, handler);
			}),
			send: vi.fn(),
			close: vi.fn(() => socketHandlers.get("close")?.()),
		};
		const connection = mocks.wssHandlers.get("connection");
		await connection?.(ws, {
			url: "/listen-docker-stats-monitoring?appName=app&appType=application&serverId=server-1",
			headers: { host: "localhost" },
		});

		vi.advanceTimersByTime(1300);
		await flush();

		expect(mocks.findServerById).toHaveBeenCalledWith("server-1");
		expect(mocks.execAsyncRemote).toHaveBeenCalledOnce();
		expect(mocks.execAsyncRemote).toHaveBeenCalledWith(
			"server-1",
			expect.stringMatching(
				/docker ps .*com\.docker\.swarm\.service\.name=app.*docker stats/,
			),
		);
		expect(mocks.listContainers).not.toHaveBeenCalled();
		expect(ws.send).toHaveBeenCalledOnce();
	});

	it("sends the recorded sample without rereading stats history", async () => {
		const recordedSample = {
			cpu: { value: "1%", time: new Date() },
			memory: { value: { used: "1MiB", total: "2MiB" }, time: new Date() },
			block: { value: { readMb: "0B", writeMb: "0B" }, time: new Date() },
			network: { value: { inputMb: "0B", outputMb: "0B" }, time: new Date() },
			disk: null,
		};
		mocks.listContainers.mockResolvedValueOnce([
			{ Id: "container-1", State: "running" },
		]);
		mocks.recordAdvancedStats.mockResolvedValueOnce(recordedSample);

		setupDockerStatsMonitoringSocketServer({ on: vi.fn() } as never);
		const socketHandlers = new Map<string, () => void>();
		const ws = {
			on: vi.fn((event: string, handler: () => void) => {
				socketHandlers.set(event, handler);
			}),
			send: vi.fn(),
			close: vi.fn(() => socketHandlers.get("close")?.()),
		};
		await mocks.wssHandlers.get("connection")?.(ws, {
			url: "/listen-docker-stats-monitoring?appName=app&appType=application",
			headers: { host: "localhost" },
		});

		vi.advanceTimersByTime(1300);
		await flush();

		expect(mocks.getLastAdvancedStatsFile).not.toHaveBeenCalled();
		expect(ws.send).toHaveBeenCalledWith(
			JSON.stringify({ data: recordedSample }),
		);
	});

	it("selects local stack containers by their stack namespace", async () => {
		mocks.listContainers.mockResolvedValueOnce([
			{ Id: "container-1", State: "running" },
		]);

		const server = { on: vi.fn() };
		setupDockerStatsMonitoringSocketServer(server as never);

		const socketHandlers = new Map<string, () => void>();
		const ws = {
			on: vi.fn((event: string, handler: () => void) => {
				socketHandlers.set(event, handler);
			}),
			send: vi.fn(),
			close: vi.fn(() => socketHandlers.get("close")?.()),
		};
		const connection = mocks.wssHandlers.get("connection");
		await connection?.(ws, {
			url: "/listen-docker-stats-monitoring?appName=app&appType=stack",
			headers: { host: "localhost" },
		});

		vi.advanceTimersByTime(1300);
		await flush();

		expect(mocks.listContainers).toHaveBeenCalledWith({
			filters: JSON.stringify({
				status: ["running"],
				label: ["com.docker.stack.namespace=app"],
			}),
		});
	});

	it("selects remote stack containers by their stack namespace", async () => {
		mocks.execAsyncRemote.mockResolvedValueOnce({
			stdout:
				'{"BlockIO":"0B / 0B","CPUPerc":"0%","Container":"app","ID":"remote-container","MemPerc":"0%","MemUsage":"0B / 0B","Name":"app","NetIO":"0B / 0B"}',
			stderr: "",
		});

		const server = { on: vi.fn() };
		setupDockerStatsMonitoringSocketServer(server as never);

		const socketHandlers = new Map<string, () => void>();
		const ws = {
			on: vi.fn((event: string, handler: () => void) => {
				socketHandlers.set(event, handler);
			}),
			send: vi.fn(),
			close: vi.fn(() => socketHandlers.get("close")?.()),
		};
		const connection = mocks.wssHandlers.get("connection");
		await connection?.(ws, {
			url: "/listen-docker-stats-monitoring?appName=app&appType=stack&serverId=server-1",
			headers: { host: "localhost" },
		});

		vi.advanceTimersByTime(1300);
		await flush();

		expect(mocks.execAsyncRemote).toHaveBeenCalledWith(
			"server-1",
			expect.stringMatching(
				/docker ps .*com\.docker\.stack\.namespace=app.*docker stats/,
			),
		);
	});

	it("selects local Compose containers by their project label", async () => {
		mocks.listContainers.mockResolvedValueOnce([
			{ Id: "container-1", State: "running" },
		]);

		const server = { on: vi.fn() };
		setupDockerStatsMonitoringSocketServer(server as never);

		const socketHandlers = new Map<string, () => void>();
		const ws = {
			on: vi.fn((event: string, handler: () => void) => {
				socketHandlers.set(event, handler);
			}),
			send: vi.fn(),
			close: vi.fn(() => socketHandlers.get("close")?.()),
		};
		const connection = mocks.wssHandlers.get("connection");
		await connection?.(ws, {
			url: "/listen-docker-stats-monitoring?appName=app&appType=docker-compose",
			headers: { host: "localhost" },
		});

		vi.advanceTimersByTime(1300);
		await flush();

		expect(mocks.listContainers).toHaveBeenCalledWith({
			filters: JSON.stringify({
				status: ["running"],
				label: ["com.docker.compose.project=app"],
			}),
		});
	});

	it("selects remote Compose containers by their project label", async () => {
		mocks.execAsyncRemote.mockResolvedValueOnce({
			stdout:
				'{"BlockIO":"0B / 0B","CPUPerc":"0%","Container":"app","ID":"remote-container","MemPerc":"0%","MemUsage":"0B / 0B","Name":"app","NetIO":"0B / 0B"}',
			stderr: "",
		});

		const server = { on: vi.fn() };
		setupDockerStatsMonitoringSocketServer(server as never);

		const socketHandlers = new Map<string, () => void>();
		const ws = {
			on: vi.fn((event: string, handler: () => void) => {
				socketHandlers.set(event, handler);
			}),
			send: vi.fn(),
			close: vi.fn(() => socketHandlers.get("close")?.()),
		};
		const connection = mocks.wssHandlers.get("connection");
		await connection?.(ws, {
			url: "/listen-docker-stats-monitoring?appName=app&appType=docker-compose&serverId=server-1",
			headers: { host: "localhost" },
		});

		vi.advanceTimersByTime(1300);
		await flush();

		expect(mocks.execAsyncRemote).toHaveBeenCalledWith(
			"server-1",
			expect.stringMatching(
				/docker ps .*com\.docker\.compose\.project=app.*docker stats/,
			),
		);
	});

	it("rejects a remote server from another organization", async () => {
		mocks.findServerById.mockResolvedValue({ organizationId: "org-2" });
		const server = { on: vi.fn() };
		setupDockerStatsMonitoringSocketServer(server as never);

		const ws = {
			on: vi.fn(),
			send: vi.fn(),
			close: vi.fn(),
		};
		const connection = mocks.wssHandlers.get("connection");
		await connection?.(ws, {
			url: "/listen-docker-stats-monitoring?appName=app&serverId=server-2",
			headers: { host: "localhost" },
		});

		expect(ws.close).toHaveBeenCalledOnce();
		expect(mocks.execAsyncRemote).not.toHaveBeenCalled();
	});
});
