import { expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
	const updateChain = {
		set: vi.fn(),
		where: vi.fn(),
		returning: vi.fn(),
	};
	updateChain.set.mockReturnValue(updateChain);
	updateChain.where.mockReturnValue(updateChain);
	updateChain.returning.mockResolvedValue([]);

	return {
		db: { update: vi.fn(() => updateChain) },
		updateChain,
	};
});

vi.mock("@dokploy/server/db", () => ({ db: mocks.db }));

vi.mock("@dokploy/server/services/application", () => ({
	findApplicationById: vi.fn(),
	updateApplicationStatus: vi.fn(),
}));

import { updateDeploymentStatus } from "@dokploy/server/services/deployment";

it("records a finish time when a deployment is cancelled", async () => {
	await updateDeploymentStatus("deployment-1", "cancelled");

	expect(mocks.updateChain.set).toHaveBeenCalledWith({
		status: "cancelled",
		finishedAt: expect.any(String),
	});
});
