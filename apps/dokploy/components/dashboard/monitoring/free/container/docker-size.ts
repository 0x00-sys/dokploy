const DECIMAL_MEGABYTE = 1_000_000;

const unitBytes: Record<string, number> = {
	b: 1,
	kb: 1_000,
	mb: DECIMAL_MEGABYTE,
	gb: 1_000_000_000,
	tb: 1_000_000_000_000,
	kib: 1_024,
	mib: 1_024 ** 2,
	gib: 1_024 ** 3,
	tib: 1_024 ** 4,
};

export const convertDockerSizeToMegabytes = (size: string | number): number => {
	if (typeof size === "number") {
		return Number.isFinite(size) ? size : 0;
	}

	const match = size
		.trim()
		.match(/^([+-]?(?:\d+(?:\.\d*)?|\.\d+))\s*([kmgt]?i?b)?$/i);
	if (!match?.[1]) return 0;

	const value = Number.parseFloat(match[1]);
	if (!Number.isFinite(value)) return 0;

	const unit = match[2]?.toLowerCase();
	if (!unit) return value;

	const bytes = unitBytes[unit];
	return bytes === undefined ? 0 : (value * bytes) / DECIMAL_MEGABYTE;
};
