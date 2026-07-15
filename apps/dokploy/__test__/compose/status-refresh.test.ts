import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
	mutateAsync: vi.fn(),
	oneUseQuery: vi.fn(),
	refetch: vi.fn(),
}));

vi.mock("next/router", () => ({
	useRouter: () => ({ push: vi.fn() }),
}));

vi.mock("@/utils/api", () => ({
	api: {
		user: {
			getPermissions: {
				useQuery: () => ({
					data: {
						deployment: { create: true },
						service: { create: true },
					},
				}),
			},
		},
		compose: {
			one: { useQuery: mocks.oneUseQuery },
			update: {
				useMutation: () => ({ mutateAsync: mocks.mutateAsync }),
			},
			deploy: {
				useMutation: () => ({ mutateAsync: mocks.mutateAsync }),
			},
			redeploy: {
				useMutation: () => ({ mutateAsync: mocks.mutateAsync }),
			},
			start: {
				useMutation: () => ({
					mutateAsync: mocks.mutateAsync,
					isPending: false,
				}),
			},
			stop: {
				useMutation: () => ({
					mutateAsync: mocks.mutateAsync,
					isPending: false,
				}),
			},
		},
	},
}));

import { ComposeActions } from "@/components/dashboard/compose/general/actions";

describe("Compose deployment status refresh", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mocks.oneUseQuery.mockReturnValue({
			data: {
				appName: "compose-app",
				composeStatus: "running",
				environment: { projectId: "project-1" },
				environmentId: "environment-1",
			},
			refetch: mocks.refetch,
		});
	});

	it("keeps refreshing while background deployment controls are visible", () => {
		ComposeActions({ composeId: "compose-1" });

		expect(mocks.oneUseQuery).toHaveBeenCalledWith(
			{ composeId: "compose-1" },
			{
				enabled: true,
				refetchInterval: 5000,
			},
		);
	});
});
