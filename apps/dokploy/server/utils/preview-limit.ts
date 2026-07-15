interface PreviewLimitInput {
	hasExistingPreview: boolean;
	previewCount: number;
	previewLimit: number | null | undefined;
}

export const canQueuePreviewDeployment = ({
	hasExistingPreview,
	previewCount,
	previewLimit,
}: PreviewLimitInput) =>
	hasExistingPreview || previewCount < (previewLimit ?? 3);
