package utils

import (
	"bytes"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"io/ioutil"
	"log"
	"net/http"
	"os"

	"github.com/samber/lo"
)

func Text2Mp3FromNaturalReader(textToConvert string) {
	textToConvert, _ = lo.Coalesce(textToConvert, "你好，这是一个使用 Go 语言调用 NaturalReader API 的测试。")
	// 替换为你的 NaturalReader API Key 和实际的 API 端点
	apiKey := os.Getenv("YOUR_NATURALREADER_API_KEY")
	const apiEndpoint = "https://api.naturalreaders.com/v0/tts/" // 这是一个示例URL，请查阅官方文档获取确切URL

	// 构建请求体
	requestBody := map[string]interface{}{
		"text":          textToConvert,
		"voice_id":      "zh-CN-Standard-A", // 示例语音ID，请查阅NaturalReader API文档获取可用ID
		"language":      "zh-CN",
		"output_format": "mp3",
		"speed":         1.0, // 语速，可选
		"pitch":         0.0, // 音调，可选
	}

	jsonValue, _ := json.Marshal(requestBody)

	// 创建 HTTP 请求
	req, err := http.NewRequest("POST", apiEndpoint, bytes.NewBuffer(jsonValue))
	if err != nil {
		fmt.Printf("创建请求失败: %v\n", err)
		return
	}

	// 设置请求头
	req.Header.Set("Content-Type", "application/json")
	// 注意：API Key 的传递方式可能因 NaturalReader 的具体要求而异，
	// 可能是 Authorization Bearer Token，也可能是自定义 Header。
	// 请务必查阅 NaturalReader 的官方 API 文档。
	req.Header.Set("Authorization", "Bearer "+apiKey) // 假设使用 Bearer Token

	// 发送请求
	client := &http.Client{}
	resp, err := client.Do(req)
	if err != nil {
		fmt.Printf("发送请求失败: %v\n", err)
		return
	}
	defer resp.Body.Close()

	// 检查响应状态码
	if resp.StatusCode != http.StatusOK {
		bodyBytes, _ := ioutil.ReadAll(resp.Body)
		fmt.Printf("API 请求失败，状态码: %d, 响应: %s\n", resp.StatusCode, string(bodyBytes))
		return
	}

	// 读取响应体（音频数据）
	audioData, err := ioutil.ReadAll(resp.Body)
	if err != nil {
		fmt.Printf("读取响应体失败: %v\n", err)
		return
	}

	// 保存音频文件
	outputFileName := "naturalreader_output.mp3"
	err = ioutil.WriteFile(outputFileName, audioData, 0644)
	if err != nil {
		fmt.Printf("保存音频文件失败: %v\n", err)
		return
	}

	fmt.Printf("语音文件已成功生成： %s\n", outputFileName)
}
func Text2Mp3FromNaturalReaderWithFile(textFile string) (ogg string, err error) {

	// SpeechifyResponse represents the assumed structure of Speechify's Protobuf response (conceptual)
	// Note: Actual Protobuf decoding would require the .proto file and a protobuf library.
	// For simplicity here, we assume the response body is raw audio binary data if not explicitly wrapped.
	// If it's a wrapped protobuf, you'd need to unmarshal it correctly.
	type SpeechifyResponse struct {
		// If Speechify sends back JSON or a known structure within protobuf
		// For actual Protobuf, this would be `[]byte` and require specific decoding.
		AudioContent []byte // This would be the raw audio bytes after decoding Protobuf, or directly if it's not wrapped.
		// Other fields from the protobuf message if any
	}

	const (
		// Speechify V3 API Endpoint from your screenshot
		speechifyV3Endpoint = "https://audio.api.speechify.com/v3/speech/get"
	)

	// Load API key from environment variable for security
	// For example: export SPEECHIFY_API_KEY="your_api_key_here"
	speechifyAPIKey := os.Getenv("SPEECHIFY_API_KEY")
	if speechifyAPIKey == "" {
		log.Fatal("SPEECHIFY_API_KEY environment variable not set.")
	}

	// Prepare payload for Speechify V3 API
	speechifyPayload := map[string]interface{}{
		"voiceId":           "xiaoxiao",
		"forcedAudioFormat": "ogg",
		"ssml":              "<speak>ix-applications. " + textFile + "</speak>", // This tells Speechify what format we'd prefer inside the protobuf
	}

	jsonPayload, err := json.Marshal(speechifyPayload)
	if err != nil {
		return "", err
	}

	// Create HTTP request to Speechify API
	client := &http.Client{}
	speechifyReq, err := http.NewRequest("POST", speechifyV3Endpoint, bytes.NewBuffer(jsonPayload))
	if err != nil {
		return "", err
	}

	// Set headers for Speechify API
	speechifyReq.Header.Set("Content-Type", "application/json") // Request body is JSON
	speechifyReq.Header.Set("Authorization", "Bearer "+speechifyAPIKey)
	// Based on your screenshot, also setting these might be beneficial if they're required
	// speechifyReq.Header.Set("sec-ch-ua", `"Not_A Brand";v="8", "Chromium";v="123", "Google Chrome";v="123"`)
	// speechifyReq.Header.Set("sec-ch-ua-mobile", `?0`)
	// speechifyReq.Header.Set("sec-ch-ua-platform", `"macOS"`)
	// speechifyReq.Header.Set("origin", `https://chat.qwen.ai`) // Or your frontend origin

	resp, err := client.Do(speechifyReq)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return "", fmt.Errorf("Speechify API returned non-OK status: %d %s", resp.StatusCode, resp.Status)
	}

	// Read the raw Protobuf response body
	rawAudioBytes, err := ioutil.ReadAll(resp.Body)
	if err != nil {
		return "", err
	}

	// --- Protobuf Decoding (Crucial Step - Placeholder) ---
	// This is the part where you would typically decode the protobuf.
	// If Speechify's .proto file defines a message like:
	// message AudioResult { bytes audio_content = 1; string format = 2; }
	// You would use a Go protobuf library (e.g., github.com/golang/protobuf/proto or google.golang.org/protobuf/proto)
	// to unmarshal `rawAudioBytes` into that message and extract `audio_content`.
	//
	// For this example, we're assuming `rawAudioBytes` *is* the actual audio content
	// if the protobuf wrapper is minimal or the API directly returns the binary stream.
	// **You MUST verify Speechify's actual Protobuf structure.**
	// If it's wrapped, you'll need to parse it using protobuf definitions.

	// For demonstration, let's assume rawAudioBytes is directly the audio content.
	// If it's truly protobuf-wrapped, this part needs to be replaced with actual protobuf decoding.
	audioContent := rawAudioBytes // Placeholder: Assuming raw bytes are the audio.

	// Encode audio to Base64
	base64Audio := base64.StdEncoding.EncodeToString(audioContent)

	return base64Audio, nil
}
