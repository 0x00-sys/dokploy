import { spawnSync } from "node:child_process";
import { wrapStoppedServiceBackup } from "@dokploy/server/utils/volume-backups/backup";
import { describe, expect, it } from "vitest";

const run = (command: string) =>
	spawnSync("sh", ["-c", command], {
		encoding: "utf8",
	});

describe("wrapStoppedServiceBackup", () => {
	it("restarts a stopped service when the backup fails", () => {
		const command = `
			set -e
			trap 'echo lock-cleanup' EXIT
			${wrapStoppedServiceBackup(
				"echo stop",
				"echo backup; false",
				"echo start",
				"echo upload",
			)}
		`;

		const result = run(command);

		expect(result.status).not.toBe(0);
		expect(result.stdout.trim().split("\n")).toEqual([
			"stop",
			"backup",
			"start",
			"lock-cleanup",
		]);
	});

	it("does not restart when stopping the service fails", () => {
		const command = `
			set -e
			trap 'echo lock-cleanup' EXIT
			${wrapStoppedServiceBackup(
				"echo stop; false",
				"echo backup",
				"echo start",
				"echo upload",
			)}
		`;

		const result = run(command);

		expect(result.status).not.toBe(0);
		expect(result.stdout.trim().split("\n")).toEqual(["stop", "lock-cleanup"]);
	});

	it("restarts once before uploading after a successful backup", () => {
		const command = `
			set -e
			trap 'echo lock-cleanup' EXIT
			${wrapStoppedServiceBackup(
				"echo stop",
				"echo backup",
				"echo start",
				"echo upload",
			)}
		`;

		const result = run(command);

		expect(result.status).toBe(0);
		expect(result.stdout.trim().split("\n")).toEqual([
			"stop",
			"backup",
			"start",
			"upload",
			"lock-cleanup",
		]);
	});
});
