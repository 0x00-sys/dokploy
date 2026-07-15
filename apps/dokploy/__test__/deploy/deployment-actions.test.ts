import { describe, expect, it } from "vitest";
import { canDeleteDeployment } from "@/components/dashboard/application/deployments/show-deployments";

describe("canDeleteDeployment", () => {
	it.each(["done", "error", "cancelled"])(
		"allows deleting terminal %s deployments",
		(status) => {
			expect(canDeleteDeployment(status)).toBe(true);
		},
	);

	it("keeps the delete action hidden for running deployments", () => {
		expect(canDeleteDeployment("running")).toBe(false);
	});
});
