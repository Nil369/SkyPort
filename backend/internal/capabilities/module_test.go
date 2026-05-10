package capabilities

import (
	"context"
	"testing"
)

func TestDetect(t *testing.T) {
	out := Detect(context.Background())
	if out.CPUCores < 1 {
		t.Fatalf("expected cpu cores >=1, got %d", out.CPUCores)
	}
	if out.TotalRAMBytes == 0 {
		t.Fatalf("expected total ram > 0")
	}
}
