package keyring

import (
	"crypto/aes"
	"crypto/cipher"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"errors"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"runtime"
	"strings"
)

var ErrNotFound = errors.New("keyring: not found")

func Set(service, user, secret string) error {
	store, err := openStore(service)
	if err != nil {
		return err
	}
	store[normalize(user)] = secret
	return saveStore(service, store)
}

func Get(service, user string) (string, error) {
	store, err := openStore(service)
	if err != nil {
		return "", err
	}
	value, ok := store[normalize(user)]
	if !ok {
		return "", ErrNotFound
	}
	return value, nil
}

func Delete(service, user string) error {
	store, err := openStore(service)
	if err != nil {
		if errors.Is(err, os.ErrNotExist) {
			return ErrNotFound
		}
		return err
	}
	key := normalize(user)
	if _, ok := store[key]; !ok {
		return ErrNotFound
	}
	delete(store, key)
	return saveStore(service, store)
}

func normalize(value string) string { return strings.TrimSpace(strings.ToLower(value)) }

func storeDir() (string, error) {
	dir, err := os.UserConfigDir()
	if err != nil {
		return "", err
	}
	return filepath.Join(dir, "skyport", "keyring"), nil
}

func openStore(service string) (map[string]string, error) {
	path, err := storePath(service)
	if err != nil {
		return nil, err
	}
	data, err := os.ReadFile(path)
	if err != nil {
		if errors.Is(err, os.ErrNotExist) {
			return map[string]string{}, nil
		}
		return nil, err
	}
	decoded, err := decodeBlob(service, data)
	if err != nil {
		return nil, err
	}
	store := map[string]string{}
	for _, line := range strings.Split(string(decoded), "\n") {
		if strings.TrimSpace(line) == "" {
			continue
		}
		parts := strings.SplitN(line, "\t", 2)
		if len(parts) != 2 {
			continue
		}
		store[parts[0]] = parts[1]
	}
	return store, nil
}

func saveStore(service string, store map[string]string) error {
	var lines []string
	for k, v := range store {
		lines = append(lines, k+"\t"+v)
	}
	body := []byte(strings.Join(lines, "\n"))
	blob, err := encodeBlob(service, body)
	if err != nil {
		return err
	}
	path, err := storePath(service)
	if err != nil {
		return err
	}
	if err := os.MkdirAll(filepath.Dir(path), 0o700); err != nil {
		return err
	}
	return os.WriteFile(path, blob, 0o600)
}

func storePath(service string) (string, error) {
	dir, err := storeDir()
	if err != nil {
		return "", err
	}
	return filepath.Join(dir, service+".bin"), nil
}

func encodeBlob(service string, plaintext []byte) ([]byte, error) {
	block, key, err := deriveCipher(service)
	if err != nil {
		return nil, err
	}
	aead, err := cipher.NewGCM(block)
	if err != nil {
		return nil, err
	}
	nonce := make([]byte, aead.NonceSize())
	if _, err := io.ReadFull(rand.Reader, nonce); err != nil {
		return nil, err
	}
	ciphertext := aead.Seal(nil, nonce, plaintext, []byte(key))
	return []byte(base64.StdEncoding.EncodeToString(append(nonce, ciphertext...))), nil
}

func decodeBlob(service string, blob []byte) ([]byte, error) {
	block, key, err := deriveCipher(service)
	if err != nil {
		return nil, err
	}
	aead, err := cipher.NewGCM(block)
	if err != nil {
		return nil, err
	}
	raw, err := base64.StdEncoding.DecodeString(string(blob))
	if err != nil {
		return nil, err
	}
	if len(raw) < aead.NonceSize() {
		return nil, fmt.Errorf("invalid keyring blob")
	}
	nonce := raw[:aead.NonceSize()]
	ciphertext := raw[aead.NonceSize():]
	return aead.Open(nil, nonce, ciphertext, []byte(key))
}

func deriveCipher(service string) (cipher.Block, string, error) {
	master, err := masterKey()
	if err != nil {
		return nil, "", err
	}
	seed := sha256.Sum256([]byte(service + "|" + runtime.GOOS + "|" + runtime.GOARCH))
	key := sha256.Sum256(append(master, seed[:]...))
	block, err := aes.NewCipher(key[:])
	if err != nil {
		return nil, "", err
	}
	return block, string(key[:]), nil
}

func masterKey() ([]byte, error) {
	dir, err := storeDir()
	if err != nil {
		return nil, err
	}
	if err := os.MkdirAll(dir, 0o700); err != nil {
		return nil, err
	}
	path := filepath.Join(dir, "master.key")
	if data, err := os.ReadFile(path); err == nil && len(data) > 0 {
		decoded, derr := base64.StdEncoding.DecodeString(strings.TrimSpace(string(data)))
		if derr == nil {
			return decoded, nil
		}
	}
	key := make([]byte, 32)
	if _, err := io.ReadFull(rand.Reader, key); err != nil {
		return nil, err
	}
	if err := os.WriteFile(path, []byte(base64.StdEncoding.EncodeToString(key)), 0o600); err != nil {
		return nil, err
	}
	return key, nil
}