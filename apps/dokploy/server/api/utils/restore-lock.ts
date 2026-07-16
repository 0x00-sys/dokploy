const globalForRestoreLocks = globalThis as typeof globalThis & {
	__dokployActiveRestores?: Set<string>;
};

const activeRestores =
	globalForRestoreLocks.__dokployActiveRestores ?? new Set<string>();

globalForRestoreLocks.__dokployActiveRestores = activeRestores;

export const runWithRestoreLock = async <T>(
	key: string,
	restore: () => Promise<T>,
): Promise<T> => {
	if (activeRestores.has(key)) {
		throw new Error("A restore is already running for this service");
	}

	activeRestores.add(key);
	try {
		return await restore();
	} finally {
		activeRestores.delete(key);
	}
};
