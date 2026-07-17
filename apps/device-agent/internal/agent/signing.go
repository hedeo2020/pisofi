package agent

import (
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"strings"
)

type SignedRequest struct {
	Method    string
	Path      string
	Body      []byte
	Timestamp int64
	Nonce     string
}

func SignRequest(request SignedRequest, secret string) string {
	canonical := strings.Join([]string{strings.ToUpper(request.Method), request.Path, fmt.Sprint(request.Timestamp), request.Nonce, string(request.Body)}, "\n")
	mac := hmac.New(sha256.New, []byte(secret))
	_, _ = mac.Write([]byte(canonical))
	return hex.EncodeToString(mac.Sum(nil))
}
