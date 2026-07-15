import { describe, expect, it } from "vitest";
import {
	appendRuntimeLogChunk,
	cloneRuntimeLogBuffer,
	createRuntimeLogBuffer,
} from "@/components/dashboard/docker/logs/runtime-log-buffer";

describe("runtime log buffer", () => {
	it("parses each chunk incrementally and keeps only the newest lines", () => {
		const buffer = createRuntimeLogBuffer(100);

		for (let index = 1; index <= 1_000; index++) {
			appendRuntimeLogChunk(buffer, `2026-01-01T00:00:00.000Z line ${index}\n`);
		}

		expect(buffer.logs).toHaveLength(100);
		expect(buffer.logs[0]?.message).toBe("line 901");
		expect(buffer.logs.at(-1)?.message).toBe("line 1000");
	});

	it("replaces an unfinished displayed line when the next chunk completes it", () => {
		const buffer = createRuntimeLogBuffer(10);

		appendRuntimeLogChunk(buffer, "2026-01-01T00:00:00.000Z part");
		appendRuntimeLogChunk(buffer, "ial\nnext\n");

		expect(buffer.logs.map((log) => log.message)).toEqual(["partial", "next"]);
		expect(buffer.hasPendingLog).toBe(false);
	});

	it("clones paused state without mutating the displayed buffer", () => {
		const displayed = createRuntimeLogBuffer(10);
		appendRuntimeLogChunk(displayed, "visible\n");
		const paused = cloneRuntimeLogBuffer(displayed);

		appendRuntimeLogChunk(paused, "buffered\n");

		expect(displayed.logs.map((log) => log.message)).toEqual(["visible"]);
		expect(paused.logs.map((log) => log.message)).toEqual([
			"visible",
			"buffered",
		]);
	});
});
