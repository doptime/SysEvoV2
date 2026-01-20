package utils

import (
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"regexp"
	"strings"
)

type NextErrorResponse struct {
	Props struct {
		PageProps struct {
			StatusCode int    `json:"statusCode"`
			Hostname   string `json:"hostname"`
		} `json:"pageProps"`
	} `json:"props"`
	Page  string `json:"page"`
	Query struct {
	} `json:"query"`
	BuildID    string `json:"buildId"`
	IsFallback bool   `json:"isFallback"`
	Err        struct {
		Name    string `json:"name"`
		Source  string `json:"source"`
		Message string `json:"message"`
		Stack   string `json:"stack"`
	} `json:"err"`
}

// removeANSICodes removes ANSI escape sequences from a string
func removeANSICodes(input string) string {
	// This regex matches most ANSI escape codes including colors, styles, etc.
	ansiRegex := regexp.MustCompile(`\x1b\[[0-9;]*[mK]`)
	return ansiRegex.ReplaceAllString(input, "")
}

// cleanErrorText performs additional cleanup on error text
func cleanErrorText(input string) string {
	// Remove ANSI codes first
	cleaned := removeANSICodes(input)

	// Replace multiple newlines with a single one
	cleaned = regexp.MustCompile(`\n{3,}`).ReplaceAllString(cleaned, "\n\n")

	// Trim extra whitespace
	cleaned = strings.TrimSpace(cleaned)

	return cleaned
}

func ExtractNextJSError(url string) (string, error) {
	// Make HTTP GET request
	resp, err := http.Get(url)
	if err != nil {
		return "", fmt.Errorf("failed to fetch URL: %v", err)
	}
	defer resp.Body.Close()

	// Read response body
	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return "", fmt.Errorf("failed to read response body: %v", err)
	}

	// Find the __NEXT_DATA__ script tag
	re := regexp.MustCompile(`<script id="__NEXT_DATA__" type="application/json">(.*?)</script>`)
	matches := re.FindStringSubmatch(string(body))
	if len(matches) < 2 {
		return "", fmt.Errorf("__NEXT_DATA__ script tag not found")
	}

	// Clean the JSON string (remove newlines and extra spaces)
	jsonStr := strings.TrimSpace(matches[1])

	// Parse the JSON
	var nextData NextErrorResponse
	if err := json.Unmarshal([]byte(jsonStr), &nextData); err != nil {
		return "", fmt.Errorf("failed to parse JSON: %v", err)
	}

	// Extract and format the error information
	if nextData.Err.Message == "" {
		return "", fmt.Errorf("no error message found in the response")
	}

	// Clean the error message and stack trace
	cleanMessage := cleanErrorText(nextData.Err.Message)
	cleanStack := cleanErrorText(nextData.Err.Stack)

	// Format the error output
	errorOutput := fmt.Sprintf("Error Name: %s\nSource: %s\nMessage:\n%s\nStack Trace:\n%s",
		nextData.Err.Name,
		nextData.Err.Source,
		cleanMessage,
		cleanStack)

	return errorOutput, nil
}
