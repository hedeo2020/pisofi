package agent

import (
	"bytes"
	"context"
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"net/http"
	"runtime"
	"strconv"
	"strings"
	"time"
)

type Client struct {
	config Config
	http   *http.Client
	now    func() time.Time
}

func NewClient(config Config) *Client {
	return &Client{config: config, http: &http.Client{Timeout: 15 * time.Second}, now: time.Now}
}

func nonce() (string, error) {
	value := make([]byte, 16)
	if _, err := rand.Read(value); err != nil {
		return "", err
	}
	return hex.EncodeToString(value), nil
}

func (c *Client) SendHeartbeat(ctx context.Context) error {
	body, err := json.Marshal(map[string]any{
		"event":       "heartbeat",
		"occurred_at": c.now().UTC().Format(time.RFC3339),
		"agent":       map[string]string{"os": runtime.GOOS, "arch": runtime.GOARCH},
	})
	if err != nil {
		return err
	}
	requestNonce, err := nonce()
	if err != nil {
		return fmt.Errorf("create nonce: %w", err)
	}
	path := "/api/v1/device-events"
	timestamp := c.now().Unix()
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, strings.TrimRight(c.config.ServerURL, "/")+path, bytes.NewReader(body))
	if err != nil {
		return err
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("X-Device-ID", c.config.DeviceID)
	req.Header.Set("X-Device-Timestamp", strconv.FormatInt(timestamp, 10))
	req.Header.Set("X-Device-Nonce", requestNonce)
	req.Header.Set("X-Device-Signature", SignRequest(SignedRequest{Method: http.MethodPost, Path: path, Body: body, Timestamp: timestamp, Nonce: requestNonce}, c.config.DeviceSecret))
	response, err := c.http.Do(req)
	if err != nil {
		return fmt.Errorf("send heartbeat: %w", err)
	}
	defer response.Body.Close()
	if response.StatusCode < 200 || response.StatusCode >= 300 {
		return fmt.Errorf("heartbeat rejected with HTTP %d", response.StatusCode)
	}
	return nil
}
