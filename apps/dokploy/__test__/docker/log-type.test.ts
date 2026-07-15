import { describe, expect, it } from "vitest";
import { getLogType } from "@/components/dashboard/docker/logs/utils";

describe("getLogType", () => {
	it.each([
		"Finished in 326ms, failed: false, skipped: false, error: none",
		'{"failed": false, "error": null}',
		'Finished in 326ms, error: ""',
		"Finished in 326ms, error: ''",
	])("does not mark explicit no-error values as errors", (message) => {
		expect(getLogType(message).type).toBe("info");
	});

	it.each([
		"Finished in 326ms, failed: true, error: none",
		"Finished in 326ms, failed: false, error: connection refused",
		`Finished in 326ms, error: "'`,
	])("still marks real failure values as errors", (message) => {
		expect(getLogType(message).type).toBe("error");
	});
});
