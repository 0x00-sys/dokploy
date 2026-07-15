interface PreviewServiceGuard {
	previewExists: () => Promise<boolean>;
	createService: () => Promise<void>;
	removeService: () => Promise<void>;
}

const isMissingDockerServiceError = (error: unknown) => {
	const message =
		error instanceof Error
			? `${error.message}\n${"stderr" in error ? String(error.stderr) : ""}`
			: String(error);

	return /(?:no such service|service .* not found)/i.test(message);
};

export const createPreviewServiceIfActive = async ({
	previewExists,
	createService,
	removeService,
}: PreviewServiceGuard) => {
	if (!(await previewExists())) {
		return false;
	}

	await createService();

	if (await previewExists()) {
		return true;
	}

	try {
		await removeService();
	} catch (error) {
		if (!isMissingDockerServiceError(error)) {
			throw error;
		}
	}
	return false;
};
