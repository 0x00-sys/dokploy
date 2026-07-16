interface CentralizedDeploymentRow {
	deploymentId: string;
	createdAt: string;
	finishedAt: string | null;
	status: string | null;
}

interface CentralizedDeploymentSnapshot<T extends CentralizedDeploymentRow> {
	cursor: string;
	items: T[];
}

export const CENTRALIZED_DEPLOYMENT_RECONCILE_MS = 5 * 60 * 1000;

export const startCentralizedDeploymentReconciliation = (
	refetch: () => unknown,
) => {
	const interval = setInterval(
		() => void refetch(),
		CENTRALIZED_DEPLOYMENT_RECONCILE_MS,
	);
	return () => clearInterval(interval);
};

const isTerminalDeploymentStatus = (status: string | null) =>
	status === "done" || status === "error" || status === "cancelled";

export const getCentralizedDeploymentPollInput = <
	T extends CentralizedDeploymentRow,
>({
	cursor,
	items,
}: CentralizedDeploymentSnapshot<T>) => {
	const newest =
		items.length > 0 && items[0] && items[0].createdAt > cursor
			? items[0].createdAt
			: cursor;
	const after = new Date(
		Date.parse(newest) - CENTRALIZED_DEPLOYMENT_RECONCILE_MS,
	).toISOString();

	return {
		after,
		deploymentIds: items
			.filter(
				(deployment) =>
					!isTerminalDeploymentStatus(deployment.status) ||
					(deployment.finishedAt !== null && deployment.finishedAt >= after),
			)
			.map((deployment) => deployment.deploymentId),
	};
};

export const mergeCentralizedDeploymentUpdates = <
	T extends CentralizedDeploymentRow,
>(
	current: T[],
	updates: T[],
	existingDeploymentIds: string[],
) => {
	const availableDeploymentIds = new Set([
		...existingDeploymentIds,
		...updates.map((deployment) => deployment.deploymentId),
	]);
	const retained = current.filter((deployment) =>
		availableDeploymentIds.has(deployment.deploymentId),
	);
	if (updates.length === 0) {
		return retained.length === current.length ? current : retained;
	}

	let result = retained;
	let changed = retained.length !== current.length;
	for (const deployment of updates) {
		const existingIndex = result.findIndex(
			(item) => item.deploymentId === deployment.deploymentId,
		);
		const existing = result[existingIndex];
		if (
			existing &&
			isTerminalDeploymentStatus(existing.status) &&
			!isTerminalDeploymentStatus(deployment.status) &&
			existing.status !== deployment.status
		) {
			continue;
		}
		if (existing && JSON.stringify(existing) === JSON.stringify(deployment)) {
			continue;
		}
		if (!changed) result = [...current];
		if (existingIndex === -1) {
			result.push(deployment);
		} else {
			result[existingIndex] = deployment;
		}
		changed = true;
	}
	if (!changed) return current;

	return result.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
};
