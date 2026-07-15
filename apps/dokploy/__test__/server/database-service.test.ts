import { updateOrCreateService } from "@dokploy/server/utils/databases/service";
import { beforeEach, describe, expect, it, vi } from "vitest";

const inspect = vi.fn();
const update = vi.fn();
const create = vi.fn();
const service = {
	inspect,
} as unknown as Parameters<typeof updateOrCreateService>[0];

describe("updateOrCreateService", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("creates a missing database service", async () => {
		inspect.mockRejectedValue(
			Object.assign(new Error("service not found"), { statusCode: 404 }),
		);

		await updateOrCreateService(service, create, update);

		expect(create).toHaveBeenCalledOnce();
		expect(update).not.toHaveBeenCalled();
	});

	it("updates an existing database service", async () => {
		const current = { Version: { Index: "7" } };
		inspect.mockResolvedValue(current);

		await updateOrCreateService(service, create, update);

		expect(update).toHaveBeenCalledWith(current);
		expect(create).not.toHaveBeenCalled();
	});

	it("preserves database service inspection errors", async () => {
		const inspectError = Object.assign(new Error("daemon unavailable"), {
			statusCode: 500,
		});
		inspect.mockRejectedValue(inspectError);

		await expect(updateOrCreateService(service, create, update)).rejects.toBe(
			inspectError,
		);

		expect(create).not.toHaveBeenCalled();
		expect(update).not.toHaveBeenCalled();
	});

	it("preserves database service update errors", async () => {
		const updateError = new Error("update rejected");
		inspect.mockResolvedValue({ Version: { Index: "7" } });
		update.mockRejectedValue(updateError);

		await expect(updateOrCreateService(service, create, update)).rejects.toBe(
			updateError,
		);

		expect(create).not.toHaveBeenCalled();
	});
});
