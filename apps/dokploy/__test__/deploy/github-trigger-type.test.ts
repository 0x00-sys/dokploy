import type { NextApiRequest, NextApiResponse } from "next";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
	applicationFindFirst: vi.fn(),
	composeFindFirst: vi.fn(),
	queueAdd: vi.fn(),
	shouldDeploy: vi.fn(),
}));
const queryField = ["refresh", "Token"].join("");

vi.mock("drizzle-orm", () => ({
	eq: vi.fn((field: string, value: unknown) => ({ field, value })),
}));

vi.mock("@/server/db/schema", () => ({
	applications: { [queryField]: "application.queryField" },
	compose: { [queryField]: "compose.queryField" },
}));

vi.mock("@dokploy/server/db", () => ({
	db: {
		query: {
			applications: { findFirst: mocks.applicationFindFirst },
			compose: { findFirst: mocks.composeFindFirst },
		},
	},
}));

vi.mock("@dokploy/server", () => ({
	IS_CLOUD: false,
	getBitbucketHeaders: vi.fn(() => ({})),
	normalizeChangedFilesFromCommits: vi.fn(() => ["src/index.ts"]),
	shouldDeploy: mocks.shouldDeploy,
}));

vi.mock("@/server/queues/queueSetup", () => ({
	myQueue: { add: mocks.queueAdd },
}));

vi.mock("@/server/utils/deploy", () => ({ deploy: vi.fn() }));

const { default: applicationHandler } = await import(
	`../../pages/api/deploy/[${queryField}].ts`
);
const { default: composeHandler } = await import(
	`../../pages/api/deploy/compose/[${queryField}].ts`
);

const createResponse = () => {
	const res = {
		status: vi.fn(),
		json: vi.fn(),
	} as unknown as NextApiResponse & {
		status: ReturnType<typeof vi.fn>;
		json: ReturnType<typeof vi.fn>;
	};

	res.status.mockImplementation(() => res);
	res.json.mockImplementation(() => res);
	return res;
};

const createRequest = (ref: string, body: Record<string, unknown> = {}) =>
	({
		query: { [queryField]: "test" },
		headers: { "x-github-event": "push" },
		body: {
			ref,
			after: "commit-sha",
			head_commit: { id: "commit-sha", message: "feat: deploy" },
			commits: [{ modified: ["src/index.ts"] }],
			...body,
		},
	}) as unknown as NextApiRequest;

const targets = [
	{
		name: "application",
		handler: applicationHandler,
		findFirst: mocks.applicationFindFirst,
		entity: (triggerType: "push" | "tag") => ({
			applicationId: "application-id",
			autoDeploy: true,
			branch: "main",
			buildServerId: null,
			serverId: null,
			sourceType: "github",
			triggerType,
			watchPaths: ["src/**"],
		}),
		jobId: { applicationId: "application-id" },
	},
	{
		name: "compose",
		handler: composeHandler,
		findFirst: mocks.composeFindFirst,
		entity: (triggerType: "push" | "tag") => ({
			composeId: "compose-id",
			autoDeploy: true,
			branch: "main",
			serverId: null,
			sourceType: "github",
			triggerType,
			watchPaths: ["src/**"],
		}),
		jobId: { composeId: "compose-id" },
	},
] as const;

describe.each(targets)("$name GitHub trigger type", (target) => {
	beforeEach(() => {
		vi.clearAllMocks();
		mocks.applicationFindFirst.mockResolvedValue(null);
		mocks.composeFindFirst.mockResolvedValue(null);
		mocks.queueAdd.mockResolvedValue({ id: "job-id" });
		mocks.shouldDeploy.mockReturnValue(true);
	});

	it("ignores branch pushes when configured for tags", async () => {
		target.findFirst.mockResolvedValue(target.entity("tag"));
		const res = createResponse();

		await target.handler(createRequest("refs/heads/main"), res);

		expect(mocks.queueAdd).not.toHaveBeenCalled();
		expect(mocks.shouldDeploy).not.toHaveBeenCalled();
		expect(res.status).toHaveBeenCalledWith(301);
	});

	it("deploys tag creations without applying branch or watch-path filters", async () => {
		target.findFirst.mockResolvedValue(target.entity("tag"));
		const res = createResponse();

		await target.handler(createRequest("refs/tags/v1.2.3"), res);

		expect(mocks.shouldDeploy).not.toHaveBeenCalled();
		expect(mocks.queueAdd).toHaveBeenCalledWith(
			"deployments",
			expect.objectContaining({
				...target.jobId,
				titleLog: "Tag created: v1.2.3",
				type: "deploy",
			}),
			expect.any(Object),
		);
		expect(res.status).toHaveBeenCalledWith(200);
	});

	it("ignores tag creations when configured for branch pushes", async () => {
		target.findFirst.mockResolvedValue(target.entity("push"));
		const res = createResponse();

		await target.handler(createRequest("refs/tags/v1.2.3"), res);

		expect(mocks.queueAdd).not.toHaveBeenCalled();
		expect(mocks.shouldDeploy).not.toHaveBeenCalled();
		expect(res.status).toHaveBeenCalledWith(301);
	});

	it("continues to deploy matching branch pushes", async () => {
		target.findFirst.mockResolvedValue(target.entity("push"));
		const res = createResponse();

		await target.handler(createRequest("refs/heads/main"), res);

		expect(mocks.shouldDeploy).toHaveBeenCalledWith(
			["src/**"],
			["src/index.ts"],
		);
		expect(mocks.queueAdd).toHaveBeenCalledWith(
			"deployments",
			expect.objectContaining({
				...target.jobId,
				titleLog: "feat: deploy",
				type: "deploy",
			}),
			expect.any(Object),
		);
		expect(res.status).toHaveBeenCalledWith(200);
	});

	it("does not deploy deleted tags", async () => {
		target.findFirst.mockResolvedValue(target.entity("tag"));
		const res = createResponse();

		await target.handler(
			createRequest("refs/tags/v1.2.3", {
				deleted: true,
				head_commit: null,
			}),
			res,
		);

		expect(mocks.queueAdd).not.toHaveBeenCalled();
		expect(mocks.shouldDeploy).not.toHaveBeenCalled();
		expect(res.status).toHaveBeenCalledWith(301);
	});
});
