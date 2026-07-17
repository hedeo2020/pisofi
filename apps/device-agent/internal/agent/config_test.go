package agent

import (
	"os"
	"path/filepath"
	"testing"
)

func TestConfigValidation(t *testing.T) {
	valid := Config{ServerURL: "https://control.example.com", DeviceID: "station-1", DeviceSecret: "a-device-secret-with-at-least-32-bytes", HeartbeatSeconds: 30, SpoolDir: "/tmp/pisonet-agent"}
	if err := valid.Validate(); err != nil {
		t.Fatalf("valid config rejected: %v", err)
	}

	invalid := valid
	invalid.ServerURL = "http://control.example.com"
	if err := invalid.Validate(); err == nil {
		t.Fatal("insecure URL accepted")
	}

	invalid = valid
	invalid.DeviceSecret = "short"
	if err := invalid.Validate(); err == nil {
		t.Fatal("short secret accepted")
	}
}

func TestLoadConfig(t *testing.T) {
	path := filepath.Join(t.TempDir(), "agent.json")
	data := []byte(`{"server_url":"https://control.example.com","device_id":"station-1","device_secret":"a-device-secret-with-at-least-32-bytes","heartbeat_seconds":30,"spool_dir":"/tmp/pisonet-agent"}`)
	if err := os.WriteFile(path, data, 0o600); err != nil {
		t.Fatal(err)
	}
	if _, err := LoadConfig(path); err != nil {
		t.Fatalf("load failed: %v", err)
	}
	if _, err := LoadConfig(filepath.Join(t.TempDir(), "missing.json")); err == nil {
		t.Fatal("missing file accepted")
	}
	if err := os.WriteFile(path, []byte("{"), 0o600); err != nil {
		t.Fatal(err)
	}
	if _, err := LoadConfig(path); err == nil {
		t.Fatal("invalid JSON accepted")
	}
}

func TestConfigRejectsMissingAndOutOfRangeFields(t *testing.T) {
	base := Config{ServerURL: "https://control.example.com", DeviceID: "station-1", DeviceSecret: "a-device-secret-with-at-least-32-bytes", HeartbeatSeconds: 30, SpoolDir: "/tmp/pisonet-agent"}
	cases := []Config{base, base, base, base}
	cases[0].ServerURL = "://bad"
	cases[1].DeviceID = ""
	cases[2].HeartbeatSeconds = 1
	cases[3].SpoolDir = ""
	for index, config := range cases {
		if err := config.Validate(); err == nil {
			t.Fatalf("case %d accepted", index)
		}
	}
}
