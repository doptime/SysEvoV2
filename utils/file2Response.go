package utils

import (
	"encoding/json"
	"fmt"
	"os"
	"strings"
	"time"

	"sysevov2/config"

	openai "github.com/sashabaranov/go-openai"
)

func getLocalFileName(filename string) string {
	if strings.Contains(filename, ".Now") {
		//replace .Now with time format "yyyy-MM-dd-HH-mm"
		var timeFormat = "2006-01-02-15-04"
		filename = strings.Replace(filename, ".Now", "."+time.Now().Format(timeFormat), 1)
	}
	for _, c := range config.AllEvoRealmsInFile {
		if ind := strings.Index(filename, c.Name); ind == 0 {
			filename = strings.Replace(filename, c.Name, c.RootPath, 1)
		}
	}
	return filename
}
func StringToFile(filename, content string) error {
	filename = getLocalFileName(filename)
	file, err := os.Create(filename)
	if err != nil {
		return err
	}
	defer file.Close()
	_, err = file.WriteString(content)
	fmt.Println("A file saved: ", filename)
	return err
}

func FileToResponse(filename string) (resp openai.ChatCompletionResponse, err error) {
	filename = getLocalFileName(filename)
	data, err := os.ReadFile(filename)
	if err != nil {
		return resp, err
	}
	return resp, json.Unmarshal(data, &resp)
}

func StringToResponse(content string) (resp openai.ChatCompletionResponse, err error) {
	var msg openai.ChatCompletionMessage
	msg.Role = "assistant"
	msg.Content = content
	resp.Choices = []openai.ChatCompletionChoice{
		{
			Message: msg,
		},
	}
	return resp, nil
}
