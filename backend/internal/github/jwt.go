package github

import (
	"crypto/rsa"
	"crypto/x509"
	"encoding/pem"
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/golang-jwt/jwt/v5"
)

func signGitHubAppJWT(appID, pemKey string) (string, error) {
	block, _ := pem.Decode([]byte(strings.TrimSpace(pemKey)))
	if block == nil {
		return "", errors.New("github app private key is not valid pem")
	}

	var rsaKey *rsa.PrivateKey
	if keyAny, err := x509.ParsePKCS8PrivateKey(block.Bytes); err == nil {
		if key, ok := keyAny.(*rsa.PrivateKey); ok {
			rsaKey = key
		}
	}
	if rsaKey == nil {
		if key, err := x509.ParsePKCS1PrivateKey(block.Bytes); err == nil {
			rsaKey = key
		}
	}
	if rsaKey == nil {
		return "", errors.New("github app private key must be rsa")
	}

	now := time.Now().UTC()
	claims := jwt.MapClaims{
		"iat": now.Add(-30 * time.Second).Unix(),
		"exp": now.Add(9 * time.Minute).Unix(),
		"iss": strings.TrimSpace(appID),
	}
	token := jwt.NewWithClaims(jwt.SigningMethodRS256, claims)
	return token.SignedString(rsaKey)
}

func urlQueryEscape(v string) string {
	return strings.ReplaceAll(strings.ReplaceAll(strings.TrimSpace(v), "#", "%23"), " ", "%20")
}

func debugJWTClaims(appID string) string {
	return fmt.Sprintf("iss=%s", strings.TrimSpace(appID))
}
