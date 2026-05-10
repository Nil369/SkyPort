package auth

import (
	"testing"
	"time"
)

func TestSignAndParseAccessToken(t *testing.T) {
	secret := "test-secret-test-secret-test-secret"
	raw, _, err := SignAccessToken(secret, 42, "a@b.com", time.Minute)
	if err != nil {
		t.Fatalf("sign failed: %v", err)
	}
	claims, err := ParseAccessToken(raw, secret)
	if err != nil {
		t.Fatalf("parse failed: %v", err)
	}
	if claims.UserID != 42 {
		t.Fatalf("expected user id 42, got %d", claims.UserID)
	}
}
