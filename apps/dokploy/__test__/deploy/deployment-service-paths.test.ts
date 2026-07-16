import { beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
	db: {
		select: vi.fn(),
	},
}));

vi.mock("@dokploy/server/db", () => ({ db: mocks.db }));

import { resolveServicePaths } from "@dokploy/server/services/deployment";

const selectResult = (rows: unknown[]) => {
	const chain = {
		from: vi.fn(),
		innerJoin: vi.fn(),
		where: vi.fn(),
	};
	chain.from.mockReturnValue(chain);
	chain.innerJoin.mockReturnValue(chain);
	chain.where.mockResolvedValue(rows);
	return chain;
};

beforeEach(() => {
	vi.clearAllMocks();
});

it("resolves every queued service path with two lightweight queries", async () => {
	mocks.db.select
		.mockReturnValueOnce(
			selectResult([
				{
					applicationId: "application-1",
					environmentId: "environment-1",
					organizationId: "org-1",
					projectId: "project-1",
				},
				{
					applicationId: "application-foreign",
					environmentId: "environment-foreign",
					organizationId: "org-2",
					projectId: "project-foreign",
				},
			]),
		)
		.mockReturnValueOnce(
			selectResult([
				{
					composeId: "compose-1",
					environmentId: "environment-2",
					organizationId: "org-1",
					projectId: "project-2",
				},
			]),
		);

	await expect(
		resolveServicePaths("org-1", [
			{ applicationId: "application-1" },
			{ applicationId: "application-1" },
			{ composeId: "compose-1" },
			{ applicationId: "application-foreign" },
			{ applicationId: "missing" },
			{ applicationId: 42, composeId: "compose-1" },
			{},
		]),
	).resolves.toEqual([
		{
			href: "/dashboard/project/project-1/environment/environment-1/services/application/application-1",
			label: "Application",
		},
		{
			href: "/dashboard/project/project-1/environment/environment-1/services/application/application-1",
			label: "Application",
		},
		{
			href: "/dashboard/project/project-2/environment/environment-2/services/compose/compose-1",
			label: "Compose",
		},
		{ href: null, label: "Application" },
		{ href: null, label: "—" },
		{ href: null, label: "—" },
		{ href: null, label: "—" },
	]);
	expect(mocks.db.select).toHaveBeenCalledTimes(2);
});

it("isolates a failed service-family lookup", async () => {
	const failedApplications = selectResult([]);
	failedApplications.where.mockRejectedValue(new Error("database unavailable"));
	mocks.db.select.mockReturnValueOnce(failedApplications).mockReturnValueOnce(
		selectResult([
			{
				composeId: "compose-1",
				environmentId: "environment-1",
				organizationId: "org-1",
				projectId: "project-1",
			},
		]),
	);

	await expect(
		resolveServicePaths("org-1", [
			{ applicationId: "application-1" },
			{ composeId: "compose-1" },
		]),
	).resolves.toEqual([
		{ href: null, label: "—" },
		{
			href: "/dashboard/project/project-1/environment/environment-1/services/compose/compose-1",
			label: "Compose",
		},
	]);
});
