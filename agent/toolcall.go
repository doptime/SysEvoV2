package agent

import (
	"encoding/json"
	"regexp"
	"strings"

	openai "github.com/sashabaranov/go-openai"
)

// Process each choice in the response
type FunctionCall struct {
	Name string `json:"name,omitempty"`
	// call function with arguments in JSON format
	Arguments any `json:"arguments,omitempty"`
}

func parseOneToolcall(toolcallString string) (toolCalls *FunctionCall) {
	tool := FunctionCall{Name: "", Arguments: map[string]any{}}
	//openai.FunctionCall 中的Arguments是string类型.直接unmrshal 会报错
	err := json.Unmarshal([]byte(toolcallString), &tool)
	//try fix extra "}" at the end of toolcallString
	if err != nil {
		err = json.Unmarshal([]byte(toolcallString+"}"), &tool)
	}
	if err != nil {
		str := toolcallString[:len(toolcallString)-1]
		err = json.Unmarshal([]byte(str), &tool)
	}
	//  try fix Name and Arguments merge issue
	if err == nil && tool.Name != "" {
		if len(tool.Arguments.(map[string]any)) == 0 {
			err = json.Unmarshal([]byte(toolcallString), &tool.Arguments)
		}
	}
	if err == nil && len(tool.Arguments.(map[string]any)) > 0 {
		return &tool
	}
	return nil
}
func ParseToolCallFromXlm(s string) (toolCalls *FunctionCall) {
	// Extract function name
	nameRe := regexp.MustCompile(`<invoke name="([^"]+)"`)
	nameMatches := nameRe.FindStringSubmatch(s)
	if len(nameMatches) < 2 {
		return nil
	}
	functionName := strings.TrimSpace(nameMatches[1])

	// Extract all parameters
	paramRe := regexp.MustCompile(`(?s)<parameter name="([^"]+)">(.+?)</parameter>`)
	paramMatches := paramRe.FindAllStringSubmatch(s, -1)

	args := make(map[string]interface{})
	for _, match := range paramMatches {
		if len(match) < 3 {
			continue
		}
		key := strings.TrimSpace(match[1])
		value := strings.TrimSpace(match[2])

		// Try to unmarshal as JSON, otherwise use as string
		var jsonValue interface{}
		if err := json.Unmarshal([]byte(value), &jsonValue); err == nil {
			args[key] = jsonValue
		} else {
			args[key] = value
		}
	}

	return &FunctionCall{
		Name:      functionName,
		Arguments: args,
	}
}

func ToolcallParserDefault(resp openai.ChatCompletionResponse) (toolCalls []*FunctionCall) {
	for _, choice := range resp.Choices {
		for _, toolcall := range choice.Message.ToolCalls {
			functioncall := &FunctionCall{
				Name:      toolcall.Function.Name,
				Arguments: toolcall.Function.Arguments,
			}
			toolCalls = append(toolCalls, functioncall)
		}
	}
	if len(toolCalls) == 0 && len(resp.Choices) > 0 {
		rsp := resp.Choices[0].Message.Content
		ind, ind2 := strings.LastIndex(rsp, "tool_call>"), strings.LastIndex(rsp, "}")
		if ind > 0 && ind2 > ind {
			rsp = rsp[:ind2+1] + "</tool_call>"
		}

		rsp = strings.ReplaceAll(rsp, "/function_calls>", "tool_call>")
		rsp = strings.ReplaceAll(rsp, "function_calls>", "tool_call>")
		rsp = strings.ReplaceAll(rsp, "tool_code>", "tool_call>")
		rsp = strings.ReplaceAll(rsp, "<tool>", "<tool_call>")
		rsp = strings.ReplaceAll(rsp, "</tools>", "<tool_call>")
		rsp = strings.ReplaceAll(rsp, "</tool_call>", "<tool_call>")
		//json tool call
		rsp = strings.ReplaceAll(rsp, "```json\n", "<tool_call>")
		rsp = strings.ReplaceAll(rsp, "```tool_call\n", "<tool_call>")
		rsp = strings.ReplaceAll(rsp, "\n```", "<tool_call>")
		rsp = strings.ReplaceAll(rsp, "```\n", "<tool_call>")

		rsp = strings.ReplaceAll(rsp, "```tool_call>", "<tool_call>")

		items := strings.Split(rsp, "<tool_call>")
		//case json only
		if len(items) > 3 {
			items = items[1 : len(items)-1]
		}
		for _, toolcallString := range items {
			if len(toolcallString) < 10 {
				continue
			}
			toolcallString = strings.TrimSpace(toolcallString)
			toolcall := ParseToolCallFromXlm(toolcallString)
			if toolcall == nil {
				if i := strings.Index(toolcallString, "{"); i > 0 {
					toolcallString = toolcallString[i:]
				}
				if i := strings.LastIndex(toolcallString, "}"); i > 0 {
					toolcallString = toolcallString[:i+1]
				}
				toolcall = parseOneToolcall(toolcallString)
			}
			if toolcall != nil {
				toolCalls = append(toolCalls, toolcall)
			}
		}
	}
	return toolCalls
}
func (a *Agent) WithToolcallParser(parse func(resp openai.ChatCompletionResponse) (toolCalls []*FunctionCall)) *Agent {
	if parse == nil {
		parse = ToolcallParserDefault
		a.functioncallParsers = append(a.functioncallParsers, ToolcallParserDefault)
	}
	return a
}
