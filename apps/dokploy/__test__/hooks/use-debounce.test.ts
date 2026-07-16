import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
	callback: vi.fn(),
	memoDependencies: undefined as unknown[] | undefined,
	memoValue: undefined as unknown,
	setDebouncedValue: vi.fn(),
	useEffect: vi.fn(),
}));

vi.mock("react", async (importOriginal) => ({
	...(await importOriginal<typeof import("react")>()),
	useEffect: mocks.useEffect,
	useMemo: <T>(factory: () => T, dependencies: unknown[]) => {
		if (
			mocks.memoDependencies === undefined ||
			dependencies.some(
				(dependency, index) =>
					!Object.is(dependency, mocks.memoDependencies?.[index]),
			)
		) {
			mocks.memoDependencies = dependencies;
			mocks.memoValue = factory();
		}

		return mocks.memoValue as T;
	},
	useState: <T>(initial: T) => [initial, mocks.setDebouncedValue],
}));

import { useDebounce, useDebouncedCallback } from "@/utils/hooks/use-debounce";

describe("useDebounce", () => {
	beforeEach(() => {
		vi.useFakeTimers();
		vi.clearAllMocks();
		mocks.memoDependencies = undefined;
		mocks.memoValue = undefined;
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	it("only publishes the latest value after the delay", () => {
		useDebounce("first", 350);
		const cleanupFirst = mocks.useEffect.mock.calls[0]?.[0]?.() ?? (() => {});

		cleanupFirst();
		useDebounce("second", 350);
		mocks.useEffect.mock.calls[1]?.[0]?.();

		vi.advanceTimersByTime(349);
		expect(mocks.setDebouncedValue).not.toHaveBeenCalled();

		vi.advanceTimersByTime(1);
		expect(mocks.setDebouncedValue).toHaveBeenCalledOnce();
		expect(mocks.setDebouncedValue).toHaveBeenCalledWith("second");
	});

	it("cancels the pending update when the consumer unmounts", () => {
		useDebounce("search", 350);
		const cleanup = mocks.useEffect.mock.calls[0]?.[0]?.() ?? (() => {});

		cleanup();
		vi.advanceTimersByTime(350);

		expect(mocks.setDebouncedValue).not.toHaveBeenCalled();
	});

	it("coalesces repeated callback calls into the latest value", () => {
		const debouncedCallback = useDebouncedCallback(mocks.callback, 350);

		debouncedCallback("first");
		debouncedCallback("second");
		vi.advanceTimersByTime(350);

		expect(mocks.callback).toHaveBeenCalledOnce();
		expect(mocks.callback).toHaveBeenCalledWith("second");
	});

	it("keeps the callback and pending timer across an unrelated render", () => {
		const firstRenderCallback = useDebouncedCallback(mocks.callback, 350);
		firstRenderCallback("search");

		const secondRenderCallback = useDebouncedCallback(mocks.callback, 350);

		expect(secondRenderCallback).toBe(firstRenderCallback);
		vi.advanceTimersByTime(350);
		expect(mocks.callback).toHaveBeenCalledOnce();
		expect(mocks.callback).toHaveBeenCalledWith("search");
	});

	it("cancels a pending callback when the consumer unmounts", () => {
		const debouncedCallback = useDebouncedCallback(mocks.callback, 350);
		const cleanup = mocks.useEffect.mock.calls[0]?.[0]?.() ?? (() => {});

		debouncedCallback("search");
		cleanup();
		vi.advanceTimersByTime(350);

		expect(mocks.callback).not.toHaveBeenCalled();
	});
});
