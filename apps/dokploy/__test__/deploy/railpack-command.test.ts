import { getRailpackCommand } from "@dokploy/server/utils/builders/railpack";
import { describe, expect, it } from "vitest";

const createApplication = (env: string) =>
	({
		appName: "railpack-app",
		buildType: "railpack",
		sourceType: "git",
		customGitBuildPath: "",
		serverId: null,
		buildServerId: null,
		cleanCache: false,
		railpackVersion: "0.15.4",
		env,
		environment: {
			env: "",
			project: { env: "" },
		},
	}) as Parameters<typeof getRailpackCommand>[0];

const getSecretsHash = (command: string) =>
	command.match(/--build-arg secrets-hash=([a-f0-9]{64})/)?.[1];

describe("getRailpackCommand", () => {
	it("invalidates cached build layers when environment values change", () => {
		const firstCommand = getRailpackCommand(
			createApplication("NEXT_PUBLIC_API_URL=https://old.example.com"),
		);
		const secondCommand = getRailpackCommand(
			createApplication("NEXT_PUBLIC_API_URL=https://new.example.com"),
		);

		expect(getSecretsHash(firstCommand)).toMatch(/^[a-f0-9]{64}$/);
		expect(getSecretsHash(secondCommand)).toMatch(/^[a-f0-9]{64}$/);
		expect(getSecretsHash(firstCommand)).not.toBe(
			getSecretsHash(secondCommand),
		);
	});
});
