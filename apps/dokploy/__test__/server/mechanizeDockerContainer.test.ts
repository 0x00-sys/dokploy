import type { ApplicationNested } from "@dokploy/server/utils/builders";
import { mechanizeDockerContainer } from "@dokploy/server/utils/builders";
import { beforeEach, describe, expect, it, vi } from "vitest";

type MockCreateServiceOptions = {
	TaskTemplate?: {
		ContainerSpec?: {
			StopGracePeriod?: number;
			Ulimits?: Array<{ Name: string; Soft: number; Hard: number }>;
		};
	};
	[key: string]: unknown;
};

type MockServiceInspect = {
	Version: { Index: string };
	Spec: { TaskTemplate: { ForceUpdate: number } };
};

const {
	inspectMock,
	updateMock,
	getServiceMock,
	createServiceMock,
	getRemoteDockerMock,
} = vi.hoisted(() => {
	const inspect = vi.fn<() => Promise<MockServiceInspect>>();
	const update = vi.fn<(opts: MockCreateServiceOptions) => Promise<void>>(
		async () => undefined,
	);
	const getService = vi.fn(() => ({ inspect, update }));
	const createService = vi.fn<
		(opts: MockCreateServiceOptions) => Promise<void>
	>(async () => undefined);
	const getRemoteDocker = vi.fn(async () => ({
		getService,
		createService,
	}));
	return {
		inspectMock: inspect,
		updateMock: update,
		getServiceMock: getService,
		createServiceMock: createService,
		getRemoteDockerMock: getRemoteDocker,
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
		inspectMock.mockReset();
		inspectMock.mockRejectedValue(
			Object.assign(new Error("service not found"), { statusCode: 404 }),
		);
		updateMock.mockReset();
		updateMock.mockResolvedValue(undefined);
		getServiceMock.mockClear();
		createServiceMock.mockClear();
		getRemoteDockerMock.mockClear();
		getRemoteDockerMock.mockResolvedValue({
			getService: getServiceMock,
			createService: createServiceMock,
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
});
