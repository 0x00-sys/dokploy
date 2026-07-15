import {
	addDomainToCompose,
	type Compose,
	getEnabledPatchForFilePath,
	type Patch,
} from "@dokploy/server";
import { describe, expect, it } from "vitest";

const createPatch = (overrides: Partial<Patch> = {}): Patch => ({
	patchId: "patch-1",
	type: "update",
	filePath: "docker-compose.yml",
	enabled: true,
	content: "",
	createdAt: "2026-01-01T00:00:00.000Z",
	updatedAt: "2026-01-01T00:00:00.000Z",
	applicationId: null,
	composeId: "compose-1",
	...overrides,
});

describe("Compose patch previews", () => {
	it("selects the enabled patch for the configured Compose path", () => {
		const patches = [
			createPatch({
				patchId: "disabled",
				filePath: "./deploy/docker-compose.yml",
				enabled: false,
			}),
			createPatch({
				patchId: "enabled",
				filePath: "deploy/docker-compose.yml",
			}),
		];

		expect(
			getEnabledPatchForFilePath(patches, "./deploy/docker-compose.yml")
				?.patchId,
		).toBe("enabled");
	});

	it("does not use a patch for a different file", () => {
		const patches = [createPatch({ filePath: "compose.override.yml" })];

		expect(
			getEnabledPatchForFilePath(patches, "docker-compose.yml"),
		).toBeUndefined();
	});

	it("uses the last patch when normalized paths target the same file", () => {
		const patches = [
			createPatch({ patchId: "first", filePath: "./docker-compose.yml" }),
			createPatch({ patchId: "last", filePath: "docker-compose.yml" }),
		];

		expect(
			getEnabledPatchForFilePath(patches, "./docker-compose.yml")?.patchId,
		).toBe("last");
	});

	it("converts the patched specification instead of loading the source file", async () => {
		const compose = {
			appName: "patched-preview",
			composeType: "docker-compose",
			serverId: null,
			randomize: false,
			isolatedDeployment: false,
		} as Compose;
		const patchedSpecification = {
			name: "patched-name",
			services: {
				web: {
					image: "nginx:patched",
				},
			},
		};

		const result = await addDomainToCompose(compose, [], patchedSpecification);

		expect(result).toMatchObject({
			name: "patched-name",
			services: {
				web: {
					image: "nginx:patched",
				},
			},
		});
	});
});
