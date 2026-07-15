import { describe, expect, it } from "vitest";
import { badgeVariants } from "@/components/ui/badge";

describe("badgeVariants", () => {
	it("keeps pointer events enabled for interactive direct icons", () => {
		const classes = badgeVariants();

		expect(classes).toContain(
			"[&>svg:not(.cursor-pointer)]:pointer-events-none",
		);
		expect(classes).not.toContain("[&>svg]:pointer-events-none");
	});
});
