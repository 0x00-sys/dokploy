import { spawnAsync } from "@dokploy/server/utils/process/spawnAsync";
import { expect, it } from "vitest";

const MAX_CAPTURED_OUTPUT_BYTES = 1024 * 1024;
const LARGE_OUTPUT_BYTES = MAX_CAPTURED_OUTPUT_BYTES * 2;

it("bounds captured stdout while continuing to stream all output", async () => {
	let streamedBytes = 0;
	const stdout = await spawnAsync(
		process.execPath,
		["-e", `process.stdout.write("x".repeat(${LARGE_OUTPUT_BYTES}))`],
		(data) => {
			streamedBytes += Buffer.byteLength(data);
		},
	);

	expect(streamedBytes).toBe(LARGE_OUTPUT_BYTES);
	expect(stdout.length).toBe(MAX_CAPTURED_OUTPUT_BYTES);
});

it("bounds stderr retained on a failed command", async () => {
	let error: unknown;
	try {
		await spawnAsync(process.execPath, [
			"-e",
			`process.stderr.write("x".repeat(${LARGE_OUTPUT_BYTES}), () => process.exit(1))`,
		]);
	} catch (caught) {
		error = caught;
	}

	expect(error).toBeInstanceOf(Error);
	expect((error as Error & { stderr: { length: number } }).stderr.length).toBe(
		MAX_CAPTURED_OUTPUT_BYTES,
	);
});
