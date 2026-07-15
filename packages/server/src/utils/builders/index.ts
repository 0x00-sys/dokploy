import { findRegistryByIdWithCredentials } from "@dokploy/server/services/registry";
import type { InferResultType } from "@dokploy/server/types/with";
import type { CreateServiceOptions, Service } from "dockerode";
import { getRegistryTag, uploadImageRemoteCommand } from "../cluster/upload";
import {
	calculateResources,
	generateBindMounts,
	generateConfigContainer,
	generateFileMounts,
	generateVolumeMounts,
	prepareEnvironmentVariables,
} from "../docker/utils";
import { getRemoteDocker } from "../servers/remote-docker";
import { getDockerCommand } from "./docker-file";
import { getHerokuCommand } from "./heroku";
import { getNixpacksCommand } from "./nixpacks";
import { getPaketoCommand } from "./paketo";
import { getRailpackCommand } from "./railpack";
import { getStaticCommand } from "./static";

// NIXPACKS codeDirectory = where is the path of the code directory
// HEROKU codeDirectory = where is the path of the code directory
// PAKETO codeDirectory = where is the path of the code directory
// DOCKERFILE codeDirectory = where is the exact path of the (Dockerfile)
export type ApplicationNested = InferResultType<
	"applications",
	{
		mounts: true;
		security: true;
		redirects: true;
		ports: true;
		registry: { columns: { password: false } };
		buildRegistry: { columns: { password: false } };
		rollbackRegistry: { columns: { password: false } };
		deployments: true;
		environment: { with: { project: true } };
	}
>;

export const getBuildCommand = async (application: ApplicationNested) => {
	let command = "";

	if (application.sourceType !== "docker") {
		const { buildType } = application;
		switch (buildType) {
			case "nixpacks":
				command = getNixpacksCommand(application);
				break;
			case "heroku_buildpacks":
				command = getHerokuCommand(application);
				break;
			case "paketo_buildpacks":
				command = getPaketoCommand(application);
				break;
			case "static":
				command = getStaticCommand(application);
				break;
			case "dockerfile":
				command = getDockerCommand(application);
				break;
			case "railpack":
				command = getRailpackCommand(application);
				break;
		}
	}

	if (
		application.registry ||
		application.buildRegistry ||
		application.rollbackRegistry
	) {
		command += await uploadImageRemoteCommand(application);
	}

	return command;
};

const SERVICE_UPDATE_POLL_INTERVAL_MS = 5000;
const SERVICE_UPDATE_TIMEOUT_BUFFER_MS = 10 * 60 * 1000;
const SERVICE_INSPECT_TIMEOUT_MS = 30 * 1000;
const FAILED_SERVICE_UPDATE_STATES = new Set([
	"paused",
	"rollback_started",
	"rollback_paused",
	"rollback_completed",
]);
const FAILED_SERVICE_ROLLBACK_STATES = new Set([
	"rollback_started",
	"rollback_paused",
	"rollback_completed",
]);

const waitForServiceUpdate = async (
	service: Service,
	expectedForceUpdate: number,
	timeoutMs: number,
	previousStartedAt?: string,
) => {
	const deadline = Date.now() + timeoutMs;

	while (Date.now() < deadline) {
		const controller = new AbortController();
		const inspectTimeout = setTimeout(
			() => controller.abort(),
			Math.min(SERVICE_INSPECT_TIMEOUT_MS, deadline - Date.now()),
		);
		let inspect: Awaited<ReturnType<typeof service.inspect>>;
		try {
			inspect = await service.inspect({ abortSignal: controller.signal });
		} finally {
			clearTimeout(inspectTimeout);
		}

		const status = inspect.UpdateStatus;
		const hasCurrentStartedAt =
			status?.StartedAt && status.StartedAt !== previousStartedAt;
		const hasExpectedSpec =
			inspect.Spec.TaskTemplate.ForceUpdate === expectedForceUpdate;

		if (inspect.Spec.TaskTemplate.ForceUpdate > expectedForceUpdate) {
			throw new Error("Swarm service update was superseded by a newer update");
		}

		if (
			hasCurrentStartedAt &&
			hasExpectedSpec &&
			status.State === "completed"
		) {
			return;
		}
		if (
			hasCurrentStartedAt &&
			status.State &&
			(FAILED_SERVICE_ROLLBACK_STATES.has(status.State) ||
				(hasExpectedSpec && FAILED_SERVICE_UPDATE_STATES.has(status.State)))
		) {
			throw new Error(
				`Swarm service update failed: ${status.Message || status.State.replaceAll("_", " ")}`,
			);
		}

		await new Promise((resolve) =>
			setTimeout(resolve, SERVICE_UPDATE_POLL_INTERVAL_MS),
		);
	}

	throw new Error("Swarm service update timed out");
};

const getServiceUpdateTimeout = (
	settings: CreateServiceOptions,
	desiredTasks: number,
) => {
	const getRolloutDuration = (config: CreateServiceOptions["UpdateConfig"]) => {
		if (!config) return 0;
		const parallelism = Math.max(config.Parallelism || 1, 1);
		const batches = Math.max(Math.ceil(desiredTasks / parallelism), 1);
		const delay = Math.max(config.Delay || 0, 0);
		const monitor = Math.max(config.Monitor || 0, 0);

		return (batches * delay + Math.max(monitor, delay + 1e9)) / 1e6;
	};

	const updateDuration = getRolloutDuration(settings.UpdateConfig);
	const rollbackDuration =
		settings.UpdateConfig?.FailureAction === "rollback"
			? getRolloutDuration(settings.RollbackConfig)
			: 0;

	return Math.max(
		SERVICE_UPDATE_TIMEOUT_BUFFER_MS,
		updateDuration + rollbackDuration + SERVICE_UPDATE_TIMEOUT_BUFFER_MS,
	);
};

const getDesiredServiceTasks = async (
	docker: Awaited<ReturnType<typeof getRemoteDocker>>,
	appName: string,
	settings: CreateServiceOptions,
	previousMode: Awaited<ReturnType<Service["inspect"]>>["Spec"]["Mode"],
	fallbackReplicas: number,
) => {
	const requestedReplicas = settings.Mode?.Replicated?.Replicas;
	const previousReplicas = previousMode?.Replicated?.Replicas;
	if (requestedReplicas !== undefined || previousReplicas !== undefined) {
		return Math.max(
			requestedReplicas ?? 0,
			previousReplicas ?? 0,
			fallbackReplicas,
		);
	}

	const controller = new AbortController();
	const timeout = setTimeout(
		() => controller.abort(),
		SERVICE_INSPECT_TIMEOUT_MS,
	);
	try {
		const services = await docker.listServices({
			filters: { name: [appName] },
			status: true,
			abortSignal: controller.signal,
		});
		const currentService = services.find(
			(candidate) => candidate.Spec?.Name === appName,
		);
		return Math.max(
			currentService?.ServiceStatus?.DesiredTasks ?? 0,
			fallbackReplicas,
		);
	} finally {
		clearTimeout(timeout);
	}
};

export const mechanizeDockerContainer = async (
	application: ApplicationNested,
) => {
	const {
		appName,
		env,
		mounts,
		cpuLimit,
		memoryLimit,
		memoryReservation,
		cpuReservation,
		command,
		args,
		ports,
	} = application;

	const resources = calculateResources({
		memoryLimit,
		memoryReservation,
		cpuLimit,
		cpuReservation,
	});

	const volumesMount = generateVolumeMounts(mounts);

	const {
		HealthCheck,
		RestartPolicy,
		Placement,
		Labels,
		Mode,
		RollbackConfig,
		UpdateConfig,
		Networks,
		StopGracePeriod,
		EndpointSpec,
		Ulimits,
	} = generateConfigContainer(application);

	const bindsMount = generateBindMounts(mounts);
	const filesMount = generateFileMounts(appName, application);
	const envVariables = prepareEnvironmentVariables(
		env,
		application.environment.project.env,
		application.environment.env,
	);

	const image = await getImageName(application);
	const authConfig = await getAuthConfig(application);
	const docker = await getRemoteDocker(application.serverId);

	const settings: CreateServiceOptions = {
		authconfig: authConfig,
		Name: appName,
		TaskTemplate: {
			ContainerSpec: {
				HealthCheck,
				Image: image,
				Env: envVariables,
				Mounts: [...volumesMount, ...bindsMount, ...filesMount],
				...(StopGracePeriod !== null &&
					StopGracePeriod !== undefined && { StopGracePeriod }),
				...(command && {
					Command: command.split(" "),
				}),
				...(args &&
					args.length > 0 && {
						Args: args,
					}),
				...(Ulimits && { Ulimits }),
				Labels,
			},
			Networks,
			RestartPolicy,
			Placement,
			Resources: {
				...resources,
			},
		},
		Mode,
		RollbackConfig,
		EndpointSpec: EndpointSpec
			? EndpointSpec
			: {
					Ports: ports.map((port) => ({
						PublishMode: port.publishMode,
						Protocol: port.protocol,
						TargetPort: port.targetPort,
						PublishedPort: port.publishedPort,
					})),
				},
		UpdateConfig,
	};

	const service = docker.getService(appName);
	let inspect: Awaited<ReturnType<typeof service.inspect>>;
	try {
		inspect = await service.inspect();
	} catch (error) {
		if (!isDockerNotFoundError(error)) {
			throw error;
		}
		if (authConfig) {
			await docker.createService(authConfig, settings);
		} else {
			await docker.createService(settings);
		}
		return;
	}

	const expectedForceUpdate = inspect.Spec.TaskTemplate.ForceUpdate + 1;
	await service.update({
		version: Number.parseInt(inspect.Version.Index),
		...settings,
		TaskTemplate: {
			...settings.TaskTemplate,
			ForceUpdate: expectedForceUpdate,
		},
	});
	await waitForServiceUpdate(
		service,
		expectedForceUpdate,
		getServiceUpdateTimeout(
			settings,
			await getDesiredServiceTasks(
				docker,
				appName,
				settings,
				inspect.Spec.Mode,
				application.replicas,
			),
		),
		inspect.UpdateStatus?.StartedAt,
	);
};

const isDockerNotFoundError = (error: unknown) =>
	typeof error === "object" &&
	error !== null &&
	"statusCode" in error &&
	error.statusCode === 404;

const getImageName = async (application: ApplicationNested) => {
	const { appName, sourceType, dockerImage, registry, buildRegistry } =
		application;
	const imageName = `${appName}:latest`;
	if (sourceType === "docker") {
		return dockerImage || "ERROR-NO-IMAGE-PROVIDED";
	}

	if (registry) {
		const r = await findRegistryByIdWithCredentials(registry.registryId);
		return getRegistryTag(r, imageName);
	}
	if (buildRegistry) {
		const r = await findRegistryByIdWithCredentials(buildRegistry.registryId);
		return getRegistryTag(r, imageName);
	}

	return imageName;
};

export const getAuthConfig = async (application: ApplicationNested) => {
	const {
		registry,
		buildRegistry,
		username,
		password,
		sourceType,
		registryUrl,
	} = application;

	if (sourceType === "docker") {
		if (username && password) {
			return { password, username, serveraddress: registryUrl || "" };
		}
	} else if (registry) {
		const r = await findRegistryByIdWithCredentials(registry.registryId);
		return {
			password: r.password,
			username: r.username,
			serveraddress: r.registryUrl,
		};
	} else if (buildRegistry) {
		const r = await findRegistryByIdWithCredentials(buildRegistry.registryId);
		return {
			password: r.password,
			username: r.username,
			serveraddress: r.registryUrl,
		};
	}

	return undefined;
};
