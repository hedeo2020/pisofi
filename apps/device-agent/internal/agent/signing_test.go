package agent

import "testing"

func TestSignRequestIsStableAndBodyBound(t *testing.T) {
	request := SignedRequest{Method: "POST", Path: "/api/v1/device-events", Body: []byte(`{"event":"heartbeat"}`), Timestamp: 1752710400, Nonce: "nonce-1"}
	secret := "a-device-secret-with-at-least-32-bytes"
	first := SignRequest(request, secret)
	second := SignRequest(request, secret)
	if first != second {
		t.Fatal("signature is not deterministic")
	}
	request.Body = []byte(`{"event":"tampered"}`)
	if SignRequest(request, secret) == first {
		t.Fatal("signature does not bind body")
	}
}
