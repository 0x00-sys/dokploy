import {
	normalizeChangedFilesFromCommits,
	shouldDeploy,
} from "@dokploy/server";
import { describe, expect, it } from "vitest";

describe("normalizeChangedFilesFromCommits", () => {
	it("includes added, modified, and removed files", () => {
		expect(
			normalizeChangedFilesFromCommits([
				{
					added: ["src/new.ts"],
					modified: ["src/current.ts"],
					removed: ["src/old.ts"],
				},
			]),
		).toEqual(["src/new.ts", "src/current.ts", "src/old.ts"]);
	});

	it("matches watch paths when files are only added or removed", () => {
		const files = normalizeChangedFilesFromCommits([
			{ added: ["src/new.ts"], removed: ["src/old.ts"] },
		]);

		expect(shouldDeploy(["src/new.ts"], files)).toBe(true);
		expect(shouldDeploy(["src/old.ts"], files)).toBe(true);
	});

	it("ignores missing and invalid changed-file entries", () => {
		expect(
			normalizeChangedFilesFromCommits([
				{
					added: undefined,
					modified: [undefined, "src/current.ts", ""],
					removed: [null, "src/old.ts"],
				},
				undefined,
				{ added: "not-an-array" },
			]),
		).toEqual(["src/current.ts", "src/old.ts"]);
	});

	it("returns no files when commits are missing", () => {
		expect(normalizeChangedFilesFromCommits(undefined)).toEqual([]);
		expect(normalizeChangedFilesFromCommits(null)).toEqual([]);
	});
});
