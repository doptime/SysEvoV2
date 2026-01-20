package utils

import (
	"regexp"
	"strings"
	"unicode/utf8"
)

func ExtractTagValue(str, tag string) (val string) {
	str = strings.ReplaceAll(str, "\r", "")

	ind := strings.Index(str, tag)
	if ind < 0 {
		return ""
	}

	ind += len(tag)
	//remove empty lines \n, to fetch value in next line
	for ind < len(str) {
		r, size := utf8.DecodeRuneInString(str[ind:])
		if r == '：' || r == '\n' || r == ':' || r == '"' || r == ')' || r == '*' || r == '#' {
			ind += size
			continue
		}
		break
	}

	if ind >= 0 && ind < len(str) {
		field := str[ind:]
		field = strings.Split(field, "\n")[0]
		field = strings.Split(field, "。")[0]
		//remove :：** “ "” and space
		// 使用正则表达式移除不需要的字符
		var reg = regexp.MustCompile(`[\-:：*" #]`)
		field = reg.ReplaceAllString(field, "")
		if len(field) > 0 && field[0] == '(' && field[len(field)-1] == ')' {
			field = field[1 : len(field)-1]
		}
		if strings.Contains(field, ")") && !strings.Contains(field, "(") {
			field = strings.Split(field, ")")[0]
		}
		return field
	}
	return ""
}

func ExtractTextValue(str, tag, endTag string) (val string) {
	str = strings.ReplaceAll(str, "\r", "")
	ind := strings.Index(str, tag)
	if ind < 0 {
		return ""
	}

	ind += len(tag)
	//remove empty lines \n, to fetch value in next line
	for ind < len(str) {
		r, size := utf8.DecodeRuneInString(str[ind:])
		if r == '：' || r == '\n' || r == ':' || r == '"' || r == ')' || r == '*' || r == '#' {
			ind += size
			continue
		}
		break
	}

	if ind >= 0 && ind < len(str) {
		val = str[ind:]
	}
	if endTag != "" {
		val = strings.Split(val, endTag)[0]
	}
	return strings.TrimSpace(val)
}
