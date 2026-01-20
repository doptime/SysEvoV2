package utils

type GitDiffs struct {
	Diffs []string `toml:"Diffs"`
}

func AppendGitDiff(gitdiffFile string, diff string) error {
	OldDiffs, newDiffs := GitDiffs{}, GitDiffs{Diffs: []string{diff}}
	FromTomlFile(gitdiffFile, &OldDiffs)
	newDiffs.Diffs = append(newDiffs.Diffs, OldDiffs.Diffs...)
	return ToTomlFile(gitdiffFile, diff)
}
func UpdateLatestGitDiff(gitdiffFile string, latestDiff string) error {
	OldDiffs := GitDiffs{}
	FromTomlFile(gitdiffFile, &OldDiffs)
	if len(OldDiffs.Diffs) > 0 {
		OldDiffs.Diffs[0] = latestDiff
	}

	//key 200 item  max
	if len(OldDiffs.Diffs) > 200 {
		OldDiffs.Diffs = OldDiffs.Diffs[:200]
	}
	return ToTomlFile(gitdiffFile, OldDiffs)
}
