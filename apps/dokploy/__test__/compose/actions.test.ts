import { describe, expect, it } from "vitest";
import { getComposeLifecycleAction } from "@/components/dashboard/compose/general/actions";

describe("getComposeLifecycleAction", () => {
	it("shows Start for any idle compose service", () => {
		expect(getComposeLifecycleAction("idle")).toBe("start");
	});

	it("shows Stop for a running service", () => {
		expect(getComposeLifecycleAction("done")).toBe("stop");
	});
});
