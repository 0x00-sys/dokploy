interface CommitFileChanges {
	added?: unknown;
	modified?: unknown;
	removed?: unknown;
}

export const normalizeChangedFilesFromCommits = (
	commits: Array<CommitFileChanges | null | undefined> | null | undefined,
): string[] => {
	if (!Array.isArray(commits)) return [];

	return commits
		.flatMap((commit) =>
			[commit?.added, commit?.modified, commit?.removed].flatMap((paths) =>
				Array.isArray(paths) ? paths : [],
			),
		)
		.filter((path): path is string => typeof path === "string" && path !== "");
};
