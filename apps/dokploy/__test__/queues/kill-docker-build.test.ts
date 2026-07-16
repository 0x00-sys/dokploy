import { beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
	execAsync: vi.fn(),
	execAsyncRemote: vi.fn(),
}));

vi.mock("@dokploy/server", () => ({
	IS_CLOUD: false,
	paths: () => ({
		APPLICATIONS_PATH: "/etc/dokploy/applications",
		COMPOSE_PATH: "/etc/dokploy/compose",
	}),
}));

vi.mock("@dokploy/server/utils/process/execAsync", () => ({
	execAsync: mocks.execAsync,
	execAsyncRemote: mocks.execAsyncRemote,
}));

vi.mock("@/server/queues/concurrency", () => ({
	resolveBuildsConcurrency: vi.fn(() => 1),
}));

vi.mock("@/server/queues/deployments-queue", () => ({
	processDeploymentJob: vi.fn(),
}));

import { getApplicationBuildKillCommand } from "@/server/queues/kill-build";
import { killDockerBuild } from "@/server/queues/queueSetup";

beforeEach(() => {
	vi.clearAllMocks();
	mocks.execAsync.mockResolvedValue({ stdout: "", stderr: "" });
	mocks.execAsyncRemote.mockResolvedValue({ stdout: "", stderr: "" });
});

it("reports local build termination failures to the caller", async () => {
	mocks.execAsync.mockRejectedValue(new Error("pkill failed"));

	await expect(killDockerBuild("application", null, "app-one")).rejects.toThrow(
		"pkill failed",
	);
});

it("reports remote build termination failures to the caller", async () => {
	mocks.execAsyncRemote.mockRejectedValue(new Error("ssh failed"));

	await expect(
		killDockerBuild("compose", "server-1", "compose-one"),
	).rejects.toThrow("ssh failed");
});

it("targets only the selected application build path", async () => {
	await killDockerBuild("application", null, "app-one");

	expect(mocks.execAsync).toHaveBeenCalledWith(
		getApplicationBuildKillCommand("/etc/dokploy/applications/app-one/code"),
	);
});

it("targets compose processes only in the selected project directory", async () => {
	await killDockerBuild("compose", "server-1", "compose.one");

	expect(mocks.execAsyncRemote).toHaveBeenCalledWith(
		"server-1",
		`matched=0; for pid in $(pgrep -f '[d]ocker compose'); do if [ "$(readlink "/proc/$pid/cwd" 2>/dev/null)" = '/etc/dokploy/compose/compose.one/code' ]; then kill -2 "$pid" || exit $?; matched=1; fi; done; [ "$matched" -eq 1 ]`,
	);
});
