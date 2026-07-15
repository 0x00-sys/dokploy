import { createPreviewServiceIfActive } from "@dokploy/server/utils/previews/guard";
import { expect, it, vi } from "vitest";

it("removes a preview service created while teardown deletes its record", async () => {
	let previewExists = true;
	let releaseCreate: (() => void) | undefined;
	let notifyCreateStarted: (() => void) | undefined;
	const createStarted = new Promise<void>((resolve) => {
		notifyCreateStarted = resolve;
	});
	const canFinishCreate = new Promise<void>((resolve) => {
		releaseCreate = resolve;
	});
	const removeService = vi.fn();

	const result = createPreviewServiceIfActive({
		previewExists: async () => previewExists,
		createService: async () => {
			notifyCreateStarted?.();
			await canFinishCreate;
		},
		removeService,
	});

	await createStarted;
	previewExists = false;
	releaseCreate?.();

	await expect(result).resolves.toBe(false);
	expect(removeService).toHaveBeenCalledOnce();
});

it("does not create a service after teardown has claimed the preview", async () => {
	const createService = vi.fn();

	await expect(
		createPreviewServiceIfActive({
			previewExists: async () => false,
			createService,
			removeService: vi.fn(),
		}),
	).resolves.toBe(false);
	expect(createService).not.toHaveBeenCalled();
});

it("treats a service already removed by teardown as cancelled", async () => {
	await expect(
		createPreviewServiceIfActive({
			previewExists: vi
				.fn()
				.mockResolvedValueOnce(true)
				.mockResolvedValueOnce(false),
			createService: vi.fn(),
			removeService: vi
				.fn()
				.mockRejectedValue(
					new Error("Error response from daemon: service preview-1 not found"),
				),
		}),
	).resolves.toBe(false);
});

it("does not hide genuine preview cleanup failures", async () => {
	const cleanupError = new Error("SSH connection failed");

	await expect(
		createPreviewServiceIfActive({
			previewExists: vi
				.fn()
				.mockResolvedValueOnce(true)
				.mockResolvedValueOnce(false),
			createService: vi.fn(),
			removeService: vi.fn().mockRejectedValue(cleanupError),
		}),
	).rejects.toBe(cleanupError);
});
