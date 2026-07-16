const escapeProcessPattern = (value: string) =>
	value.replace(/[\\^$.*+?()[\]{}|]/g, "\\$&");

export const getApplicationBuildKillCommand = (buildPath: string) => {
	const escapedBuildPath = escapeProcessPattern(buildPath);
	const processPattern = `[/]${escapedBuildPath.slice(1)}`;

	return `signalled=0; signal_tree() { for child in $(pgrep -P "$1" 2>/dev/null); do signal_tree "$child"; done; if kill -2 "$1" 2>/dev/null; then signalled=1; fi; }; for pid in $(pgrep -f '${processPattern}'); do signal_tree "$pid"; done; [ "$signalled" -eq 1 ]`;
};
