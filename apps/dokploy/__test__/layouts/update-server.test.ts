import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
	isCloud: undefined as boolean | undefined,
	getUpdateData: vi.fn(() => Promise.resolve({ updateAvailable: false })),
	useEffect: vi.fn(),
}));

vi.mock("react", async (importOriginal) => ({
	...(await importOriginal<typeof import("react")>()),
	useEffect: mocks.useEffect,
	useRef: () => ({ current: null }),
	useState: <T>(initial: T) => [initial, vi.fn()],
}));

vi.mock("@/utils/api", () => ({
	api: {
		settings: {
			isCloud: { useQuery: () => ({ data: mocks.isCloud }) },
			getUpdateData: {
				useMutation: () => ({ mutateAsync: mocks.getUpdateData }),
			},
		},
	},
}));

import { UpdateServerButton } from "@/components/layouts/update-server";

describe("automatic update checks", () => {
	beforeEach(() => {
		vi.useFakeTimers();
		vi.clearAllMocks();
		mocks.isCloud = undefined;
		vi.stubGlobal("localStorage", {
			getItem: vi.fn(() => null),
			setItem: vi.fn(),
		});
	});

	afterEach(() => {
		vi.unstubAllGlobals();
		vi.useRealTimers();
	});

	it("waits for self-hosted mode before starting the interval", () => {
		UpdateServerButton();
		const [pendingEffect, pendingDependencies] = mocks.useEffect.mock.calls[0]!;
		pendingEffect();

		expect(vi.getTimerCount()).toBe(0);
		expect(pendingDependencies).toEqual([undefined]);

		mocks.useEffect.mockClear();
		mocks.isCloud = false;
		UpdateServerButton();
		const [selfHostedEffect, selfHostedDependencies] =
			mocks.useEffect.mock.calls[0]!;
		const cleanup = selfHostedEffect();

		expect(vi.getTimerCount()).toBe(1);
		expect(selfHostedDependencies).toEqual([false]);
		cleanup();
		expect(vi.getTimerCount()).toBe(0);
	});
});
