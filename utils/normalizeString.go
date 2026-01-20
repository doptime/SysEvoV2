package utils

import (
	"path/filepath"
	"strings"

	"sysevov2/config"

	"github.com/samber/lo"
)

func NormalizeFilename(name string) string {
	for found := true; found; {
		found = false
		for _, r := range []string{"Pathname", "pathname", "Path", "./", "src/", "app/", "a/", "b/"} {
			if strings.HasPrefix(name, r) {
				name = strings.TrimPrefix(name, r)
				found = true
			}
		}
	}
	for _, item := range config.AllEvoRealmsInFile {
		if strings.HasPrefix(name, item.Name) {
			name = "/" + item.Name + strings.TrimPrefix(name, item.Name)
		}
	}
	return name
}

func ToLocalEvoFile(path string) (string, *config.EvoRealm) {
	path = NormalizeFilename(path)
	realm, found := lo.Find(lo.Values(config.AllEvoRealmsInFile), func(r *config.EvoRealm) bool {
		return strings.HasPrefix(path, "/"+r.Name+"/")
	})
	if found && realm != nil {
		return filepath.Join(realm.RootPath, strings.TrimPrefix(path, "/"+realm.Name)), realm
	}
	return path, nil
}

func NormalizeFileContent(s string) string {
	s = strings.Replace(s, "use client;\n", "'use client';", 1)
	return s
}
