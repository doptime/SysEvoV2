package utils

import (
	"fmt"
	"log"
	"os"
	"path/filepath"
	"strconv"
	"strings"

	"sysevov2/config"
)

func RemoveLineNumber(s string) string {
	newLinesNoLineNum := strings.Split(s, "\n")
	preNum := -1
	for i, line := range newLinesNoLineNum {
		if items := strings.SplitN(line, ":", 1); len(items) > 1 {
			if num, err := strconv.Atoi(items[0]); err == nil {
				if preNum == -1 || preNum == num-1 {
					newLinesNoLineNum[i] = items[1]
				}
				preNum = num
			}
		}
	}
	return strings.Join(newLinesNoLineNum, "\n")
}
func FilesNamesInDir(dirPath string) []string {
	// Check if the directory exists
	info, err := os.Stat(dirPath)
	if os.IsNotExist(err) {
		log.Printf("Directory does not exist: %s", dirPath)
		return nil
	}
	if !info.IsDir() {
		log.Printf("Provided path is not a directory: %s", dirPath)
		return nil
	}
	allFiles := []string{}
	// Walk through the directory
	filepath.Walk(dirPath, func(path string, info os.FileInfo, err error) error {
		if err != nil {
			log.Printf("Error accessing path %q: %v\n", path, err)
			return err
		}
		if info.IsDir() {
			return nil
		}
		allFiles = append(allFiles, path)
		return nil
	})
	return allFiles
}

func LineNumberedPathContent(path string, evoRealm *config.EvoRealm, lineNumberStart int) string {
	allFiles := FilesNamesInDir(path)
	var allFileContent strings.Builder
	for _, file := range allFiles {
		relativePath := evoRealm.RelativePath(file)
		content := ReadFile(file)
		if lineNumberStart <= 0 {
			allFileContent.WriteString("\n\n<file path=\"" + relativePath + "\">\n" + content + "\n</file>\n")
		} else {
			allFileContent.WriteString("\n\n<file path=\"" + relativePath + "\">\nContent: \n" + LineNumberedFileContent(content, lineNumberStart) + "\nEOF\n</file>\n")
		}
	}
	return allFileContent.String()
}

func LineNumberedFileContent(s string, lineNumberStart int) string {
	s = NormalizeFileContent(s)
	lines := strings.Split(s, "\n")
	for i := range lines {
		lines[i] = fmt.Sprintf("%d: %s", i+lineNumberStart, lines[i])
	}
	return strings.Join(lines, "\n")
}
func LineNumberedMap(s string, lineNumberStart int) map[int]string {
	s = NormalizeFileContent(s)
	lines := strings.Split(s, "\n")
	linesMap := map[int]string{}
	for i, t := range lines {
		linesMap[i+lineNumberStart] = t
	}
	return linesMap
}
