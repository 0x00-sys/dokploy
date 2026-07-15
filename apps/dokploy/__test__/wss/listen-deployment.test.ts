import { expect, it } from "vitest";
import { isChildProcessRunning } from "@/server/wss/listen-deployment";

it("treats a signalled child as running until it exits", () => {
	expect(
		isChildProcessRunning({
			exitCode: null,
			signalCode: null,
		}),
	).toBe(true);
	expect(
		isChildProcessRunning({
			exitCode: null,
			signalCode: "SIGTERM",
		}),
	).toBe(false);
});
