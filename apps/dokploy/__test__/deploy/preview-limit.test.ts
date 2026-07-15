import { expect, it } from "vitest";
import { canQueuePreviewDeployment } from "@/server/utils/preview-limit";

it("allows an existing preview to rebuild after the old check exceeded the limit", () => {
	expect(
		canQueuePreviewDeployment({
			hasExistingPreview: true,
			previewCount: 4,
			previewLimit: 3,
		}),
	).toBe(true);
});

it("blocks a new preview at the configured limit", () => {
	expect(
		canQueuePreviewDeployment({
			hasExistingPreview: false,
			previewCount: 3,
			previewLimit: 3,
		}),
	).toBe(false);
});

it("uses the schema default without overriding an explicit zero limit", () => {
	expect(
		canQueuePreviewDeployment({
			hasExistingPreview: false,
			previewCount: 2,
			previewLimit: null,
		}),
	).toBe(true);
	expect(
		canQueuePreviewDeployment({
			hasExistingPreview: false,
			previewCount: 0,
			previewLimit: 0,
		}),
	).toBe(false);
});
