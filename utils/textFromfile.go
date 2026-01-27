package utils

import (
	"fmt"
	"os"
	"strings"

	"sysevov2/config"

	"github.com/dustin/go-humanize"
)

func WrapFilesInXML(xmlTag string, filenames ...string) string {
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

// ReadFile reads and returns the trimmed content of a file.
// On error, prints a message and returns an empty string.
func ReadFile(filename string) string {
	content, err := os.ReadFile(filename)
	if err != nil {
		fmt.Printf("Error reading file %s: %v\n", filename, err)
		return ""
	}
	return strings.TrimSpace(string(content))
}

// ReadFileTo reads file content and assigns it to the target pointer
// if the content is non-empty. Returns whether assignment occurred.
// On read error, prints a message and returns false without assignment.
func ReadFileTo(filename string, target *string) bool {
	content := ReadFile(filename)
	if target != nil && content != "" {
		*target = content
		return true
	}
	return false
}

// GenerateAnnotatedXMLFromEvoRealms traverses EvoRealm directory structures,
// filters files via keep-map, skips binary/empty files, and generates XML output
// with metadata (filename, human-readable size) and line-numbered content.
func GenerateAnnotatedXMLFromEvoRealms(fileKeepMap map[string]bool, realms ...*config.EvoRealm) string {
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
			content := ReadFile(path)
			if binaryFile := strings.Contains(content, "\x00") || len(content) == 0; binaryFile {
				return nil
			}
			fileSz := "\n<file-size>" + humanize.Bytes(uint64(len(content))) + "</file-size>"
			fileContent := "\n<file-content>\n" + LineNumberedFileContent(content, 1) + "\n</file-content>"

			fileinfo := fmt.Sprint("\n<file>\n<file-name>", relativePath, "</file-name>"+fileSz, fileContent, "\n</file>\n")

			sb.WriteString(fileinfo)
			return nil
		})
	}
	return sb.String()
}
