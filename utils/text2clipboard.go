package utils

import (
	"strings"

	"golang.design/x/clipboard"
)

func Text2Clipboard(text ...string) {
	sb := strings.Builder{}
	for _, v := range text {
		sb.WriteString(v + "\n")
	}

	clipboard.Write(clipboard.FmtText, []byte(sb.String()))
}
func TextFromClipboard() string {
	data := clipboard.Read(clipboard.FmtText)
	return string(data)
}
