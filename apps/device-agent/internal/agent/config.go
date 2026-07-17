package agent

import (
	"encoding/json"
	"errors"
	"fmt"
	"net/url"
	"os"
)

type Config struct {
	ServerURL         string `json:"server_url"`
	DeviceID          string `json:"device_id"`
	DeviceSecret      string `json:"device_secret"`
	HeartbeatSeconds  int    `json:"heartbeat_seconds"`
	SpoolDir          string `json:"spool_dir"`
	AllowInsecureHTTP bool   `json:"allow_insecure_http"`
}

func (c Config) Validate() error {
	u, err := url.Parse(c.ServerURL)
	if err != nil || u.Host == "" {
		return errors.New("server_url must be an absolute URL")
	}
	if u.Scheme != "https" && !(c.AllowInsecureHTTP && u.Scheme == "http") {
		return errors.New("server_url must use HTTPS")
	}
	if c.DeviceID == "" {
		return errors.New("device_id is required")
	}
	if len(c.DeviceSecret) < 32 {
		return errors.New("device_secret must contain at least 32 characters")
	}
	if c.HeartbeatSeconds < 10 || c.HeartbeatSeconds > 3600 {
		return errors.New("heartbeat_seconds must be between 10 and 3600")
	}
	if c.SpoolDir == "" {
		return errors.New("spool_dir is required")
	}
	return nil
}

func LoadConfig(path string) (Config, error) {
	data, err := os.ReadFile(path)
	if err != nil {
		return Config{}, fmt.Errorf("read config: %w", err)
	}
	var config Config
	if err := json.Unmarshal(data, &config); err != nil {
		return Config{}, fmt.Errorf("parse config: %w", err)
	}
	if err := config.Validate(); err != nil {
		return Config{}, err
	}
	return config, nil
}
