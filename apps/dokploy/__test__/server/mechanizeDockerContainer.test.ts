import type { ApplicationNested } from "@dokploy/server/utils/builders";
import { mechanizeDockerContainer } from "@dokploy/server/utils/builders";
import { beforeEach, describe, expect, it, vi } from "vitest";

type MockCreateServiceOptions = {
	TaskTemplate?: {
		ContainerSpec?: {
			StopGracePeriod?: number;
			Ulimits?: Array<{ Name: string; Soft: number; Hard: number }>;
		};
		Placement?: { Constraints?: string[] };
	};
	[key: string]: unknown;
};

type MockServiceInspect = {
	Version: { Index: string };
	Spec: {
		TaskTemplate: { ForceUpdate: number };
		Mode?: {
			Replicated?: { Replicas?: number };
			Global?: Record<string, never>;
		};
	};
	UpdateStatus?: {
		State?:
			| "updating"
			| "paused"
			| "completed"
			| "rollback_started"
			| "rollback_paused"
			| "rollback_completed";
		StartedAt?: string;
		Message?: string;
	};
};

type MockListedService = {
	Spec?: { Name?: string };
	ServiceStatus?: { DesiredTasks?: number };
};

const {
	inspectMock,
	updateMock,
	getServiceMock,
	createServiceMock,
	listServicesMock,
	getRemoteDockerMock,
	infoMock,
} = vi.hoisted(() => {
	const inspect =
		vi.fn<
			(options?: { abortSignal?: AbortSignal }) => Promise<MockServiceInspect>
		>();
	const update = vi.fn<(opts: MockCreateServiceOptions) => Promise<void>>(
		async () => undefined,
	);
	const getService = vi.fn(() => ({ inspect, update }));
	const createService = vi.fn<
		(opts: MockCreateServiceOptions) => Promise<void>
	>(async () => undefined);
	const listServices = vi.fn<
		(options?: unknown) => Promise<MockListedService[]>
	>(async () => []);
	const info = vi.fn(async () => ({ Swarm: { NodeID: "node-123" } }));
	const getRemoteDocker = vi.fn(async () => ({
		getService,
		createService,
		listServices,
		info,
	}));
	return {
		inspectMock: inspect,
		updateMock: update,
		getServiceMock: getService,
		createServiceMock: createService,
		listServicesMock: listServices,
		getRemoteDockerMock: getRemoteDocker,
		infoMock: info,
	};
});

vi.mock("@dokploy/server/utils/servers/remote-docker", () => ({
	getRemoteDocker: getRemoteDockerMock,
}));

const createApplication = (
	overrides: Partial<ApplicationNested> = {},
): ApplicationNested =>
	({
		appName: "test-app",
		buildType: "dockerfile",
		env: null,
		mounts: [],
		cpuLimit: null,
		memoryLimit: null,
		memoryReservation: null,
		cpuReservation: null,
		command: null,
		ports: [],
		sourceType: "docker",
		dockerImage: "example:latest",
		registry: null,
		environment: {
			project: { env: null },
			env: null,
		},
		replicas: 1,
		stopGracePeriodSwarm: 0,
		ulimitsSwarm: null,
		serverId: "server-id",
		...overrides,
	}) as unknown as ApplicationNested;

describe("mechanizeDockerContainer", () => {
	beforeEach(() => {
		vi.useRealTimers();
		inspectMock.mockReset();
		inspectMock.mockRejectedValue(
			Object.assign(new Error("service not found"), { statusCode: 404 }),
		);
		updateMock.mockReset();
		updateMock.mockResolvedValue(undefined);
		getServiceMock.mockClear();
		createServiceMock.mockClear();
		listServicesMock.mockClear();
		getRemoteDockerMock.mockClear();
		infoMock.mockClear();
		infoMock.mockResolvedValue({ Swarm: { NodeID: "node-123" } });
		getRemoteDockerMock.mockResolvedValue({
			getService: getServiceMock,
			createService: createServiceMock,
			listServices: listServicesMock,
			info: infoMock,
		});
	});

	it("propagates service inspection failures instead of attempting creation", async () => {
		const inspectError = Object.assign(new Error("daemon unavailable"), {
			statusCode: 500,
		});
		inspectMock.mockRejectedValue(inspectError);

		await expect(mechanizeDockerContainer(createApplication())).rejects.toBe(
			inspectError,
		);

		expect(createServiceMock).not.toHaveBeenCalled();
		expect(updateMock).not.toHaveBeenCalled();
	});

	it("propagates service update failures instead of attempting creation", async () => {
		const updateError = new Error("update rejected");
		inspectMock.mockResolvedValue({
			Version: { Index: "7" },
			Spec: { TaskTemplate: { ForceUpdate: 3 } },
		});
		updateMock.mockRejectedValue(updateError);

		await expect(mechanizeDockerContainer(createApplication())).rejects.toBe(
			updateError,
		);

		expect(updateMock).toHaveBeenCalledTimes(1);
		expect(createServiceMock).not.toHaveBeenCalled();
	});

	it("waits for the current Swarm update to complete", async () => {
		vi.useFakeTimers();
		inspectMock
			.mockResolvedValueOnce({
				Version: { Index: "7" },
				Spec: { TaskTemplate: { ForceUpdate: 3 } },
				UpdateStatus: {
					State: "completed",
					StartedAt: "2026-01-01T00:00:00Z",
				},
			})
			.mockResolvedValueOnce({
				Version: { Index: "8" },
				Spec: { TaskTemplate: { ForceUpdate: 4 } },
				UpdateStatus: {
					State: "updating",
					StartedAt: "2026-01-01T00:01:00Z",
				},
			})
			.mockResolvedValueOnce({
				Version: { Index: "8" },
				Spec: { TaskTemplate: { ForceUpdate: 4 } },
				UpdateStatus: {
					State: "completed",
					StartedAt: "2026-01-01T00:01:00Z",
					Message: "update completed",
				},
			});

		const deployment = mechanizeDockerContainer(createApplication());
		await vi.advanceTimersByTimeAsync(5000);

		await expect(deployment).resolves.toBeUndefined();
		expect(inspectMock).toHaveBeenCalledTimes(3);
		expect(updateMock).toHaveBeenCalledTimes(1);
		expect(createServiceMock).not.toHaveBeenCalled();
	});

	it("fails a deployment when Swarm rolls back the current update", async () => {
		inspectMock
			.mockResolvedValueOnce({
				Version: { Index: "7" },
				Spec: { TaskTemplate: { ForceUpdate: 3 } },
				UpdateStatus: {
					State: "completed",
					StartedAt: "2026-01-01T00:00:00Z",
				},
			})
			.mockResolvedValueOnce({
				Version: { Index: "8" },
				Spec: { TaskTemplate: { ForceUpdate: 3 } },
				UpdateStatus: {
					State: "rollback_completed",
					StartedAt: "2026-01-01T00:01:00Z",
					Message: "rollback completed",
				},
			});

		await expect(mechanizeDockerContainer(createApplication())).rejects.toThrow(
			"Swarm service update failed: rollback completed",
		);

		expect(createServiceMock).not.toHaveBeenCalled();
	});

	it("fails when a newer Swarm update supersedes the deployment", async () => {
		inspectMock
			.mockResolvedValueOnce({
				Version: { Index: "7" },
				Spec: { TaskTemplate: { ForceUpdate: 3 } },
			})
			.mockResolvedValueOnce({
				Version: { Index: "9" },
				Spec: { TaskTemplate: { ForceUpdate: 5 } },
				UpdateStatus: {
					State: "completed",
					StartedAt: "2026-01-01T00:02:00Z",
				},
			});

		await expect(mechanizeDockerContainer(createApplication())).rejects.toThrow(
			"Swarm service update was superseded by a newer update",
		);
	});

	it("allows configured Swarm rollouts to exceed the default timeout", async () => {
		vi.useFakeTimers();
		inspectMock
			.mockResolvedValueOnce({
				Version: { Index: "7" },
				Spec: { TaskTemplate: { ForceUpdate: 3 } },
			})
			.mockResolvedValue({
				Version: { Index: "8" },
				Spec: { TaskTemplate: { ForceUpdate: 4 } },
				UpdateStatus: {
					State: "updating",
					StartedAt: "2026-01-01T00:01:00Z",
				},
			});

		const deployment = mechanizeDockerContainer(
			createApplication({
				replicas: 2,
				updateConfigSwarm: {
					Parallelism: 1,
					Delay: 11 * 60 * 1e9,
					Order: "start-first",
				},
			}),
		);
		let settled = false;
		deployment.finally(() => {
			settled = true;
		});

		await vi.advanceTimersByTimeAsync(42 * 60 * 1000 + 55 * 1000);

		expect(settled).toBe(false);
		inspectMock.mockResolvedValueOnce({
			Version: { Index: "8" },
			Spec: { TaskTemplate: { ForceUpdate: 4 } },
			UpdateStatus: {
				State: "completed",
				StartedAt: "2026-01-01T00:01:00Z",
			},
		});
		await vi.advanceTimersByTimeAsync(5000);
		await expect(deployment).resolves.toBeUndefined();
	});

	it("uses the requested custom replica count for the rollout timeout", async () => {
		vi.useFakeTimers();
		inspectMock
			.mockResolvedValueOnce({
				Version: { Index: "7" },
				Spec: {
					TaskTemplate: { ForceUpdate: 3 },
					Mode: { Replicated: { Replicas: 1 } },
				},
			})
			.mockResolvedValue({
				Version: { Index: "8" },
				Spec: {
					TaskTemplate: { ForceUpdate: 4 },
					Mode: { Replicated: { Replicas: 20 } },
				},
				UpdateStatus: {
					State: "updating",
					StartedAt: "2026-01-01T00:01:00Z",
				},
			});

		const deployment = mechanizeDockerContainer(
			createApplication({
				modeSwarm: { Replicated: { Replicas: 20 } },
				updateConfigSwarm: {
					Parallelism: 1,
					Delay: 60 * 1e9,
					Order: "start-first",
				},
			}),
		);
		let settled = false;
		deployment.finally(() => {
			settled = true;
		});

		await vi.advanceTimersByTimeAsync(30 * 60 * 1000 + 55 * 1000);

		expect(settled).toBe(false);
		inspectMock.mockResolvedValueOnce({
			Version: { Index: "8" },
			Spec: {
				TaskTemplate: { ForceUpdate: 4 },
				Mode: { Replicated: { Replicas: 20 } },
			},
			UpdateStatus: {
				State: "completed",
				StartedAt: "2026-01-01T00:01:00Z",
			},
		});
		await vi.advanceTimersByTimeAsync(5000);
		await expect(deployment).resolves.toBeUndefined();
	});

	it("gets the desired task count for a global Swarm service", async () => {
		vi.useFakeTimers();
		listServicesMock.mockResolvedValueOnce([
			{
				Spec: { Name: "test-app" },
				ServiceStatus: { DesiredTasks: 20 },
			},
		]);
		inspectMock
			.mockResolvedValueOnce({
				Version: { Index: "7" },
				Spec: {
					TaskTemplate: { ForceUpdate: 3 },
					Mode: { Global: {} },
				},
			})
			.mockResolvedValue({
				Version: { Index: "8" },
				Spec: {
					TaskTemplate: { ForceUpdate: 4 },
					Mode: { Global: {} },
				},
				UpdateStatus: {
					State: "updating",
					StartedAt: "2026-01-01T00:01:00Z",
				},
			});

		const deployment = mechanizeDockerContainer(
			createApplication({
				modeSwarm: { Global: {} },
				updateConfigSwarm: {
					Parallelism: 1,
					Delay: 60 * 1e9,
					Order: "start-first",
				},
			}),
		);
		let settled = false;
		deployment.finally(() => {
			settled = true;
		});

		await vi.advanceTimersByTimeAsync(30 * 60 * 1000 + 55 * 1000);

		expect(settled).toBe(false);
		expect(listServicesMock).toHaveBeenCalledWith({
			filters: { name: ["test-app"] },
			status: true,
			abortSignal: expect.any(AbortSignal),
		});
		inspectMock.mockResolvedValueOnce({
			Version: { Index: "8" },
			Spec: {
				TaskTemplate: { ForceUpdate: 4 },
				Mode: { Global: {} },
			},
			UpdateStatus: {
				State: "completed",
				StartedAt: "2026-01-01T00:01:00Z",
			},
		});
		await vi.advanceTimersByTimeAsync(5000);
		await expect(deployment).resolves.toBeUndefined();
	});

	it("aborts a Swarm status request that stops responding", async () => {
		vi.useFakeTimers();
		inspectMock
			.mockResolvedValueOnce({
				Version: { Index: "7" },
				Spec: { TaskTemplate: { ForceUpdate: 3 } },
			})
			.mockImplementationOnce(
				(options) =>
					new Promise((_, reject) => {
						options?.abortSignal?.addEventListener("abort", () => {
							reject(new Error("status request aborted"));
						});
					}),
			);

		const deployment = mechanizeDockerContainer(createApplication());
		const rejection = expect(deployment).rejects.toThrow(
			"status request aborted",
		);
		await vi.advanceTimersByTimeAsync(30 * 1000);

		await rejection;
	});

	it("times out updates that never reach a terminal Swarm state", async () => {
		vi.useFakeTimers();
		inspectMock
			.mockResolvedValueOnce({
				Version: { Index: "7" },
				Spec: { TaskTemplate: { ForceUpdate: 3 } },
				UpdateStatus: {
					State: "completed",
					StartedAt: "2026-01-01T00:00:00Z",
				},
			})
			.mockResolvedValue({
				Version: { Index: "8" },
				Spec: { TaskTemplate: { ForceUpdate: 4 } },
				UpdateStatus: {
					State: "updating",
					StartedAt: "2026-01-01T00:01:00Z",
				},
			});

		const deployment = mechanizeDockerContainer(createApplication());
		const rejection = expect(deployment).rejects.toThrow(
			"Swarm service update timed out",
		);
		await vi.advanceTimersByTimeAsync(10 * 60 * 1000 + 5000);

		await rejection;
		expect(createServiceMock).not.toHaveBeenCalled();
	});

	it("passes stopGracePeriodSwarm as a number and keeps zero values", async () => {
		const application = createApplication({ stopGracePeriodSwarm: 0 });

		await mechanizeDockerContainer(application);

		expect(createServiceMock).toHaveBeenCalledTimes(1);
		const call = createServiceMock.mock.calls[0] as
			| [MockCreateServiceOptions]
			| undefined;
		if (!call) {
			throw new Error("createServiceMock should have been called once");
		}
		const [settings] = call;
		expect(settings.TaskTemplate?.ContainerSpec?.StopGracePeriod).toBe(0);
		expect(typeof settings.TaskTemplate?.ContainerSpec?.StopGracePeriod).toBe(
			"number",
		);
	});

	it("omits StopGracePeriod when stopGracePeriodSwarm is null", async () => {
		const application = createApplication({ stopGracePeriodSwarm: null });

		await mechanizeDockerContainer(application);

		expect(createServiceMock).toHaveBeenCalledTimes(1);
		const call = createServiceMock.mock.calls[0] as
			| [MockCreateServiceOptions]
			| undefined;
		if (!call) {
			throw new Error("createServiceMock should have been called once");
		}
		const [settings] = call;
		expect(settings.TaskTemplate?.ContainerSpec).not.toHaveProperty(
			"StopGracePeriod",
		);
	});

	it("passes ulimits to ContainerSpec when ulimitsSwarm is defined", async () => {
		const ulimits = [
			{ Name: "nofile", Soft: 10000, Hard: 20000 },
			{ Name: "nproc", Soft: 4096, Hard: 8192 },
		];
		const application = createApplication({ ulimitsSwarm: ulimits });

		await mechanizeDockerContainer(application);

		expect(createServiceMock).toHaveBeenCalledTimes(1);
		const call = createServiceMock.mock.calls[0];
		if (!call) {
			throw new Error("createServiceMock should have been called once");
		}
		const [settings] = call;
		expect(settings.TaskTemplate?.ContainerSpec?.Ulimits).toEqual(ulimits);
	});

	it("omits Ulimits when ulimitsSwarm is null", async () => {
		const application = createApplication({ ulimitsSwarm: null });

		await mechanizeDockerContainer(application);

		expect(createServiceMock).toHaveBeenCalledTimes(1);
		const call = createServiceMock.mock.calls[0];
		if (!call) {
			throw new Error("createServiceMock should have been called once");
		}
		const [settings] = call;
		expect(settings.TaskTemplate?.ContainerSpec).not.toHaveProperty("Ulimits");
	});

	it("omits Ulimits when ulimitsSwarm is an empty array", async () => {
		const application = createApplication({ ulimitsSwarm: [] });

		await mechanizeDockerContainer(application);

		expect(createServiceMock).toHaveBeenCalledTimes(1);
		const call = createServiceMock.mock.calls[0];
		if (!call) {
			throw new Error("createServiceMock should have been called once");
		}
		const [settings] = call;
		expect(settings.TaskTemplate?.ContainerSpec).not.toHaveProperty("Ulimits");
	});

	it("pins a locally built image to the node that built it", async () => {
		await mechanizeDockerContainer(
			createApplication({
				sourceType: "github",
				dockerImage: null,
				registry: null,
				buildRegistry: null,
				rollbackRegistry: null,
				placementSwarm: null,
			}),
		);

		const call = createServiceMock.mock.calls[0];
		if (!call) {
			throw new Error("createServiceMock should have been called once");
		}
		const [settings] = call;
		expect(settings.TaskTemplate?.Placement?.Constraints).toContain(
			"node.id==node-123",
		);
	});

	it("still pins the current image when a rollback registry is configured", async () => {
		await mechanizeDockerContainer(
			createApplication({
				sourceType: "github",
				dockerImage: null,
				rollbackRegistry: {} as ApplicationNested["rollbackRegistry"],
			}),
		);

		const call = createServiceMock.mock.calls[0];
		if (!call) {
			throw new Error("createServiceMock should have been called once");
		}
		const [settings] = call;
		expect(settings.TaskTemplate?.Placement?.Constraints).toContain(
			"node.id==node-123",
		);
	});

	it("does not pin externally pulled Docker images", async () => {
		await mechanizeDockerContainer(createApplication());

		expect(infoMock).not.toHaveBeenCalled();
		const call = createServiceMock.mock.calls[0];
		if (!call) {
			throw new Error("createServiceMock should have been called once");
		}
		const [settings] = call;
		expect(settings.TaskTemplate?.Placement?.Constraints ?? []).not.toContain(
			"node.id==node-123",
		);
	});

	it("keeps user-defined placement for locally built images", async () => {
		await mechanizeDockerContainer(
			createApplication({
				sourceType: "github",
				dockerImage: null,
				placementSwarm: { Constraints: ["node.labels.zone==eu"] },
			}),
		);

		expect(infoMock).not.toHaveBeenCalled();
		const call = createServiceMock.mock.calls[0];
		if (!call) {
			throw new Error("createServiceMock should have been called once");
		}
		const [settings] = call;
		expect(settings.TaskTemplate?.Placement?.Constraints).toEqual([
			"node.labels.zone==eu",
		]);
	});
});
