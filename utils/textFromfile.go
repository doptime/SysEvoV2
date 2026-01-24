package utils

import (
	"fmt"
	"os"
	"strings"

	"sysevov2/config"

	"github.com/dustin/go-humanize"
)

func TextFromFiles(xmlTag string, filenames ...string) string {
	var sb strings.Builder
	for _, filename := range filenames {
		content, err := os.ReadFile(filename)
		if err != nil {
			fmt.Printf("Error reading file %s: %v\n", filename, err)
			continue
		}
		text := string(content)
		text = strings.TrimSpace(text)
		if text != "" {
			sb.WriteString(fmt.Sprintf("\n<%s name=\"%s\">\n%s\n</%s>\n", xmlTag, filename, text, xmlTag))
		}
	}
	return sb.String()
}
func TextFromFile(filename string, Content ...*string) string {
	content, err := os.ReadFile(filename)
	if err != nil {
		fmt.Printf("Error reading file %s: %v\n", filename, err)
		return ""
	}
	text := string(content)
	text = strings.TrimSpace(text)
	if len(Content) > 0 && Content[0] != nil && text != "" {
		*Content[0] = text
	}
	return text
}

func TextFromEvoRealms(fileKeepMap map[string]bool, realms ...*config.EvoRealm) string {
	var sb strings.Builder
	for _, realm := range realms {
		realm.WalkDir(func(path, relativePath string, info os.FileInfo) (e error) {
			fmt.Printf("Processing file: %s\n", path)
			if len(fileKeepMap) > 0 {
				if _, ok := fileKeepMap[relativePath]; !ok {
					return nil
				}
			}

			// Read the file content
			content := TextFromFile(path)
			if binaryFile := strings.Contains(string(content), "\x00") || len(content) == 0; binaryFile {
				return nil
			}
			fileSz := "\n<file-size>" + humanize.Bytes(uint64(len(content))) + "</file-size>"
			fileContent := "\n<file-content>\n" + LineNumberedFileContent(string(content), 1) + "\n</file-content>"

			fileinfo := fmt.Sprint("\n<file>\n<file-name>", relativePath, "</file-name>"+fileSz, fileContent, "\n</file>\n")

			sb.WriteString(fileinfo)
			return nil
		})
	}
	return sb.String()
}
