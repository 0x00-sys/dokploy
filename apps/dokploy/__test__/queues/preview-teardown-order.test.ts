import { beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
	const events: string[] = [];
	const where = vi.fn(async () => {
		events.push("delete-preview");
	});
	return {
		events,
		where,
		db: {
			query: {
				previewDeployments: {
					findFirst: vi.fn(),
				},
			},
			delete: vi.fn(() => ({ where })),
		},
		findApplicationById: vi.fn(),
		removeService: vi.fn(async () => {
			events.push("remove-service");
		}),
		removeDeployments: vi.fn(),
		removeDirectory: vi.fn(),
		removeTraefikConfig: vi.fn(),
	};
});

vi.mock("@dokploy/server/db", () => ({ db: mocks.db }));
vi.mock("@dokploy/server/db/schema", () => ({
	deployments: {},
	organization: {},
	previewDeployments: { previewDeploymentId: "previewDeploymentId" },
}));
vi.mock("drizzle-orm", () => ({
	and: vi.fn(),
	desc: vi.fn(),
	eq: vi.fn(),
}));
vi.mock("@trpc/server", () => ({
	TRPCError: class TRPCError extends Error {},
}));
vi.mock("@dokploy/server/templates", () => ({ generatePassword: vi.fn() }));
vi.mock("@dokploy/server/utils/docker/utils", () => ({
	removeService: mocks.removeService,
}));
vi.mock("@dokploy/server/utils/filesystem/directory", () => ({
	removeDirectoryCode: mocks.removeDirectory,
}));
vi.mock("@dokploy/server/utils/providers/github", () => ({
	authGithub: vi.fn(),
}));
vi.mock("@dokploy/server/utils/traefik/application", () => ({
	removeTraefikConfig: mocks.removeTraefikConfig,
}));
vi.mock("@dokploy/server/utils/traefik/domain", () => ({
	manageDomain: vi.fn(),
}));
vi.mock("@dokploy/server/services/application", () => ({
	findApplicationById: mocks.findApplicationById,
}));
vi.mock("@dokploy/server/services/deployment", () => ({
	removeDeploymentsByPreviewDeploymentId: mocks.removeDeployments,
}));
vi.mock("@dokploy/server/services/domain", () => ({
	createDomain: vi.fn(),
}));
vi.mock("@dokploy/server/services/github", () => ({
	getIssueComment: vi.fn(),
}));
vi.mock("@dokploy/server/services/web-server-settings", () => ({
	getWebServerSettings: vi.fn(),
}));

import { removePreviewDeployment } from "@dokploy/server/services/preview-deployment";

beforeEach(() => {
	vi.clearAllMocks();
	mocks.events.length = 0;
	mocks.db.query.previewDeployments.findFirst.mockResolvedValue({
		previewDeploymentId: "preview-1",
		applicationId: "application-1",
		appName: "preview-app",
	});
	mocks.findApplicationById.mockResolvedValue({
		appName: "application",
		serverId: "runtime-server",
		buildServerId: "build-server",
	});
});

it("tombstones a preview before attempting service cleanup", async () => {
	await removePreviewDeployment("preview-1");

	expect(mocks.events).toEqual(["delete-preview", "remove-service"]);
	expect(mocks.removeDeployments).toHaveBeenCalledWith(
		expect.objectContaining({ previewDeploymentId: "preview-1" }),
		"build-server",
		"runtime-server",
	);
	expect(mocks.removeDirectory.mock.calls).toEqual([
		["preview-app", "build-server"],
		["preview-app", "runtime-server"],
	]);
});
