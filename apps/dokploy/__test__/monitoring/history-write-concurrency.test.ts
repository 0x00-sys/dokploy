import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ monitoringPath: "" }));

vi.mock("@dokploy/server/constants", () => ({
	paths: () => ({ MONITORING_PATH: state.monitoringPath }),
}));

import {
	readStatsFile,
	updateStatsFile,
} from "@dokploy/server/monitoring/utils";

describe("monitoring history writes", () => {
	beforeEach(async () => {
		state.monitoringPath = await mkdtemp(
			path.join(tmpdir(), "dokploy-monitoring-"),
		);
		await mkdir(path.join(state.monitoringPath, "test-app"));
		await writeFile(
			path.join(state.monitoringPath, "test-app", "cpu.json"),
			"[]",
		);
	});

	afterEach(async () => {
		await rm(state.monitoringPath, { recursive: true, force: true });
	});

	it("preserves every sample written concurrently for the same service", async () => {
		await Promise.all(
			Array.from({ length: 25 }, (_, index) =>
				updateStatsFile("test-app", "cpu", `${index}%`),
			),
		);

		const history = await readStatsFile("test-app", "cpu");

		expect(history).toHaveLength(25);
		expect(history.map(({ value }: { value: string }) => value)).toEqual(
			Array.from({ length: 25 }, (_, index) => `${index}%`),
		);
	});
});
