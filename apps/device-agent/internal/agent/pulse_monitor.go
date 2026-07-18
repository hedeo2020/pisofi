package agent

type PulseDetector struct {
	idleHigh bool
	seen     bool
	last     bool
}

func NewPulseDetector(idleHigh bool) *PulseDetector {
	return &PulseDetector{idleHigh: idleHigh}
}

func (d *PulseDetector) Observe(level bool) bool {
	if !d.seen {
		d.seen = true
		d.last = level
		return false
	}
	previous := d.last
	d.last = level
	if d.idleHigh {
		return previous && !level
	}
	return !previous && level
}
