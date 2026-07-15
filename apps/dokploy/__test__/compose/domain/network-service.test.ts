import { addDokployNetworkToService } from "@dokploy/server";
import { describe, expect, it } from "vitest";

describe("addDokployNetworkToService", () => {
	it("preserves the implicit default network when no networks are declared", () => {
		const result = addDokployNetworkToService(undefined);
		expect(result).toEqual(["dokploy-network", "default"]);
	});

	it("preserves the implicit default network for an empty network list", () => {
		const result = addDokployNetworkToService([]);
		expect(result).toEqual(["dokploy-network", "default"]);
	});

	it("preserves the implicit default network for an empty network map", () => {
		const result = addDokployNetworkToService({});
		expect(result).toEqual({
			"dokploy-network": {},
			default: {},
		});
	});

	it("does not add a default network to an explicit network list", () => {
		const result = addDokployNetworkToService(["dokploy-network"]);
		expect(result).toEqual(["dokploy-network"]);
	});

	it("adds only the Dokploy network to an existing network list", () => {
		const result = addDokployNetworkToService(["other-network"]);
		expect(result).toEqual(["other-network", "dokploy-network"]);
	});

	it("adds only the Dokploy network to an existing network map", () => {
		const result = addDokployNetworkToService({ "other-network": {} });
		expect(result).toEqual({
			"other-network": {},
			"dokploy-network": {},
		});
	});

	it("should not duplicate default network when already present", () => {
		const result = addDokployNetworkToService(["default", "dokploy-network"]);
		expect(result).toEqual(["default", "dokploy-network"]);
	});
});
