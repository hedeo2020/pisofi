package agent

import "testing"

func TestPulseDetectorCountsFallingEdges(t *testing.T) {
	detector := NewPulseDetector(true)
	levels := []bool{true, true, false, false, true, false, true}
	var pulses int
	for _, level := range levels {
		if detector.Observe(level) {
			pulses++
		}
	}
	if pulses != 2 {
		t.Fatalf("expected 2 pulses, got %d", pulses)
	}
}

func TestPulseDetectorCanCountRisingEdges(t *testing.T) {
	detector := NewPulseDetector(false)
	levels := []bool{false, false, true, true, false, true, false}
	var pulses int
	for _, level := range levels {
		if detector.Observe(level) {
			pulses++
		}
	}
	if pulses != 2 {
		t.Fatalf("expected 2 pulses, got %d", pulses)
	}
}
