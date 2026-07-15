import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
	setIsExecuting: vi.fn(),
	useEffect: vi.fn(),
}));

vi.mock("react", async (importOriginal) => ({
	...(await importOriginal<typeof import("react")>()),
	useCallback: <T extends (...args: never[]) => unknown>(callback: T) =>
		callback,
	useEffect: mocks.useEffect,
	useRef: <T>(initial: T) => ({ current: initial }),
	useState: () => [false, mocks.setIsExecuting],
}));

vi.mock("sonner", () => ({ toast: { success: vi.fn() } }));

import { useHealthCheckAfterMutation } from "@/hooks/use-health-check-after-mutation";

describe("health polling lifecycle", () => {
	beforeEach(() => {
		vi.useFakeTimers();
		vi.clearAllMocks();
		vi.stubGlobal(
			"fetch",
			vi.fn(() => Promise.resolve({ ok: false } as Response)),
		);
	});

	afterEach(() => {
		vi.unstubAllGlobals();
		vi.useRealTimers();
	});

	it("stops polling after the hook unmounts", async () => {
		const { execute } = useHealthCheckAfterMutation({
			initialDelay: 0,
			pollInterval: 100,
			successMessage: "Healthy",
		});
		const cleanup = mocks.useEffect.mock.calls[0]?.[0]?.() ?? (() => {});

		void execute(() => Promise.resolve());
		await vi.advanceTimersByTimeAsync(0);
		expect(fetch).toHaveBeenCalledOnce();

		cleanup();
		await vi.advanceTimersByTimeAsync(500);

		expect(fetch).toHaveBeenCalledOnce();
	});
});
