import { beforeEach, describe, expect, it, vi } from "vitest";

type EnvironmentFormData = {
	buildArgs: string;
	buildSecrets: string;
	createEnvFile: boolean;
	env: string;
};

const mocks = vi.hoisted(() => ({
	formState: { isDirty: false },
	handleSubmit: vi.fn(),
	mutateAsync: vi.fn(),
	refetch: vi.fn(),
	reset: vi.fn(),
	submit: undefined as
		| ((formData: EnvironmentFormData) => Promise<void>)
		| undefined,
	useEffect: vi.fn(),
}));

vi.mock("react", async () => {
	const actual = await vi.importActual<typeof import("react")>("react");
	return {
		...actual,
		useEffect: mocks.useEffect,
	};
});

vi.mock("react-hook-form", async () => {
	const actual =
		await vi.importActual<typeof import("react-hook-form")>("react-hook-form");
	return {
		...actual,
		useForm: () => ({
			control: {},
			formState: mocks.formState,
			handleSubmit: mocks.handleSubmit,
			reset: mocks.reset,
			watch: vi.fn(() => ""),
		}),
	};
});

vi.mock("@/utils/api", () => ({
	api: {
		application: {
			one: {
				useQuery: () => ({
					data: {
						buildArgs: "FROM_QUERY=1",
						buildSecrets: "QUERY_SECRET=1",
						createEnvFile: false,
						env: "QUERY_VALUE=1",
					},
					refetch: mocks.refetch,
				}),
			},
			saveEnvironment: {
				useMutation: () => ({
					isPending: false,
					mutateAsync: mocks.mutateAsync,
				}),
			},
		},
		user: {
			getPermissions: {
				useQuery: () => ({ data: { envVars: { write: true } } }),
			},
		},
	},
}));

import { ShowEnvironment } from "@/components/dashboard/application/environment/show";

describe("application environment refresh", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mocks.formState.isDirty = false;
		mocks.handleSubmit.mockImplementation(
			(submit: (formData: EnvironmentFormData) => Promise<void>) => {
				mocks.submit = submit;
				return vi.fn();
			},
		);
		mocks.mutateAsync.mockResolvedValue(undefined);
		mocks.refetch.mockResolvedValue(undefined);
		mocks.submit = undefined;
	});

	it("syncs query data into a clean form", () => {
		ShowEnvironment({ applicationId: "application-1" });
		const syncForm = mocks.useEffect.mock.calls[0]?.[0];

		syncForm?.();

		expect(mocks.reset).toHaveBeenCalledWith({
			buildArgs: "FROM_QUERY=1",
			buildSecrets: "QUERY_SECRET=1",
			createEnvFile: false,
			env: "QUERY_VALUE=1",
		});
	});

	it("preserves unsaved edits when polling refreshes the query", () => {
		mocks.formState.isDirty = true;
		ShowEnvironment({ applicationId: "application-1" });
		const syncForm = mocks.useEffect.mock.calls[0]?.[0];

		syncForm?.();

		expect(mocks.reset).not.toHaveBeenCalled();
	});

	it("marks saved values as the new clean baseline after refetching", async () => {
		const savedValues = {
			buildArgs: "FROM_SAVED=1",
			buildSecrets: "SAVED_SECRET=1",
			createEnvFile: true,
			env: "SAVED_VALUE=1",
		};
		ShowEnvironment({ applicationId: "application-1" });

		await mocks.submit?.(savedValues);
		await vi.waitFor(() => expect(mocks.refetch).toHaveBeenCalledOnce());

		expect(mocks.reset).toHaveBeenCalledWith(savedValues);
		expect(mocks.refetch.mock.invocationCallOrder[0]).toBeLessThan(
			mocks.reset.mock.invocationCallOrder[0] ?? 0,
		);
	});
});
