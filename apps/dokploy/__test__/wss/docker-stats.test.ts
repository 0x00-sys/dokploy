import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
	wssHandlers: new Map<string, (...args: any[]) => unknown>(),
	listContainers: vi.fn(),
	recordAdvancedStats: vi.fn(() => Promise.resolve()),
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
	execAsync: vi.fn(() =>
		Promise.resolve({
			stdout:
				'{"BlockIO":"0B / 0B","CPUPerc":"0%","Container":"app","ID":"container-1","MemPerc":"0%","MemUsage":"0B / 0B","Name":"app","NetIO":"0B / 0B"}',
			stderr: "",
		}),
	),
	getHostSystemStats: vi.fn(),
	getLastAdvancedStatsFile: vi.fn(() => Promise.resolve({})),
	IS_CLOUD: false,
	recordAdvancedStats: mocks.recordAdvancedStats,
	validateRequest: vi.fn(() =>
		Promise.resolve({
			user: { id: "user-1" },
			session: { activeOrganizationId: "org-1" },
		}),
	),
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
});
