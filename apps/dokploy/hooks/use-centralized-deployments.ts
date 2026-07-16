import { useEffect, useMemo } from "react";
import {
	CENTRALIZED_DEPLOYMENT_RECONCILE_MS,
	getCentralizedDeploymentPollInput,
	mergeCentralizedDeploymentUpdates,
	startCentralizedDeploymentReconciliation,
} from "@/components/dashboard/deployments/centralized-deployment-polling";
import { api } from "@/utils/api";

const EMPTY_POLL_INPUT = {
	after: new Date(0).toISOString(),
	deploymentIds: [],
};

export const useCentralizedDeployments = (enabled = true) => {
	const utils = api.useUtils();
	const snapshotQuery = api.deployment.centralizedSnapshot.useQuery(undefined, {
		enabled,
		refetchOnWindowFocus: false,
		staleTime: CENTRALIZED_DEPLOYMENT_RECONCILE_MS,
	});
	useEffect(() => {
		if (!enabled) return;
		return startCentralizedDeploymentReconciliation(snapshotQuery.refetch);
	}, [enabled, snapshotQuery.refetch]);
	const pollInput = useMemo(
		() =>
			snapshotQuery.data
				? getCentralizedDeploymentPollInput(snapshotQuery.data)
				: undefined,
		[snapshotQuery.data],
	);
	const { data: updates } = api.deployment.centralizedUpdates.useQuery(
		pollInput ?? EMPTY_POLL_INPUT,
		{
			enabled: enabled && pollInput !== undefined,
			refetchInterval: 5000,
		},
	);

	useEffect(() => {
		if (!updates) return;
		utils.deployment.centralizedSnapshot.setData(undefined, (current) => {
			if (!current) return current;
			const items = mergeCentralizedDeploymentUpdates(
				current.items,
				updates.items,
				updates.deploymentIds,
			);
			return items === current.items ? current : { ...current, items };
		});
	}, [updates, utils]);

	return {
		...snapshotQuery,
		data: snapshotQuery.data?.items,
	};
};
