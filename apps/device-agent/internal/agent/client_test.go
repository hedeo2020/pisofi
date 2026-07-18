package agent

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"
)

func TestHeartbeatUsesSignedOutboundRequest(t *testing.T) {
	var received bool
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/api/v1/device-events" {
			t.Errorf("unexpected path: %s", r.URL.Path)
		}
		if r.Header.Get("X-Device-ID") != "station-1" {
			t.Error("device ID missing")
		}
		if r.Header.Get("X-Device-Signature") == "" || r.Header.Get("X-Device-Nonce") == "" {
			t.Error("signature headers missing")
		}
		var body map[string]any
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			t.Errorf("invalid JSON: %v", err)
		}
		if body["event"] != "heartbeat" {
			t.Errorf("unexpected event: %v", body["event"])
		}
		received = true
		w.WriteHeader(http.StatusAccepted)
	}))
	defer server.Close()

	client := NewClient(Config{ServerURL: server.URL, AllowInsecureHTTP: true, DeviceID: "station-1", DeviceSecret: "a-device-secret-with-at-least-32-bytes", HeartbeatSeconds: 30, SpoolDir: t.TempDir()})
	client.now = func() time.Time { return time.Unix(1752710400, 0) }
	if err := client.SendHeartbeat(t.Context()); err != nil {
		t.Fatalf("heartbeat failed: %v", err)
	}
	if !received {
		t.Fatal("server did not receive heartbeat")
	}
}

func TestHeartbeatRejectsNonSuccessResponse(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { http.Error(w, "no", http.StatusUnauthorized) }))
	defer server.Close()
	client := NewClient(Config{ServerURL: server.URL, AllowInsecureHTTP: true, DeviceID: "station-1", DeviceSecret: "a-device-secret-with-at-least-32-bytes", HeartbeatSeconds: 30, SpoolDir: t.TempDir()})
	if err := client.SendHeartbeat(t.Context()); err == nil {
		t.Fatal("rejected heartbeat reported success")
	}
}

func TestHeartbeatReportsNetworkFailure(t *testing.T) {
	client := NewClient(Config{ServerURL: "http://127.0.0.1:1", AllowInsecureHTTP: true, DeviceID: "station-1", DeviceSecret: "a-device-secret-with-at-least-32-bytes", HeartbeatSeconds: 30, SpoolDir: t.TempDir()})
	if err := client.SendHeartbeat(t.Context()); err == nil {
		t.Fatal("network failure reported success")
	}
}

func TestCoinPulseUsesSignedOutboundRequest(t *testing.T) {
	var received bool
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/api/v1/device-events" {
			t.Errorf("unexpected path: %s", r.URL.Path)
		}
		if r.Header.Get("X-Device-ID") != "station-1" {
			t.Error("device ID missing")
		}
		if r.Header.Get("X-Device-Signature") == "" || r.Header.Get("X-Device-Nonce") == "" {
			t.Error("signature headers missing")
		}
		var body map[string]any
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			t.Errorf("invalid JSON: %v", err)
		}
		if body["event"] != "coin_pulse" {
			t.Errorf("unexpected event: %v", body["event"])
		}
		if body["eventId"] != "coin-1" {
			t.Errorf("unexpected event ID: %v", body["eventId"])
		}
		if body["pulses"] != float64(2) {
			t.Errorf("unexpected pulses: %v", body["pulses"])
		}
		received = true
		w.WriteHeader(http.StatusAccepted)
	}))
	defer server.Close()

	client := NewClient(Config{ServerURL: server.URL, AllowInsecureHTTP: true, DeviceID: "station-1", DeviceSecret: "a-device-secret-with-at-least-32-bytes", HeartbeatSeconds: 30, SpoolDir: t.TempDir()})
	client.now = func() time.Time { return time.Unix(1752710400, 0) }
	if err := client.SendCoinPulse(t.Context(), "coin-1", 2); err != nil {
		t.Fatalf("coin pulse failed: %v", err)
	}
	if !received {
		t.Fatal("server did not receive coin pulse")
	}
}
