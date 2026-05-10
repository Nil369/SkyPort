package metrics

import (
	"context"
	"testing"
)

func TestServiceCollect(t *testing.T) {
	svc := NewService("")
	snap, err := svc.Collect(context.Background())
	if err != nil {
		t.Fatalf("collect failed: %v", err)
	}
	if snap.Schema != SchemaHostV1 {
		t.Fatalf("unexpected schema: %s", snap.Schema)
	}
	if snap.CPU.CoresLogical <= 0 {
		t.Fatalf("invalid core count")
	}
}
