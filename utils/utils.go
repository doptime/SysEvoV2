package utils

import (
	"fmt"
	"strconv"
	"strings"
)

func TagContent(s string, tagSeperator string) (tag string) {
	ind := strings.Index(s, tagSeperator)
	if ind < 0 {
		return ""
	}
	endingTagSeperator := "</" + tagSeperator[1:]
	ind2 := strings.Index(s, endingTagSeperator)
	if ind2 < 0 {
		return ""
	}
	return s[ind+len(tagSeperator) : ind2]
}

func ReadFloatAfterTag(s string, tags ...string) (float64, error) {
	ind, tag := -1, ""
	for i := 0; i < len(tags) && ind < 0; i++ {
		tag = tags[i]
		ind = strings.Index(s, tag)
	}
	if ind < 0 {
		return 0, nil
	}
	s = s[ind+len(tag):]
	var num strings.Builder
	for ind = 0; ind < len(s) && (ind < 15) && num.Len() == 0; ind++ {
		for ; ind < len(s) && strings.Contains("-0123456789.", string(s[ind])); ind++ {
			num.WriteByte(s[ind])
		}
	}
	numStr := num.String()
	if numStr == "" {
		return 0, fmt.Errorf("no number found after tag %s", tag)
	}
	return strconv.ParseFloat(numStr, 64)
}
func ReadMarkdownTagOut(s string, tags ...string) string {
	ind, tag := -1, ""
	for i := 0; i < len(tags) && ind < 0; i++ {
		tag = tags[i]
		ind = strings.Index(s, tag)
	}
	if ind < 0 {
		return ""
	}
	s = s[ind+len(tag):]
	if ind := strings.Index(s, "\n"); ind > 0 && ind < 10 {
		s = s[ind:]
	}
	return s
}

// extractGoal parses the 'Goal: ...' section from the LLM response
func ExtractStringAfterTag(response string, Tag string) string {
	// Split the response into lines
	lines := strings.Split(response, "\n")
	for _, line := range lines {
		trimmed := strings.TrimSpace(line)
		if strings.HasPrefix(trimmed, Tag) {
			// Return the content after 'Goal:'
			return strings.TrimPrefix(trimmed, Tag)
		}
	}
	return ""
}
