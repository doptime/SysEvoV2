package agent

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"strings"
	"sync"
	"text/template"
	"time"

	"sysevov2/llm"
	"sysevov2/utils"

	"github.com/doptime/redisdb"
	"github.com/samber/lo"
	openai "github.com/sashabaranov/go-openai"

	"golang.design/x/clipboard"
)

type FileToMem struct {
	File string `json:"file"`
	Mem  string `json:"mem"`
}

const (
	UseContentFromFile             string = "MsgFile"
	UseContentFromClipboard        string = "ContentFromClipboard"
	UseContentFromClipboardAsParam string = "ContentFromClipboardAsParam"
	UseContentToParam              string = "ContentToMemoryKey"
	UseContentToFile               string = "ContentToFile"
	UseContentToRedisKey           string = "ContentToRedisKey"
	UseCopyPromptOnly              string = "CopyPromptOnly"
	UseSharedMemory                string = "SharedMemory"
	UseModel                       string = "Model"
	UseTemplate                    string = "Template"
)

// GoalProposer is responsible for proposing goals using an OpenAI model,
// handling function calls, and managing callbacks.
type Agent struct {
	Models                      []*llm.Model
	PromptTemplate              *template.Template
	Tools                       []openai.Tool
	ToolInSystemPrompt          bool
	ToolInUserPrompt            bool
	toolsCallbacks              map[string]func(Param interface{}, CallMemory map[string]any) error
	functioncallParsers         []func(resp openai.ChatCompletionResponse) (toolCalls []*FunctionCall)
	CallBack                    func(ctx context.Context, inputs string) error
	CheckToolCallsBeforeCalling func(toolCalls []*FunctionCall) error
	// CallBackBeforeToolCall func(toolCall *FunctionCall, CallMemory map[string]any) error

	ToolCallRunningMutext interface{}
}

func Create(_template *template.Template, tools ...llm.ToolInterface) (a *Agent) {
	a = &Agent{
		Models:         []*llm.Model{llm.ModelDefault},
		toolsCallbacks: map[string]func(Param interface{}, CallMemory map[string]any) error{},
		PromptTemplate: _template,
	}
	a.UseTools(tools...)
	a.WithToolcallParser(nil)
	return a
}
func (a *Agent) WithToolCallMutextRun() *Agent {
	a.ToolCallRunningMutext = &sync.Mutex{}
	return a
}
func (a *Agent) WithToolCallsCheckedBeforeCalling(checkToolCallsBeforeCalling func(toolCalls []*FunctionCall) error) *Agent {
	a.CheckToolCallsBeforeCalling = checkToolCallsBeforeCalling
	return a
}
func (a *Agent) UseTools(tools ...llm.ToolInterface) (ret *Agent) {
	ret = &Agent{}
	*ret = *a
	for _, tool := range tools {
		ret.Tools = append(ret.Tools, *tool.OaiTool())
		ret.toolsCallbacks[tool.Name()] = tool.HandleCallback
	}
	return ret
}

type FieldReaderFunc func(content string) (field string)

func (a *Agent) Clone() *Agent {
	var b Agent = *a
	b.toolsCallbacks = map[string]func(Param interface{}, CallMemory map[string]any) error{}
	for k, v := range a.toolsCallbacks {
		b.toolsCallbacks[k] = v
	}
	b.Tools = append([]openai.Tool{}, a.Tools...)

	return &b
}
func (a *Agent) WithModels(Model ...*llm.Model) *Agent {
	a.Models = Model
	return a
}

func (a *Agent) WithCallback(callback func(ctx context.Context, inputs string) error) *Agent {
	a.CallBack = callback
	return a
}

func (a *Agent) Messege(params map[string]any) string {
	var promptBuffer bytes.Buffer
	if _UseTemplate, ok := params[UseTemplate].(*template.Template); ok && _UseTemplate != nil {
		_UseTemplate.Execute(&promptBuffer, params)
	} else if err := a.PromptTemplate.Execute(&promptBuffer, params); err != nil {
		fmt.Printf("Error rendering prompt: %v\n", err)
		return ""
	}
	return promptBuffer.String()
}

// ProposeGoals generates goals based on the provided file contents.
// It renders the prompt, sends a request to the OpenAI model, and processes the response.
func (a *Agent) Call(memories ...map[string]any) (err error) {
	// Render the prompt with the provided files content and available functions
	var params = map[string]any{}
	if len(memories) > 0 {
		params = memories[0]
	}
	var SharedMemory map[string]any = map[string]any{}
	if _, ok := params[UseSharedMemory]; ok {
		SharedMemory = params[UseSharedMemory].(map[string]any)
	}

	for k, v := range SharedMemory {
		params[k] = v
	}
	params["ThisAgent"] = a // add self reference to memory
	params["Params"] = params
	if memDeCliboardKey, _ok := params[UseContentFromClipboardAsParam].(string); _ok && memDeCliboardKey != "" {
		textbytes := clipboard.Read(clipboard.FmtText)
		if len(textbytes) == 0 {
			fmt.Println("no data in clipboard")
			return nil
		}
		params[memDeCliboardKey] = string(textbytes)
	}
	messege := a.Messege(params)
	fmt.Printf("Requesting prompt: %v\n", messege)

	//model might be changed by other process
	model, ok := params[UseModel].(*llm.Model)
	if !ok || model == nil {
		model = llm.LoadbalancedPick(a.Models...)
		params[UseModel] = llm.LoadbalancedPick(a.Models...)
	}

	// Create the chat completion request with function calls enabled
	req := openai.ChatCompletionRequest{
		Model:       model.Name,
		Messages:    []openai.ChatCompletionMessage{{Role: openai.ChatMessageRoleUser, Content: messege}},
		TopP:        model.TopP,
		Temperature: model.Temperature,
	}
	if model.SystemMessage != "" {
		req.Messages = append([]openai.ChatCompletionMessage{{Role: openai.ChatMessageRoleSystem, Content: model.SystemMessage}}, req.Messages...)
	}
	if model.Temperature > 0 {
		req.Temperature = model.Temperature
	}
	if model.TopP > 0 {
		req.TopP = model.TopP
	}
	if len(a.Tools) > 0 {
		if model.ToolInPrompt != nil {
			model.ToolInPrompt.WithToolcallSysMsg(a.Tools, &req)
		} else {
			req.Tools = a.Tools
		}
	}

	if copyPromptOnly, ok := params[UseCopyPromptOnly].(bool); ok && copyPromptOnly {
		msg := strings.Join(lo.Map(req.Messages, func(m openai.ChatCompletionMessage, _ int) string { return m.Content }), "\n")
		err := clipboard.Init()
		if err != nil {
			return fmt.Errorf("error initializing clipboard: %w", err)
		}
		//remove \x00 in the msg
		var sb strings.Builder
		for _, r := range msg {
			if r != '\x00' {
				sb.WriteRune(r)
			}
		}
		fmt.Println("copy prompt to clipboard", msg)
		msg = sb.String()
		clipboard.Write(clipboard.FmtText, []byte(msg))
		return nil
	}
	timestart := time.Now()
	//loading Messge response
	var resp openai.ChatCompletionResponse
	// Send the request to the OpenAI API
	if MsgFile, _ok := params[UseContentFromFile].(string); _ok && MsgFile != "" {
		resp, err = utils.FileToResponse(MsgFile)
	} else if MsgClipboard, _ok := params[UseContentFromClipboard].(bool); _ok && MsgClipboard {
		textbytes := clipboard.Read(clipboard.FmtText)
		if len(textbytes) == 0 {
			return fmt.Errorf("no data in clipboard")
		}
		msg := openai.ChatCompletionMessage{Role: "assistant", Content: string(textbytes)}
		resp = openai.ChatCompletionResponse{Choices: []openai.ChatCompletionChoice{{Message: msg}}}
	} else if len(req.Messages) > 0 {
		resp, err = model.Client.CreateChatCompletion(context.Background(), req)
	} else {
		return fmt.Errorf("no messages in request")
	}
	//saving the response
	if msgToFile, _ok := params[UseContentToFile].(string); _ok && msgToFile != "" {
		if jsonbytes, err := json.Marshal(resp); err == nil {
			utils.StringToFile(msgToFile, string(jsonbytes))
		}
	}
	//saving to memory
	if msgToMemKey, _ok := params[UseContentToParam].(string); _ok && msgToMemKey != "" && len(memories) > 0 {
		params[msgToMemKey] = resp.Choices[0].Message.Content
	}
	//saving to redis
	if redisKey, _ok := params[UseContentToRedisKey].(string); _ok && len(resp.Choices) > 0 {
		redisdb.NewHashKey[string, string](redisdb.Opt.Key(redisKey)).HSet(resp.Created, resp.Choices[0].Message.Content)
	}

	if err == nil {
		model.ResponseTime(time.Since(timestart))
	}
	fmt.Println("resp:", resp)
	if err != nil {
		fmt.Println("Error creating chat completion:", err)
		fmt.Println("req:", req.Messages[0].Content)
		return err
	}
	if a.CallBack != nil {
		a.CallBack(context.Background(), resp.Choices[0].Message.Content)
	}

	// Parse and handle function calls in the response
	var nonRedundantToolCalls []*FunctionCall
	ToolCallHash := map[uint64]bool{}
	for _, parser := range a.functioncallParsers {
		toolcalls := parser(resp)
		for _, toolcall := range toolcalls {
			hash, _ := utils.GetCanonicalHash(toolcall.Arguments)
			if _, ok := ToolCallHash[hash]; ok {
				continue
			}
			nonRedundantToolCalls = append(nonRedundantToolCalls, toolcall)
		}
	}
	if a.CheckToolCallsBeforeCalling != nil {
		if err := a.CheckToolCallsBeforeCalling(nonRedundantToolCalls); err != nil {
			return err
		}
	}
	for _, toolcall := range nonRedundantToolCalls {
		_tool, ok := a.toolsCallbacks[toolcall.Name]
		if ok {
			if a.ToolCallRunningMutext != nil {
				a.ToolCallRunningMutext.(*sync.Mutex).Lock()
				_tool(toolcall.Arguments, params)
				a.ToolCallRunningMutext.(*sync.Mutex).Unlock()
			} else {
				_tool(toolcall.Arguments, params)
			}
		} else if !ok {
			return fmt.Errorf("error: function not found in FunctionMap")
		}
	}
	return nil
}
