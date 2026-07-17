package main

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"flag"
	"fmt"
	"log"
	"os"
	"os/signal"
	"runtime"
	"syscall"
	"time"

	"pisonet/device-agent/internal/agent"
)

var version = "dev"

func main() {
	configPath := flag.String("config", "/etc/pisonet-agent/config.json", "configuration file")
	selfTest := flag.Bool("self-test", false, "run a hardware-safe local self-test and exit")
	showVersion := flag.Bool("version", false, "print version and exit")
	flag.Parse()

	if *showVersion {
		fmt.Printf("pisonet-agent %s %s/%s\n", version, runtime.GOOS, runtime.GOARCH)
		return
	}
	if *selfTest {
		buffer := make([]byte, 16)
		if _, err := rand.Read(buffer); err != nil {
			log.Fatalf("self-test entropy failed: %v", err)
		}
		fmt.Printf("self-test passed version=%s os=%s arch=%s entropy=%s\n", version, runtime.GOOS, runtime.GOARCH, hex.EncodeToString(buffer[:4]))
		return
	}

	config, err := agent.LoadConfig(*configPath)
	if err != nil {
		log.Fatalf("configuration error: %v", err)
	}
	client := agent.NewClient(config)
	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()
	ticker := time.NewTicker(time.Duration(config.HeartbeatSeconds) * time.Second)
	defer ticker.Stop()

	send := func() {
		heartbeatCtx, cancel := context.WithTimeout(ctx, 20*time.Second)
		defer cancel()
		if err := client.SendHeartbeat(heartbeatCtx); err != nil {
			log.Printf("heartbeat error: %v", err)
		}
	}
	send()
	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			send()
		}
	}
}
