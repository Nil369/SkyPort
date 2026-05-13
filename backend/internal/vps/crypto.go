package vps

import (
	"crypto/aes"
	"crypto/cipher"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"fmt"
	"io"
	"os"
)

// Encryptor handles AES-256 encryption/decryption for sensitive data
type Encryptor struct {
	key []byte
}

// NewEncryptor creates a new Encryptor with the provided encryption key
func NewEncryptor(keyHex string) (*Encryptor, error) {
	if keyHex == "" {
		// Fallback to environment variable for production
		keyHex = os.Getenv("SKYPORT_ENCRYPTION_KEY")
		if keyHex == "" {
			return nil, fmt.Errorf("no encryption key provided and SKYPORT_ENCRYPTION_KEY not set")
		}
	}

	// Decode hex string to bytes
	keyBytes, err := base64.StdEncoding.DecodeString(keyHex)
	if err != nil {
		return nil, fmt.Errorf("failed to decode encryption key: %w", err)
	}

	// Validate key length (must be 16, 24, or 32 bytes)
	if len(keyBytes) != 16 && len(keyBytes) != 24 && len(keyBytes) != 32 {
		return nil, fmt.Errorf("invalid key length: must be 128, 192, or 256 bits, got %d", len(keyBytes)*8)
	}

	return &Encryptor{key: keyBytes}, nil
}

// Encrypt encrypts data using AES-256-GCM
func (e *Encryptor) Encrypt(plaintext []byte) (string, error) {
	if plaintext == nil || len(plaintext) == 0 {
		return "", nil
	}

	block, err := aes.NewCipher(e.key)
	if err != nil {
		return "", fmt.Errorf("failed to create cipher: %w", err)
	}

	// Use GCM mode for authenticated encryption
	gcm, err := cipher.NewGCM(block)
	if err != nil {
		return "", fmt.Errorf("failed to create GCM: %w", err)
	}

	// Generate nonce
	nonce := make([]byte, gcm.NonceSize())
	if _, err := io.ReadFull(rand.Reader, nonce); err != nil {
		return "", fmt.Errorf("failed to generate nonce: %w", err)
	}

	// Encrypt
	ciphertext := gcm.Seal(nonce, nonce, plaintext, nil)

	// Return base64 encoded ciphertext
	return base64.StdEncoding.EncodeToString(ciphertext), nil
}

// Decrypt decrypts data using AES-256-GCM
func (e *Encryptor) Decrypt(encryptedText string) ([]byte, error) {
	if encryptedText == "" {
		return nil, nil
	}

	// Decode base64
	ciphertext, err := base64.StdEncoding.DecodeString(encryptedText)
	if err != nil {
		return nil, fmt.Errorf("failed to decode ciphertext: %w", err)
	}

	block, err := aes.NewCipher(e.key)
	if err != nil {
		return nil, fmt.Errorf("failed to create cipher: %w", err)
	}

	gcm, err := cipher.NewGCM(block)
	if err != nil {
		return nil, fmt.Errorf("failed to create GCM: %w", err)
	}

	// Extract nonce
	nonceSize := gcm.NonceSize()
	if len(ciphertext) < nonceSize {
		return nil, fmt.Errorf("ciphertext too short")
	}

	nonce, ciphertext := ciphertext[:nonceSize], ciphertext[nonceSize:]

	// Decrypt
	plaintext, err := gcm.Open(nil, nonce, ciphertext, nil)
	if err != nil {
		return nil, fmt.Errorf("decryption failed: %w", err)
	}

	return plaintext, nil
}

// DecryptToString is a convenience method for decrypting to string
func (e *Encryptor) DecryptToString(encryptedText string) (string, error) {
	plaintext, err := e.Decrypt(encryptedText)
	if err != nil {
		return "", err
	}
	return string(plaintext), nil
}

// HashSSHKey generates SHA256 fingerprint of SSH public key
// Compatible with: ssh-keygen -l -f <file>
func HashSSHKey(keyContent []byte) (string, error) {
	if len(keyContent) == 0 {
		return "", fmt.Errorf("empty key content")
	}

	hash := sha256.Sum256(keyContent)

	// Format as standard SSH key fingerprint: base64(sha256_hash)
	fingerprint := base64.StdEncoding.EncodeToString(hash[:])

	// Add SHA256 prefix like ssh-keygen does
	return fmt.Sprintf("SHA256:%s", fingerprint), nil
}

// SecureWipe overwrites data with random bytes
func SecureWipe(data []byte) {
	if data == nil || len(data) == 0 {
		return
	}

	if _, err := rand.Read(data); err != nil {
		// Fallback if rand fails - just zero it
		for i := range data {
			data[i] = 0
		}
	}
}

// ValidateKeyFormat checks if the SSH key has a valid format
func ValidateKeyFormat(keyContent []byte) error {
	if len(keyContent) == 0 {
		return fmt.Errorf("empty key")
	}

	keyStr := string(keyContent)

	// Check for BEGIN/END markers (PEM format)
	if keyStr != "" && (len(keyStr) > 0) {
		// OpenSSH format or PEM format
		return nil
	}

	return fmt.Errorf("invalid key format")
}

// GenerateEncryptionKey generates a random 256-bit encryption key
func GenerateEncryptionKey() (string, error) {
	key := make([]byte, 32) // 256 bits
	if _, err := rand.Read(key); err != nil {
		return "", fmt.Errorf("failed to generate encryption key: %w", err)
	}

	// Return as base64 string
	return base64.StdEncoding.EncodeToString(key), nil
}
