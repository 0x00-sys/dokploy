import { beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
	audit: vi.fn(),
	checkServicePermissionAndAccess: vi.fn(),
	findScheduleById: vi.fn(),
	runCommand: vi.fn(),
}));

vi.mock("@dokploy/server/index", async (importOriginal) => ({
	...(await importOriginal<typeof import("@dokploy/server/index")>()),
	runCommand: mocks.runCommand,
}));

vi.mock("@dokploy/server/services/permission", async (importOriginal) => ({
	...(await importOriginal<
		typeof import("@dokploy/server/services/permission")
	>()),
	checkServicePermissionAndAccess: mocks.checkServicePermissionAndAccess,
}));

vi.mock("@dokploy/server/services/schedule", async (importOriginal) => ({
	...(await importOriginal<
		typeof import("@dokploy/server/services/schedule")
	>()),
	findScheduleById: mocks.findScheduleById,
}));

vi.mock("@/server/api/utils/audit", () => ({ audit: mocks.audit }));

import { ScheduleRunError } from "@dokploy/server/utils/schedules/utils";
import { scheduleRouter } from "@/server/api/routers/schedule";

const caller = scheduleRouter.createCaller({
	req: {} as never,
	res: {} as never,
	db: null as never,
	session: { activeOrganizationId: "org-1" } as never,
	user: { id: "user-1", role: "member" } as never,
});

beforeEach(() => {
	vi.clearAllMocks();
	mocks.findScheduleById.mockResolvedValue({
		scheduleId: "schedule-1",
		scheduleType: "compose",
		composeId: "compose-1",
		applicationId: null,
	});
	mocks.checkServicePermissionAndAccess.mockResolvedValue(undefined);
});

it("returns deployment metadata when a manual run fails", async () => {
	mocks.runCommand.mockRejectedValue(
		new ScheduleRunError(
			"schedule-1",
			"deployment-1",
			new Error("container not found"),
		),
	);

	await expect(
		caller.runManually({ scheduleId: "schedule-1" }),
	).resolves.toEqual({
		scheduleId: "schedule-1",
		deploymentId: "deployment-1",
		status: "error",
		message: "container not found",
	});
	expect(mocks.audit).not.toHaveBeenCalled();
});

it("returns deployment metadata and audits a successful manual run", async () => {
	mocks.runCommand.mockResolvedValue({
		scheduleId: "schedule-1",
		deploymentId: "deployment-1",
		status: "done",
	});

	await expect(
		caller.runManually({ scheduleId: "schedule-1" }),
	).resolves.toMatchObject({
		deploymentId: "deployment-1",
		status: "done",
	});
	expect(mocks.audit).toHaveBeenCalledWith(
		expect.anything(),
		expect.objectContaining({
			action: "run",
			resourceId: "schedule-1",
		}),
	);
});
