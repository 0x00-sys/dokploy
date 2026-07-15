import { api } from "@/utils/api";

type ComposeStatus = "idle" | "running" | "done" | "error";

interface ComposeContainer {
	state: string;
}

interface ComposeRuntimeStatusOptions {
	appName?: string;
	appType?: "stack" | "docker-compose";
	composeStatus?: ComposeStatus;
	poll?: boolean;
	serverId?: string | null;
}

export const getComposeRuntimeStatus = (
	composeStatus: ComposeStatus | undefined,
	containers: ComposeContainer[] | undefined,
) => {
	if (
		composeStatus === "idle" &&
		containers?.some((container) => container.state.toLowerCase() === "running")
	) {
		return "done" as const;
	}

	return composeStatus;
};

export const useComposeRuntimeStatus = ({
	appName,
	appType,
	composeStatus,
	poll = false,
	serverId,
}: ComposeRuntimeStatusOptions) => {
	const shouldCheckRuntime =
		composeStatus === "idle" && appType === "docker-compose" && !!appName;
	const { data: containers, refetch } =
		api.docker.getContainersByAppNameMatch.useQuery(
			{
				appName: appName ?? "",
				appType,
				serverId: serverId ?? undefined,
			},
			{
				enabled: shouldCheckRuntime,
				refetchInterval: shouldCheckRuntime && poll ? 5000 : false,
			},
		);

	return {
		composeStatus: getComposeRuntimeStatus(
			composeStatus,
			shouldCheckRuntime ? containers : undefined,
		),
		refetch,
	};
};
