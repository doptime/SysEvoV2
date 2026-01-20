package utils

import "strings"

func HasForbiddenWords(text string, forbiddenWords []string) bool {
	for _, word := range forbiddenWords {
		if strings.Contains(text, word) {
			return true
		}
	}
	return false
}
