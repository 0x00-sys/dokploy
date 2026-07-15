import { describe, expect, it } from "vitest";
import { appendLogChunk } from "@/components/dashboard/docker/logs/utils";

describe("appendLogChunk", () => {
	it("keeps only the newest configured number of log lines", () => {
		let buffer = "";

		for (let index = 1; index <= 1_000; index++) {
			buffer = appendLogChunk(buffer, `line ${index}\n`, 100);
		}

		const lines = buffer.trimEnd().split("\n");
		expect(lines).toHaveLength(100);
		expect(lines[0]).toBe("line 901");
		expect(lines.at(-1)).toBe("line 1000");
	});

	it("preserves an unfinished final line across chunks", () => {
		const firstChunk = appendLogChunk("", "line 1\npart", 2);
		const secondChunk = appendLogChunk(firstChunk, "ial\nline 3\n", 2);

		expect(secondChunk).toBe("partial\nline 3\n");
	});
});
