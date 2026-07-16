import { afterEach, expect, it, vi } from "vitest";
import {
	CENTRALIZED_DEPLOYMENT_RECONCILE_MS,
	getCentralizedDeploymentPollInput,
	mergeCentralizedDeploymentUpdates,
	startCentralizedDeploymentReconciliation,
} from "@/components/dashboard/deployments/centralized-deployment-polling";

const deployment = (
	deploymentId: string,
	createdAt: string,
	status: string,
	finishedAt: string | null = null,
) => ({ deploymentId, createdAt, finishedAt, status });

afterEach(() => vi.useRealTimers());

it("reconciles snapshots on a wall-clock interval and cleans up", () => {
	vi.useFakeTimers();
	const refetch = vi.fn();
	const stop = startCentralizedDeploymentReconciliation(refetch);

	vi.advanceTimersByTime(CENTRALIZED_DEPLOYMENT_RECONCILE_MS * 2);
	expect(refetch).toHaveBeenCalledTimes(2);

	stop();
	vi.advanceTimersByTime(CENTRALIZED_DEPLOYMENT_RECONCILE_MS);
	expect(refetch).toHaveBeenCalledTimes(2);
});

it("polls only deployments that are new or still mutable", () => {
	const input = getCentralizedDeploymentPollInput({
		cursor: "2026-01-01T00:00:00.000Z",
		items: [
			deployment("running-1", "2026-01-02T00:00:00.000Z", "running"),
			deployment("pending-1", "2026-01-01T18:00:00.000Z", "pending"),
			deployment("cancelled-1", "2026-01-01T15:00:00.000Z", "cancelled"),
			deployment("done-1", "2026-01-01T12:00:00.000Z", "done"),
		],
	});

	expect(input).toEqual({
		after: "2026-01-01T23:55:00.000Z",
		deploymentIds: ["running-1", "pending-1"],
	});
});

it("keeps recently finished deployments tracked for terminal corrections", () => {
	const input = getCentralizedDeploymentPollInput({
		cursor: "2026-01-01T00:10:00.000Z",
		items: [
			deployment(
				"recently-done",
				"2025-12-01T00:00:00.000Z",
				"done",
				"2026-01-01T00:09:00.000Z",
			),
			deployment(
				"long-done",
				"2025-12-01T00:00:00.000Z",
				"done",
				"2026-01-01T00:04:00.000Z",
			),
		],
	});

	expect(input.deploymentIds).toEqual(["recently-done"]);
});

it("keeps an overlap window when advancing past concurrent inserts", () => {
	const input = getCentralizedDeploymentPollInput({
		cursor: "2026-01-01T00:00:00.000Z",
		items: [
			deployment("newer", "2026-01-01T00:10:00.000Z", "done"),
			deployment("older", "2026-01-01T00:09:00.000Z", "done"),
		],
	});

	expect(input.after).toBe("2026-01-01T00:05:00.000Z");
});

it("merges status changes and new deployments without dropping history", () => {
	const current = [
		deployment("running-1", "2026-01-02T00:00:00.000Z", "running"),
		deployment("done-1", "2026-01-01T00:00:00.000Z", "done"),
	];
	const updates = [
		deployment("new-1", "2026-01-03T00:00:00.000Z", "running"),
		deployment("running-1", "2026-01-02T00:00:00.000Z", "done"),
	];

	expect(
		mergeCentralizedDeploymentUpdates(current, updates, [
			"running-1",
			"done-1",
			"new-1",
		]),
	).toEqual([updates[0], updates[1], current[1]]);
});

it("does not regress a terminal deployment with a stale running update", () => {
	const completed = deployment(
		"deployment-1",
		"2026-01-02T00:00:00.000Z",
		"done",
	);
	const stale = { ...completed, status: "running" };

	expect(
		mergeCentralizedDeploymentUpdates([completed], [stale], ["deployment-1"]),
	).toEqual([completed]);
});

it("allows a nonterminal deployment to start running", () => {
	const pending = deployment(
		"deployment-1",
		"2026-01-02T00:00:00.000Z",
		"pending",
	);
	const running = { ...pending, status: "running" };

	expect(
		mergeCentralizedDeploymentUpdates([pending], [running], ["deployment-1"]),
	).toEqual([running]);
});

it("allows a terminal deployment to be corrected to another terminal state", () => {
	const completed = deployment(
		"deployment-1",
		"2026-01-02T00:00:00.000Z",
		"done",
		"2026-01-02T00:01:00.000Z",
	);
	const failed = { ...completed, status: "error" };

	expect(
		mergeCentralizedDeploymentUpdates([completed], [failed], ["deployment-1"]),
	).toEqual([failed]);
});

it("removes deployments that no longer exist in the current scope", () => {
	const current = [
		deployment("deleted-1", "2026-01-02T00:00:00.000Z", "done"),
		deployment("kept-1", "2026-01-01T00:00:00.000Z", "done"),
	];

	expect(mergeCentralizedDeploymentUpdates(current, [], ["kept-1"])).toEqual([
		current[1],
	]);
});

it("keeps a newly returned deployment across a concurrent id scan", () => {
	const added = deployment("new-1", "2026-01-02T00:00:00.000Z", "running");

	expect(mergeCentralizedDeploymentUpdates([], [added], [])).toEqual([added]);
});

it("reuses the current list when a poll returns unchanged rows", () => {
	const current = [
		deployment("deployment-1", "2026-01-02T00:00:00.000Z", "done"),
	];

	expect(
		mergeCentralizedDeploymentUpdates(
			current,
			[{ ...current[0]! }],
			["deployment-1"],
		),
	).toBe(current);
});
