import { addDomainToCompose, type Compose } from "@dokploy/server";
import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
	execAsyncRemote: vi.fn(),
}));

vi.mock("@dokploy/server/utils/process/execAsync", async (importOriginal) => ({
	...(await importOriginal<
		typeof import("@dokploy/server/utils/process/execAsync")
	>()),
	execAsyncRemote: mocks.execAsyncRemote,
}));

describe("raw Compose conversion", () => {
	it("uses the stored source and preserves tmpfs and long-syntax mounts", async () => {
		const compose = {
			appName: "raw-stack",
			composeFile: `
services:
  test:
    image: alpine:latest
    tmpfs:
      - /cache
    volumes:
      - type: tmpfs
        target: /scratch
      - type: volume
        source: data
        target: /data
volumes:
  data: {}
`,
			composeType: "stack",
			serverId: "server-1",
			sourceType: "raw",
			randomize: false,
			isolatedDeployment: false,
		} as Compose;

		const result = await addDomainToCompose(compose, []);

		expect(mocks.execAsyncRemote).not.toHaveBeenCalled();
		expect(result?.services?.test?.tmpfs).toEqual(["/cache"]);
		expect(result?.services?.test?.volumes).toEqual([
			{ type: "tmpfs", target: "/scratch" },
			{ type: "volume", source: "data", target: "/data" },
		]);
	});
});
