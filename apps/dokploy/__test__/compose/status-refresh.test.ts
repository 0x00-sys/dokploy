import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
	mutateAsync: vi.fn(),
	containersUseQuery: vi.fn(),
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
		docker: {
			getContainersByAppNameMatch: {
				useQuery: mocks.containersUseQuery,
			},
		},
	},
}));

import { ComposeActions } from "@/components/dashboard/compose/general/actions";
import { useComposeRuntimeStatus } from "@/hooks/use-compose-runtime-status";

describe("Compose deployment status refresh", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mocks.oneUseQuery.mockReturnValue({
			data: {
				appName: "compose-app",
				composeType: "docker-compose",
				composeStatus: "running",
				environment: { projectId: "project-1" },
				environmentId: "environment-1",
			},
			refetch: mocks.refetch,
		});
		mocks.containersUseQuery.mockReturnValue({ data: [] });
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

	it("checks Docker without adding a second polling owner in the actions", () => {
		mocks.oneUseQuery.mockReturnValue({
			data: {
				appName: "compose-app",
				composeType: "docker-compose",
				composeStatus: "idle",
				environment: { projectId: "project-1" },
				environmentId: "environment-1",
			},
			refetch: mocks.refetch,
		});

		ComposeActions({ composeId: "compose-1" });

		expect(mocks.containersUseQuery).toHaveBeenCalledWith(
			{
				appName: "compose-app",
				appType: "docker-compose",
				serverId: undefined,
			},
			{ enabled: true, refetchInterval: false },
		);
	});

	it("polls Docker from the page-level runtime status owner", () => {
		useComposeRuntimeStatus({
			appName: "compose-app",
			appType: "docker-compose",
			composeStatus: "idle",
			poll: true,
		});

		expect(mocks.containersUseQuery).toHaveBeenCalledWith(
			{
				appName: "compose-app",
				appType: "docker-compose",
				serverId: undefined,
			},
			{ enabled: true, refetchInterval: 5000 },
		);
	});

	it("does not reconcile stacks using a prefix-based container match", () => {
		mocks.oneUseQuery.mockReturnValue({
			data: {
				appName: "compose-app",
				composeType: "stack",
				composeStatus: "idle",
				environment: { projectId: "project-1" },
				environmentId: "environment-1",
			},
			refetch: mocks.refetch,
		});
		mocks.containersUseQuery.mockReturnValue({
			data: [{ state: "running" }],
		});

		ComposeActions({ composeId: "compose-1" });

		expect(mocks.containersUseQuery).toHaveBeenCalledWith(
			{
				appName: "compose-app",
				appType: "stack",
				serverId: undefined,
			},
			{ enabled: false, refetchInterval: false },
		);
		expect(
			useComposeRuntimeStatus({
				appName: "compose-app",
				appType: "stack",
				composeStatus: "idle",
			}).composeStatus,
		).toBe("idle");
	});
});
