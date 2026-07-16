import { spawn } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, expect, it } from "vitest";
import { getApplicationBuildKillCommand } from "@/server/queues/kill-build";

const temporaryDirectories: string[] = [];
const runningProcesses: Array<ReturnType<typeof spawn>> = [];
const runningProcessIds: number[] = [];

const waitForExit = (child: ReturnType<typeof spawn>, timeoutMs: number) => {
	if (child.exitCode !== null || child.signalCode !== null) {
		return Promise.resolve(true);
	}

	return new Promise<boolean>((resolve) => {
		const timeout = setTimeout(() => resolve(false), timeoutMs);
		child.once("exit", () => {
			clearTimeout(timeout);
			resolve(true);
		});
	});
};

const readProcessId = async (filePath: string) => {
	for (let attempt = 0; attempt < 50; attempt++) {
		try {
			const processId = Number.parseInt(await readFile(filePath, "utf8"), 10);
			if (Number.isInteger(processId) && processId > 0) return processId;
		} catch {
			// The child has not written its PID yet.
		}
		await new Promise((resolve) => setTimeout(resolve, 10));
	}
	throw new Error("Timed out waiting for the build child process");
};

const isProcessRunning = (processId: number) => {
	try {
		process.kill(processId, 0);
		return true;
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code === "ESRCH") return false;
		throw error;
	}
};

afterEach(async () => {
	for (const child of runningProcesses) {
		if (child.exitCode === null && child.signalCode === null) {
			child.kill("SIGKILL");
		}
	}
	for (const processId of runningProcessIds) {
		try {
			process.kill(processId, "SIGKILL");
		} catch (error) {
			if ((error as NodeJS.ErrnoException).code !== "ESRCH") throw error;
		}
	}
	await Promise.all(
		temporaryDirectories.map((directory) =>
			rm(directory, { recursive: true, force: true }),
		),
	);
	runningProcesses.length = 0;
	runningProcessIds.length = 0;
	temporaryDirectories.length = 0;
});

it("stops build children that do not include the application path", async () => {
	const directory = await mkdtemp(path.join(tmpdir(), "dokploy-kill-build-"));
	temporaryDirectories.push(directory);
	const buildPath = path.join(directory, "code");
	await mkdir(buildPath);
	const childPidPath = path.join(directory, "child.pid");

	const build = spawn(
		"sh",
		[
			"-c",
			`cd '${buildPath}' && sh -c 'echo $$ > "${childPidPath}"; exec sleep 30'; status=$?; exit $status`,
		],
		{
			stdio: "ignore",
		},
	);
	runningProcesses.push(build);
	const childProcessId = await readProcessId(childPidPath);
	runningProcessIds.push(childProcessId);

	const killer = spawn(
		"sh",
		["-c", getApplicationBuildKillCommand(buildPath)],
		{
			stdio: "ignore",
		},
	);
	runningProcesses.push(killer);

	expect(await waitForExit(killer, 2_000)).toBe(true);
	expect(killer.exitCode).toBe(0);
	expect(await waitForExit(build, 2_000)).toBe(true);
	expect(isProcessRunning(childProcessId)).toBe(false);
});

it("fails when no matching build process can be signalled", async () => {
	const killer = spawn(
		"sh",
		[
			"-c",
			getApplicationBuildKillCommand(
				`/tmp/dokploy-no-matching-build-${process.pid}`,
			),
		],
		{ stdio: "ignore" },
	);
	runningProcesses.push(killer);

	expect(await waitForExit(killer, 2_000)).toBe(true);
	expect(killer.exitCode).toBe(1);
});
