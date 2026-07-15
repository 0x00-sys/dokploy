import { stopCompose } from "@dokploy/server/services/compose";
import * as execProcess from "@dokploy/server/utils/process/execAsync";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
	const updateChain = {
		set: vi.fn(),
		where: vi.fn(),
		returning: vi.fn(),
	};
	updateChain.set.mockReturnValue(updateChain);
	updateChain.where.mockReturnValue(updateChain);
	updateChain.returning.mockResolvedValue([{}]);

	return {
		findCompose: vi.fn(),
		update: vi.fn(() => updateChain),
	};
});

vi.mock("@dokploy/server/db", () => ({
	db: {
		query: {
			compose: {
				findFirst: mocks.findCompose,
			},
		},
		update: mocks.update,
	},
}));

vi.mock("@dokploy/server/utils/process/execAsync", () => ({
	ExecError: class ExecError extends Error {},
	execAsync: vi.fn(),
	execAsyncRemote: vi.fn(),
}));

const compose = {
	composeId: "compose-id",
	appName: "compose-app",
	composeType: "docker-compose",
	sourceType: "github",
	composePath: "deploy/compose.production.yml",
	serverId: "server-id",
};

describe("stopCompose", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mocks.findCompose.mockResolvedValue(compose);
		vi.mocked(execProcess.execAsync).mockResolvedValue({
			stdout: "",
			stderr: "",
		});
		vi.mocked(execProcess.execAsyncRemote).mockResolvedValue({
			stdout: "",
			stderr: "",
		});
	});

	it("stops a remote compose from its code directory using its configured file", async () => {
		await stopCompose(compose.composeId);

		expect(execProcess.execAsyncRemote).toHaveBeenCalledWith(
			compose.serverId,
			`cd /etc/dokploy/compose/${compose.appName}/code && env -i PATH="$PATH" docker compose -p ${compose.appName} -f ${compose.composePath} stop`,
		);
	});

	it("stops a local raw compose using the generated compose file", async () => {
		mocks.findCompose.mockResolvedValue({
			...compose,
			sourceType: "raw",
			composePath: "ignored.yml",
			serverId: null,
		});

		await stopCompose(compose.composeId);

		expect(execProcess.execAsync).toHaveBeenCalledWith(
			`env -i PATH="$PATH" docker compose -p ${compose.appName} -f docker-compose.yml stop`,
			{
				cwd: expect.stringMatching(/\/compose\/compose-app\/code$/),
			},
		);
	});
});
