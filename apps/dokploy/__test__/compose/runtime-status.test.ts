import { describe, expect, it } from "vitest";
import { getComposeRuntimeStatus } from "@/hooks/use-compose-runtime-status";

describe("getComposeRuntimeStatus", () => {
	it("shows a stopped compose as running when Docker restarted its container", () => {
		expect(getComposeRuntimeStatus("idle", [{ state: "running" }])).toBe(
			"done",
		);
	});

	it("keeps an idle status when no compose container is running", () => {
		expect(getComposeRuntimeStatus("idle", [{ state: "exited" }])).toBe("idle");
	});

	it("does not hide deployment errors when an older container is running", () => {
		expect(getComposeRuntimeStatus("error", [{ state: "running" }])).toBe(
			"error",
		);
	});
});
