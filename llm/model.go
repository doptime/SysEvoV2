package llm

import (
	"net"
	"net/http"
	"os"
	"sync"
	"time"

	"sysevov2/utils"

	openai "github.com/sashabaranov/go-openai"
)

// Model represents an OpenAI model with its associated client and model name.
type Model struct {
	Client          *openai.Client
	ApiKey          string // API key for authentication
	SystemMessage   string
	BaseURL         string // Base URL for the OpenAI API, can be empty for default
	Name            string
	TopP            float32
	TopK            float32
	Temperature     float32
	ToolInPrompt    *ToolInPrompt
	avgResponseTime time.Duration
	lastReceived    time.Time
	requestPerMin   float64
	mutex           sync.RWMutex
}

func (model *Model) ResponseTime(duration ...time.Duration) time.Duration {
	if len(duration) == 0 {
		return model.avgResponseTime
	}
	model.mutex.Lock()
	defer model.mutex.Unlock()
	alpha := 0.1
	model.avgResponseTime += time.Duration(int64(float64(time.Duration(int64(duration[0]-model.avgResponseTime))) * alpha))
	model.requestPerMin += (60000000.0/float64(time.Since(model.lastReceived).Microseconds()+100) - model.requestPerMin) * 0.01
	model.lastReceived = time.Now()
	return model.avgResponseTime
}

// NewModel initializes a new Model with the given baseURL, apiKey, and modelName.
// It configures the OpenAI client to use a custom base URL if provided.
func NewModel(baseURL, apiKey, modelName string) *Model {
	if _apikey := os.Getenv(apiKey); _apikey != "" {
		apiKey = _apikey
	}
	config := openai.DefaultConfig(apiKey)
	config.EmptyMessagesLimit = 10000000
	if baseURL != "" {
		config.BaseURL = baseURL
	}
	config.HTTPClient = &http.Client{
		Timeout: 3600 * time.Second, // 整个请求的总超时时间，包括连接和接收响应
		Transport: &http.Transport{
			// 设置连接超时时间
			DialContext: (&net.Dialer{
				Timeout:   3600 * time.Second, // 连接超时
				KeepAlive: 3600 * time.Second, // 保持连接的时间
			}).DialContext,
			// 设置TLS配置
			TLSHandshakeTimeout: 30 * time.Second, // TLS握手超时
			// 设置HTTP/2配置
			ForceAttemptHTTP2:     true,               // 强制尝试使用HTTP/2
			MaxIdleConns:          100,                // 最大空闲连接数
			IdleConnTimeout:       3600 * time.Second, // 空闲连接的超时时间
			ExpectContinueTimeout: 3600 * time.Second, // 期望继续的超时时间
			// 其他HTTP/2相关配置
			// 例如，设置HTTP/2的最大帧大小、最大流数等
			// 这些配置可以根据需要进行调整
			MaxIdleConnsPerHost: 100,   // 每个主机的最大空闲连接数
			DisableKeepAlives:   false, // 是否禁用Keep-Alive
			// 其他Transport配置
			// 例如，设置代理、TLS配置等
			// Proxy: http.ProxyFromEnvironment, // 使用环境变量中的代理设置
			// TLSClientConfig: &tls.Config{
			// 	InsecureSkipVerify: true, // 如果需要跳过TLS验证，可以设置为true
			// },
			// 其他Transport配置
			// 例如，设置代理、TLS配置等
			// Proxy: http.ProxyFromEnvironment, // 使用环境变量中的代理设置
			// TLSClientConfig: &tls.Config{
			// 	InsecureSkipVerify: true, // 如果需要跳过TLS验证，可以设置为true
			// },
		},
		// 设置HTTP/2配置
		// ForceAttemptHTTP2:     true, // 强制尝试使用HTTP/2
		// MaxIdleConns:          100, // 最大空闲连接数
		// IdleConnTimeout:       90 * time.Second, // 空闲连接的超时时间
		// ExpectContinueTimeout: 1 * time.Second, // 期望继续的超时时间
	}

	client := openai.NewClientWithConfig(config)
	return &Model{
		Client:          client,
		Name:            modelName,
		ApiKey:          apiKey,
		BaseURL:         baseURL,
		avgResponseTime: 600 * time.Second,
	}
}
func (m *Model) WithToolsInSystemPrompt() *Model {
	m.ToolInPrompt = &ToolInPrompt{InSystemPrompt: true}
	return m
}
func (m *Model) WithToolsInUserPrompt() *Model {
	m.ToolInPrompt = &ToolInPrompt{InUserPrompt: true}
	return m
}
func (m *Model) WithTopP(topP float32) *Model {
	m.TopP = topP
	return m
}
func (m *Model) WithTopK(topK float32) *Model {
	m.TopK = topK
	return m
}
func (m *Model) WithTemperature(temperature float32) *Model {
	m.Temperature = temperature
	return m
}
func (m *Model) WithSysPrompt(message string) *Model {
	m.SystemMessage = message
	return m
}

const (
	EndPoint8010   = "http://rtxserver.lan:8010/v1"
	EndPoint8009   = "http://rtxserver.lan:8009/v1"
	EndPoint8008   = "http://rtxserver.lan:8008/v1"
	EndPoint8007   = "http://rtxserver.lan:8007/v1"
	EndPoint8006   = "http://rtxserver.lan:8006/v1"
	EndPoint8003   = "http://rtxserver.lan:8003/v1"
	ApiKey         = "token-deaf"
	ApiKeyDeepseek = "sk-2d9e2689120c4544820485740ea2f36c"
	NameQwen32B    = "Qwen/Qwen2.5-32B-Instruct-AWQ"

	NameQwen32BCoder      = "Qwen/Qwen2.5-Coder-32B-Instruct-AWQ"
	NameQwen32BCoderLocal = "/home/deaf/.cache/huggingface/hub/models--Qwen--Qwen2.5-32B-Instruct-AWQ/snapshots/5c7cb76a268fc6cfbb9c4777eb24ba6e27f9ee6c"

	NameQwen72B      = "Qwen/Qwen2.5-72B-Instruct-AWQ"
	NameQwen72BLocal = "/home/deaf/.cache/huggingface/hub/models--Qwen--Qwen2.5-72B-Instruct-AWQ/snapshots/698703eae6604af048a3d2f509995dc302088217"
	//NameQwen14B = "Qwen/Qwen2.5-14B-Instruct-AWQ"
	NameQwen7B         = "Qwen/Qwen2.5-7B-Instruct-AWQ"
	NameGemma          = "neuralmagic/gemma-2-9b-it-quantized.w4a16"
	NameMistralNemo    = "shuyuej/Mistral-Nemo-Instruct-2407-GPTQ"
	NameMistralSmall   = "AMead10/Mistral-Small-Instruct-2409-awq"
	NameMistralNemoAwq = "casperhansen/mistral-nemo-instruct-2407-awq"
	NameLlama38b       = "neuralmagic/Meta-Llama-3.1-8B-Instruct-quantized.w4a16"
	NameMarcoo1        = "AIDC-AI/Marco-o1"
	NamePhi4           = "/home/deaf/.cache/huggingface/hub/models--Orion-zhen--phi-4-awq/snapshots/bc73c60ec9d246127dff940b3331c5464f18442e"

	NameLlama33_70b = "casperhansen/llama-3.3-70b-instruct-awq"
	NameDeepseek    = "deepseek-chat"

	//NameQwQ32B = "/home/deaf/.cache/huggingface/hub/models--KirillR--QwQ-32B-Preview-AWQ/snapshots/b082e5c095a17c50cc78fc6fe43a0eae326bd203"
)

// Initialize all models with their corresponding endpoints and names.
var (
	ModelQwen32B = NewModel(EndPoint8008, ApiKey, NameQwen32B)

	ModelQwen32BCoder      = NewModel(EndPoint8007, ApiKey, NameQwen32BCoder)
	ModelQwen32BCoderLocal = NewModel(EndPoint8007, ApiKey, NameQwen32BCoderLocal)

	ModelQwen72B      = NewModel(EndPoint8007, ApiKey, NameQwen72B)
	ModelQwen72BLocal = NewModel(EndPoint8007, ApiKey, NameQwen72BLocal)

	ModelQwenQvq72B = NewModel(EndPoint8007, ApiKey, "/home/deaf/.cache/huggingface/hub/models--kosbu--QVQ-72B-Preview-AWQ/snapshots/9f763dc5a3bf51ed157aee12a8aae4ae8e7c1926")

	ModelQwen14B        = NewModel("http://rtxserver.lan:1214/v1", ApiKey, "/home/deaf/.cache/huggingface/hub/models--Qwen--Qwen2.5-14B-Instruct-AWQ/snapshots/539535859b135b0244c91f3e59816150c8056698")
	ModelQwen7B         = NewModel(EndPoint8007, ApiKey, NameQwen7B)
	ModelPhi3           = NewModel(EndPoint8006, ApiKey, "neuralmagic/Phi-3-medium-128k-instruct-quantized.w4a16")
	ModelGemma          = NewModel(EndPoint8006, ApiKey, NameGemma)
	ModelMistralNemo    = NewModel(EndPoint8003, ApiKey, NameMistralNemo)
	ModelMistralSmall   = NewModel(EndPoint8003, ApiKey, NameMistralSmall)
	ModelMistralNemoAwq = NewModel(EndPoint8003, ApiKey, NameMistralNemoAwq)
	ModelLlama38b       = NewModel(EndPoint8007, ApiKey, NameLlama38b)
	ModelMarcoo1        = NewModel(EndPoint8008, ApiKey, NameMarcoo1)
	ModelQwen32B12K     = NewModel(EndPoint8008, ApiKey, NameQwen32B)
	ModelLlama33_70b    = NewModel(EndPoint8007, ApiKey, NameLlama33_70b)
	//ModelDeepseek       = NewModel(EndPointDeepseek, ApiKeyDeepseek, NameDeepseek)
	ModelQwen2_1d5B    = NewModel("http://rtxserver.lan:8215/v1", ApiKey, "/home/deaf/.cache/huggingface/hub/models--Qwen--Qwen2.5-1.5B-Instruct/snapshots/989aa7980e4cf806f80c7fef2b1adb7bc71aa306")
	ModelQwen2_7B      = NewModel("http://rtxserver.lan:1207/v1", ApiKey, "/home/deaf/.cache/huggingface/hub/models--Qwen--Qwen2.5-7B-Instruct-AWQ/snapshots/b25037543e9394b818fdfca67ab2a00ecc7dd641")
	DeepSeekR1_Qwen_14 = NewModel("http://rtxserver.lan:3214/v1", ApiKey, "/home/deaf/.cache/huggingface/hub/models--casperhansen--deepseek-r1-distill-qwen-14b-awq/snapshots/1874537e80f451042f7993dfa2b21fd25b4e7223")
	DeepSeekR132B      = NewModel("http://rtxserver.lan:4733/v1", ApiKey, "DeepSeek-R1-Distill-Qwen-32B-AWQ").WithTopP(0.6)
	DSV3Baidu          = NewModel("https://qianfan.baidubce.com/v2", os.Getenv("BDAPIKEY"), "deepseek-v3").WithTopP(0.6)
	DeepSeekV3         = NewModel("https://api.deepseek.com/", utils.TextFromFile("/Users/yang/eloevo/.vscode/DSAPIKEY.txt"), "deepseek-chat").WithTopP(0.6).WithToolsInSystemPrompt()
	//https://tbnx.plus7.plus/token
	DeepSeekV3TB = NewModel("https://tbnx.plus7.plus/v1", os.Getenv("DSTB"), "deepseek-chat").WithTopP(0.6)
	GeminiTB     = NewModel("https://tao.plus7.plus/v1", os.Getenv("geminitb"), "gemini-2.0-flash-exp").WithTopP(0.8).WithToolsInUserPrompt()
	//https://ai.google.dev/gemini-api/docs/models?hl=zh-cn
	GeminiFlashLight         = NewModel("https://www.chataiapi.com/v1", "sk-U3lPyfaPDE6abmfRwGqSI1jMONNgDdPBQ16pKev9FfAgRXmE", "gemini-2.0-flash-light").WithTopP(0.8).WithToolsInUserPrompt()
	Gemini25FlashThinking    = NewModel("https://api.yun163.top/v1", "sk-Lz2zwPj0DOBUxPN8d9BwBH7h0Uxa3DTjsguHdOGyYYDe5xPt", "gemini-2.5-flash-preview-05-20-thinking").WithTopP(0.8).WithToolsInUserPrompt()
	Gemini25FlashNonthinking = NewModel("https://api.yun163.top/v1", "sk-Lz2zwPj0DOBUxPN8d9BwBH7h0Uxa3DTjsguHdOGyYYDe5xPt", "gemini-2.5-flash-preview-05-20-nothinking").WithToolsInUserPrompt()
	Gemini25ProYun163        = NewModel("https://api.yun163.top/v1", "sk-Lz2zwPj0DOBUxPN8d9BwBH7h0Uxa3DTjsguHdOGyYYDe5xPt", "gemini-2.5-pro-preview-06-05").WithTopP(0.8).WithToolsInUserPrompt()
	//多模态回答生成仅在 gemini-2.0-flash-exp 和 gemini-2.0-flash-preview-image-generation
	Gemini20FlashImageAigpt   = NewModel("https://api.aigptapi.com/", "apgptapi", "gemini-2.0-flash-preview-image-generation").WithTopP(0.8).WithToolsInUserPrompt()
	Gemini20FlashExpAPIgpt    = NewModel("https://api.aigptapi.com/v1", "apgptapi", "gemini-2.0-flash-exp").WithTopP(0.8).WithToolsInUserPrompt()
	Gemini25Flashlight        = NewModel("https://api.aigptapi.com/v1", "apgptapi", "gemini-2.5-flash-lite-preview-06-17").WithTopP(0.8).WithToolsInUserPrompt()
	Gemini25FlashNonthinking_ = NewModel("https://api.aigptapi.com/v1", "apgptapi", "gemini-2.5-flash-preview-05-20-nothinking").WithToolsInUserPrompt()
	Gemini25ProAigpt          = NewModel("https://api.aigptapi.com/v1", "apgptapi", "gemini-2.5-pro-preview-06-05").WithTopP(0.8).WithToolsInUserPrompt()
	Gemini25FlashAigpt        = NewModel("https://api.aigptapi.com/v1", "apgptapi", "gemini-2.5-flash-preview-05-20").WithTopP(0.8).WithToolsInUserPrompt()
	GPT5Aigpt                 = NewModel("https://api.aigptapi.com/v1", "apgptapi", "gpt-5")
	GPT5ChatAigpt             = NewModel("https://api.aigptapi.com/v1", "apgptapi", "gpt-5-chat-latest").WithToolsInUserPrompt()

	Gemini25FlashPreviewRunAPI = NewModel("https://api.runapi.sbs/v1", "sk-0t6RD5gAK1spJS408b07Dd214b8845Df94127eF6D05c65D8", "gemini-2.5-flash-preview-05-20").WithTopP(0.8).WithToolsInUserPrompt()
	Gemini25FlashRunAPI        = NewModel("https://api.runapi.sbs/v1", "sk-0t6RD5gAK1spJS408b07Dd214b8845Df94127eF6D05c65D8", "gemini-2.5-flash").WithTopP(0.8).WithToolsInUserPrompt()

	Gemini25ProRunAPI = NewModel("https://api.runapi.sbs/v1", "sk-0t6RD5gAK1spJS408b07Dd214b8845Df94127eF6D05c65D8", "gemini-2.5-pro-preview-06-05").WithTopP(0.8).WithToolsInUserPrompt()

	GPT41Mini = NewModel("https://tao.plus7.plus/v1", os.Getenv("geminitb"), "gpt-4.1-mini").WithTopP(0.8)

	DolphinR1Mistral24B = NewModel("http://rtxserver.lan:4733/v1", ApiKey, "Dolphin3.0-R1-Mistral-24B-AWQ").WithToolsInSystemPrompt()
	FuseO1              = NewModel("http://rtxserver.lan:4732/v1", ApiKey, "FuseO1").WithTopP(0.92).WithTemperature(0.6).WithTopK(40)
	Qwq32B              = NewModel("http://rtxserver.lan:1232/v1", ApiKey, "QwQ-32B").WithTopP(0.92).WithTemperature(0.6) //.WithTopK(40)
	Qwen32B             = NewModel("http://rtxserver.lan:1232/v1", ApiKey, "Qwen25B32")

	GLM32B = NewModel("http://rtxserver.lan:19732/v1", ApiKey, "glmz132b").WithTemperature(0.6).WithTopP(0.95) //.WithTopK(40) .WithToolInPrompt(true)

	Gemma3B27             = NewModel("http://rtxserver.lan:5527/v1", ApiKey, "gemma3b27").WithTopP(0.92).WithTemperature(0.9).WithToolsInUserPrompt()
	Gemma3B12             = NewModel("http://rtxserver.lan:5527/v1", ApiKey, "gemma3b12").WithTopP(0.95).WithTemperature(1.0).WithToolsInSystemPrompt()
	Qwen30BA3             = NewModel("http://rtxserver.lan:12303/v1", ApiKey, "qwen30ba3").WithTemperature(0.7).WithTopP(0.8)
	Qwen3B14              = NewModel("http://rtxserver.lan:1214/v1", ApiKey, "qwen3b14").WithTemperature(0.7).WithTopP(0.8)
	Qwen3B14Thinking      = NewModel("http://rtxserver.lan:1214/v1", ApiKey, "qwen3b14").WithTemperature(0.6).WithTopP(0.95)
	Qwen3B32Nonthinking   = NewModel("http://rtxserver.lan:1214/v1", ApiKey, "qwen3b32").WithTemperature(0.2).WithTopP(0.8)
	Qwen3B30A3b2507       = NewModel("http://rtxserver.lan:12303/v1", ApiKey, "qwen3b30a3b2507").WithTemperature(0.7).WithTopP(0.8).WithTopK(20)
	Qwen3B235Thinking2507 = NewModel("http://rtxserver.lan:12303/v1", ApiKey, "qwen3-235b-a22b-thinking-2507")
	Qwen3vl30b            = NewModel("http://rtxserver.lan:12304/v1", ApiKey, "qwen3-vl-30b")
	Qwen3vl8b             = NewModel("http://rtxserver.lan:12304/v1", ApiKey, "qwen3-vl-8b")

	Qwen3Next80BThinking = NewModel("http://rtxserver.lan:12303/v1", ApiKey, "qwen3-next-80b-thinking")
	Qwen3Next80B         = NewModel("http://rtxserver.lan:12304/v1", ApiKey, "qwen3-next-80b")
	Qwendeepresearch     = NewModel("http://rtxserver.lan:12304/v1", ApiKey, "deepresearch").WithToolsInUserPrompt()
	Qwen3_4B2507         = NewModel("http://rtxserver.lan:12303/v1", ApiKey, "qwen3-4b-2507")

	Qwen3B235Thinking2507Aliyun = NewModel("https://dashscope.aliyuncs.com/compatible-mode/v1", "aliyun", "qwen3-235b-a22b-thinking-2507")

	Qwen3BThinking30A3b2507 = NewModel("http://rtxserver.lan:12303/v1", ApiKey, "qwen3thinkingb30a3b2507")
	Qwen3Coder              = NewModel("https://api.xiaocaseai.com/v1", "xiaocaseai", "qwen3-coder-480b-a35b-instruct")
	Gemini25Proxiaocaseai   = NewModel("https://api.xiaocaseai.com/v1", "xiaocaseai", "gemini-2.5-pro")

	Qwen3Coder30B2507 = NewModel("http://rtxserver.lan:12304/v1", ApiKey, "qwen3coder30b2507")

	//qwen3-coder-480b-a35b-instruct  qwen3-coder-plus qwen3-coder-plus-2025-07-22 qwen3-235b-a22b qwen3-235b-a22b-instruct-2507 qwen3-235b-a22b-think
	//qwen3-235b-a22b-thinking-2507 qwen-max-latest qwen-max-longcontext qwen-plus-2025-04-28 qwen-mt-plus qwen-mt-turbo
	Qwen3Coder235B = NewModel("https://api.qingyuntop.top/v1", "QingyunKey", "qwen3-235b-a22b-instruct-2507")
	Qwen3B235B     = NewModel("https://api.xiaocaseai.com/v1", "xiaocaseai", "qwen3-235b-a22b")

	GLM45         = NewModel("https://open.bigmodel.cn/api/paas/v4/", "ZHIPUAPIKEY", "GLM-4.5")
	Glm45Air      = NewModel("https://open.bigmodel.cn/api/paas/v4/", "ZHIPUAPIKEY", "GLM-4.5-Air")
	Glm45AirLocal = NewModel("http://rtxserver.lan:12303/v1", ApiKey, "GLM-4.5-Air").WithToolsInSystemPrompt()

	Qwen3B32Thinking = NewModel("http://rtxserver.lan:1214/v1", ApiKey, "qwen3b32").WithTemperature(0.6).WithTopP(0.95)
	Oss120b          = NewModel("http://rtxserver.lan:12304/v1", ApiKey, "gpt-oss-120b")
	Oss20b           = NewModel("http://rtxserver.lan:12302/v1", ApiKey, "gpt-oss-20b").WithSysPrompt("Reasoning: high")

	//ModelDefault        = ModelQwen32BCoderLocal
	ModelDefault = ModelQwen72BLocal
)

// - DOMAIN,api.aigptapi.com,DIRECT
// - DOMAIN,api.runapi.sbs,DIRECT
// - DOMAIN,tao.plus7.plus,DIRECT
// - DOMAIN,tbnx.plus7.plus,DIRECT
// - DOMAIN,api.yun163.top,DIRECT
