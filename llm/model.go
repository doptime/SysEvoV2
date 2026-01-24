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

var (
	DeepSeekV3 = NewModel("https://api.deepseek.com/", utils.TextFromFile("/Users/yang/eloevo/.vscode/DSAPIKEY.txt"), "deepseek-chat").WithTopP(0.6).WithToolsInSystemPrompt()
	//https://tbnx.plus7.plus/token
	DeepSeekV3TB = NewModel("https://tbnx.plus7.plus/v1", os.Getenv("DSTB"), "deepseek-chat").WithTopP(0.6)
	GeminiTB     = NewModel("https://tao.plus7.plus/v1", os.Getenv("geminitb"), "gemini-2.0-flash-exp").WithTopP(0.8).WithToolsInUserPrompt()
	//多模态回答生成仅在 gemini-2.0-flash-exp 和 gemini-2.0-flash-preview-image-generation
	GPT5Aigpt     = NewModel("https://api.aigptapi.com/v1", "apgptapi", "gpt-5")
	GPT5ChatAigpt = NewModel("https://api.aigptapi.com/v1", "apgptapi", "gpt-5-chat-latest").WithToolsInUserPrompt()

	Qwen30BA3             = NewModel("http://rtxserver.lan:12303/v1", "ApiKey", "qwen3b30a3b2507").WithTemperature(0.7).WithTopP(0.8)
	Qwen3B235Thinking2507 = NewModel("http://rtxserver.lan:12303/v1", "ApiKey", "qwen3-235b-a22b-thinking-2507")
	Qwen3vl30b            = NewModel("http://rtxserver.lan:12304/v1", "ApiKey", "qwen3-vl-30b")
	Qwen3vl8b             = NewModel("http://rtxserver.lan:12304/v1", "ApiKey", "qwen3-vl-8b")

	Qwen3Next80BThinking = NewModel("http://rtxserver.lan:12303/v1", "ApiKey", "qwen3-next-80b-thinking")
	Qwen3Next80B         = NewModel("http://rtxserver.lan:12304/v1", "ApiKey", "qwen3-next-80b")
	Qwendeepresearch     = NewModel("http://rtxserver.lan:12304/v1", "ApiKey", "deepresearch").WithToolsInUserPrompt()

	Qwen3B235Thinking2507Aliyun = NewModel("https://dashscope.aliyuncs.com/compatible-mode/v1", "aliyun", "qwen3-235b-a22b-thinking-2507")

	Qwen3Coder            = NewModel("https://api.xiaocaseai.com/v1", "xiaocaseai", "qwen3-coder-480b-a35b-instruct")
	Gemini25Proxiaocaseai = NewModel("https://api.xiaocaseai.com/v1", "xiaocaseai", "gemini-2.5-pro")

	Qwen3Coder30B2507 = NewModel("http://rtxserver.lan:12304/v1", "ApiKey", "qwen3coder30b2507")
	Qwen3B235B        = NewModel("https://api.xiaocaseai.com/v1", "xiaocaseai", "qwen3-235b-a22b")

	GLM45         = NewModel("https://open.bigmodel.cn/api/paas/v4/", "ZHIPUAPIKEY", "GLM-4.5")
	Glm45Air      = NewModel("https://open.bigmodel.cn/api/paas/v4/", "ZHIPUAPIKEY", "GLM-4.5-Air")
	Glm45AirLocal = NewModel("http://rtxserver.lan:12303/v1", "ApiKey", "GLM-4.5-Air").WithToolsInSystemPrompt()

	Minmaxm4_1 = NewModel("http://rtxserver.lan:8000/v1", "", "mmm-4.1")

	Qwen3B32Thinking = NewModel("http://rtxserver.lan:1214/v1", "ApiKey", "qwen3b32").WithTemperature(0.6).WithTopP(0.95)
	Oss120b          = NewModel("http://rtxserver.lan:12304/v1", "ApiKey", "gpt-oss-120b")
	Oss20b           = NewModel("http://rtxserver.lan:12302/v1", "ApiKey", "gpt-oss-20b").WithSysPrompt("Reasoning: high")

	//ModelDefault        = ModelQwen32BCoderLocal
	ModelDefault = Minmaxm4_1
)
