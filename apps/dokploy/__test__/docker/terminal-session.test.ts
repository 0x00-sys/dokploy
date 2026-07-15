import { expect, it, vi } from "vitest";
import { disposeTerminalSession } from "@/components/dashboard/docker/terminal/session";

it("disposes the terminal before closing its socket", () => {
	const calls: string[] = [];
	const terminal = {
		dispose: vi.fn(() => calls.push("terminal")),
	};
	const socket = {
		close: vi.fn(() => calls.push("socket")),
	};

	disposeTerminalSession(terminal, socket);

	expect(calls).toEqual(["terminal", "socket"]);
});
