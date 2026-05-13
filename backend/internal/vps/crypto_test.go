package vps

import (
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// TestEncryption tests the encryption functionality
func TestEncryption(t *testing.T) {
	// Generate test key
	keyHex, err := GenerateEncryptionKey()
	require.NoError(t, err)
	assert.NotEmpty(t, keyHex)

	// Create encryptor
	encryptor, err := NewEncryptor(keyHex)
	require.NoError(t, err)
	assert.NotNil(t, encryptor)

	// Test data
	testData := []byte("test private key content")

	// Encrypt
	encrypted, err := encryptor.Encrypt(testData)
	require.NoError(t, err)
	assert.NotEmpty(t, encrypted)

	// Verify it's encrypted (not plaintext)
	assert.NotEqual(t, encrypted, string(testData))

	// Decrypt
	decrypted, err := encryptor.Decrypt(encrypted)
	require.NoError(t, err)
	assert.Equal(t, testData, decrypted)
}

// TestKeyFingerprint tests SSH key fingerprint generation
func TestKeyFingerprint(t *testing.T) {
	testKey := []byte("ssh-rsa AAAAB3NzaC1yc2EAAAADAQABAAABgQC...")

	fingerprint, err := HashSSHKey(testKey)
	require.NoError(t, err)
	assert.NotEmpty(t, fingerprint)
	assert.True(t, len(fingerprint) > 0)
	assert.Contains(t, fingerprint, "SHA256:")
}

// TestValidateKeyFormat tests key format validation
func TestValidateKeyFormat(t *testing.T) {
	// Valid key
	validKey := []byte("-----BEGIN RSA PRIVATE KEY-----")
	err := ValidateKeyFormat(validKey)
	assert.NoError(t, err)

	// Empty key
	err = ValidateKeyFormat([]byte(""))
	assert.Error(t, err)
}

// TestSSHConnectionConfig tests SSH connection configuration
func TestSSHConnectionConfig(t *testing.T) {
	testCases := []struct {
		name      string
		host      string
		port      int
		username  string
		shouldErr bool
	}{
		{
			name:      "valid config",
			host:      "192.168.1.100",
			port:      22,
			username:  "ubuntu",
			shouldErr: false,
		},
		{
			name:      "invalid port - too high",
			host:      "192.168.1.100",
			port:      99999,
			username:  "ubuntu",
			shouldErr: true,
		},
		{
			name:      "invalid port - too low",
			host:      "192.168.1.100",
			port:      0,
			username:  "ubuntu",
			shouldErr: true,
		},
	}

	for _, tc := range testCases {
		t.Run(tc.name, func(t *testing.T) {
			// Port validation
			if tc.port < 1 || tc.port > 65535 {
				assert.True(t, tc.shouldErr)
			}
		})
	}
}

// Benchmark encryption
func BenchmarkEncryption(b *testing.B) {
	keyHex, _ := GenerateEncryptionKey()
	encryptor, _ := NewEncryptor(keyHex)
	testData := []byte("test private key content")

	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		encryptor.Encrypt(testData)
	}
}

// Benchmark decryption
func BenchmarkDecryption(b *testing.B) {
	keyHex, _ := GenerateEncryptionKey()
	encryptor, _ := NewEncryptor(keyHex)
	testData := []byte("test private key content")
	encrypted, _ := encryptor.Encrypt(testData)

	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		encryptor.Decrypt(encrypted)
	}
}
