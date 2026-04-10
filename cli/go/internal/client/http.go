// Package client provides sync and async HTTP helpers for the NexusConsult API.
package client

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"sync"
	"time"

	"github.com/nexusconsult/nexus-cli/internal/config"
)

var httpClient = &http.Client{Timeout: 30 * time.Second}

// APIError wraps an HTTP error response.
type APIError struct {
	Status int
	Body   string
}

func (e *APIError) Error() string {
	return fmt.Sprintf("HTTP %d: %s", e.Status, e.Body)
}

func baseURL() string {
	return config.Load().APIURL
}

func authHeader() string {
	if tok := config.Load().Token; tok != "" {
		return "Bearer " + tok
	}
	return ""
}

func do(method, path string, body interface{}) ([]byte, error) {
	var bodyReader io.Reader
	if body != nil {
		data, err := json.Marshal(body)
		if err != nil {
			return nil, err
		}
		bodyReader = bytes.NewReader(data)
	}

	url := baseURL() + path
	req, err := http.NewRequest(method, url, bodyReader)
	if err != nil {
		return nil, err
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Accept", "application/json")
	if auth := authHeader(); auth != "" {
		req.Header.Set("Authorization", auth)
	}

	resp, err := httpClient.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	respBody, _ := io.ReadAll(resp.Body)
	if resp.StatusCode >= 400 {
		return nil, &APIError{Status: resp.StatusCode, Body: string(respBody)}
	}
	return respBody, nil
}

// Get performs a GET request and decodes JSON into dst.
func Get(path string, dst interface{}) error {
	data, err := do("GET", path, nil)
	if err != nil {
		return err
	}
	return json.Unmarshal(data, dst)
}

// GetRaw returns raw JSON bytes.
func GetRaw(path string) ([]byte, error) {
	return do("GET", path, nil)
}

// Post performs a POST request with a JSON body.
func Post(path string, body interface{}, dst interface{}) error {
	data, err := do("POST", path, body)
	if err != nil {
		return err
	}
	if dst != nil {
		return json.Unmarshal(data, dst)
	}
	return nil
}

// Patch performs a PATCH request.
func Patch(path string, body interface{}, dst interface{}) error {
	data, err := do("PATCH", path, body)
	if err != nil {
		return err
	}
	if dst != nil {
		return json.Unmarshal(data, dst)
	}
	return nil
}

// Delete performs a DELETE request.
func Delete(path string) error {
	_, err := do("DELETE", path, nil)
	return err
}

// ParallelGet fetches multiple paths concurrently and returns results in order.
type GetResult struct {
	Path  string
	Data  []byte
	Error error
}

func ParallelGet(paths []string) []GetResult {
	results := make([]GetResult, len(paths))
	var wg sync.WaitGroup
	for i, p := range paths {
		wg.Add(1)
		go func(idx int, path string) {
			defer wg.Done()
			data, err := GetRaw(path)
			results[idx] = GetResult{Path: path, Data: data, Error: err}
		}(i, p)
	}
	wg.Wait()
	return results
}
