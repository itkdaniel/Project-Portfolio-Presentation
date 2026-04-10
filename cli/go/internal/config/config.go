// Package config manages CLI configuration from env vars and ~/.nexus/config.json.
package config

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"strconv"
)

type Config struct {
	APIURL   string `json:"api_url"`
	Token    string `json:"token"`
	Username string `json:"username"`
	RoleID   int    `json:"role_id"`
}

var defaults = Config{
	APIURL: "http://localhost:5000",
	RoleID: 1,
}

func configPath() string {
	home, _ := os.UserHomeDir()
	return filepath.Join(home, ".nexus", "config.json")
}

func Load() Config {
	cfg := defaults

	// Load from file
	data, err := os.ReadFile(configPath())
	if err == nil {
		_ = json.Unmarshal(data, &cfg)
	}

	// Override with env vars
	if v := os.Getenv("NEXUS_API_URL"); v != "" {
		cfg.APIURL = v
	}
	if v := os.Getenv("NEXUS_TOKEN"); v != "" {
		cfg.Token = v
	}
	if v := os.Getenv("NEXUS_ROLE_ID"); v != "" {
		if id, err := strconv.Atoi(v); err == nil {
			cfg.RoleID = id
		}
	}
	return cfg
}

func Save(updates map[string]interface{}) error {
	cfg := Load()
	current := map[string]interface{}{
		"api_url":  cfg.APIURL,
		"token":    cfg.Token,
		"username": cfg.Username,
		"role_id":  cfg.RoleID,
	}
	for k, v := range updates {
		current[k] = v
	}
	dir := filepath.Dir(configPath())
	if err := os.MkdirAll(dir, 0700); err != nil {
		return fmt.Errorf("create config dir: %w", err)
	}
	data, err := json.MarshalIndent(current, "", "  ")
	if err != nil {
		return err
	}
	return os.WriteFile(configPath(), data, 0600)
}

func Clear() error {
	cfg := Load()
	return Save(map[string]interface{}{
		"api_url":  cfg.APIURL,
		"token":    "",
		"username": "",
		"role_id":  1,
	})
}
