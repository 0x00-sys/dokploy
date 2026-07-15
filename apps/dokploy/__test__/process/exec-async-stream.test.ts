import { execAsyncStream } from "@dokploy/server/utils/process/execAsync";
import { expect, it } from "vitest";

const LARGE_OUTPUT_BYTES = 2 * 1024 * 1024;

it("streams commands whose output exceeds the exec buffer limit", async () => {
	let streamedBytes = 0;
	const command = `${JSON.stringify(process.execPath)} -e "process.stdout.write('x'.repeat(${LARGE_OUTPUT_BYTES}))"`;

	const result = await execAsyncStream(command, (data) => {
		streamedBytes += Buffer.byteLength(data);
	});

	expect(result.stderr).toBe("");
	expect(result.stdout).toHaveLength(1024 * 1024);
	expect(streamedBytes).toBe(LARGE_OUTPUT_BYTES);
});

it("preserves exit details for failed streaming commands", async () => {
	const command = `${JSON.stringify(process.execPath)} -e "process.stderr.write('restore failed'); process.exit(7)"`;

	await expect(execAsyncStream(command)).rejects.toMatchObject({
		exitCode: 7,
		stderr: "restore failed",
	});
});
