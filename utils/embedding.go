package utils

import (
	"context"
	"fmt"

	openai "github.com/sashabaranov/go-openai"
)

func GetEmbedding(text string) ([]float32, error) {
	// 	curl http://127.0.0.1:1234/api/v0/embeddings \
	//   -H "Content-Type: application/json" \
	//   -d '{
	//     "model": "gemma-3-12b-it",
	//     "input": "Some text to embed"
	//   }
	apiKey := ""
	config := openai.DefaultConfig(apiKey)
	config.BaseURL = "http://macmini-2.lan:1234/v1"
	client := openai.NewClientWithConfig(config)
	embedding, err := client.CreateEmbeddings(
		context.Background(),
		openai.EmbeddingRequest{
			//Model: "gte-qwen2-7b-instruct",
			//Model: "BillSYZhang/gte-qwen2-7b-instruct-mlx",
			//Model: "text-embedding-multilingual-e5-large-instruct",
			//Model: "qwen3-embedding-8b",
			Model: "Qwen/Qwen3-Embedding-4B-GGUF",
			//Model: "Qwen/Qwen3-Embedding-0.6B-GGUF",
			Input: text,
		},
	)
	if err != nil {
		return nil, err
	}
	if len(embedding.Data) == 0 {
		return nil, fmt.Errorf("no embedding data received")
	}
	return embedding.Data[0].Embedding, nil
}
