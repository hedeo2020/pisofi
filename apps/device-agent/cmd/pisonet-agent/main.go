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
	"strings"
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
	if config.CoinPulseValuePath != "" {
		go runCoinPulseMonitor(ctx, client, config)
	}
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

func runCoinPulseMonitor(ctx context.Context, client *agent.Client, config agent.Config) {
	pollMillis := config.CoinPulsePollMillis
	if pollMillis == 0 {
		pollMillis = 25
	}
	detector := agent.NewPulseDetector(config.CoinPulseIdleHigh)
	ticker := time.NewTicker(time.Duration(pollMillis) * time.Millisecond)
	defer ticker.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			level, err := readGPIOValue(config.CoinPulseValuePath)
			if err != nil {
				log.Printf("coin pulse read error: %v", err)
				continue
			}
			if !detector.Observe(level) {
				continue
			}
			eventID := fmt.Sprintf("%s-%d", config.DeviceID, time.Now().UnixNano())
			sendCtx, cancel := context.WithTimeout(ctx, 20*time.Second)
			err = client.SendCoinPulse(sendCtx, eventID, 1)
			cancel()
			if err != nil {
				log.Printf("coin pulse send error: %v", err)
			} else {
				log.Printf("coin pulse accepted event_id=%s", eventID)
			}
		}
	}
}

func readGPIOValue(path string) (bool, error) {
	data, err := os.ReadFile(path)
	if err != nil {
		return false, err
	}
	switch strings.TrimSpace(string(data)) {
	case "0":
		return false, nil
	case "1":
		return true, nil
	default:
		return false, fmt.Errorf("GPIO value must be 0 or 1")
	}
}
