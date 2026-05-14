package ssh

import (
	"context"
	"fmt"
	"io"
	"net"
	"os"
	"path/filepath"
	"time"

	"golang.org/x/crypto/ssh"
	"golang.org/x/crypto/ssh/agent"
	"golang.org/x/crypto/ssh/knownhosts"
)

// AuthMethod represents SSH authentication method
type AuthMethod string

const (
	AuthKeyAgent AuthMethod = "agent"
	AuthKeyFile  AuthMethod = "key_file"
	AuthPassword AuthMethod = "password"
)

// Config represents SSH connection configuration
type Config struct {
	Host       string        `yaml:"host"`
	Port       int           `yaml:"port"`
	User       string        `yaml:"user"`
	AuthMethod AuthMethod    `yaml:"auth_method"`
	KeyFile    string        `yaml:"key_file,omitempty"`
	Password   string        `yaml:"password,omitempty"`
	Timeout    time.Duration `yaml:"timeout,omitempty"`
	StrictHost bool          `yaml:"strict_host,omitempty"`
}

// Client represents an SSH client
type Client struct {
	config    *Config
	client    *ssh.Client
	connected bool
}

// ExecuteResult represents the result of command execution
type ExecuteResult struct {
	Stdout   string
	Stderr   string
	ExitCode int
	Error    error
}

// New creates a new SSH client
func New(config *Config) *Client {
	if config.Port == 0 {
		config.Port = 22
	}
	if config.Timeout == 0 {
		config.Timeout = 30 * time.Second
	}
	return &Client{config: config}
}

// Connect establishes SSH connection
func (c *Client) Connect(ctx context.Context) error {
	auth, err := c.getAuthMethods()
	if err != nil {
		return fmt.Errorf("failed to prepare auth: %w", err)
	}

	sshConfig := &ssh.ClientConfig{
		User:    c.config.User,
		Auth:    auth,
		Timeout: c.config.Timeout,
	}

	// Add host key verification
	if c.config.StrictHost {
		hostKeyCallback, err := knownhosts.New(filepath.Join(os.ExpandEnv("$HOME"), ".ssh", "known_hosts"))
		if err != nil {
			// If known_hosts doesn't exist, accept any key
			sshConfig.HostKeyCallback = ssh.InsecureIgnoreHostKey()
		} else {
			sshConfig.HostKeyCallback = hostKeyCallback
		}
	} else {
		sshConfig.HostKeyCallback = ssh.InsecureIgnoreHostKey()
	}

	addr := fmt.Sprintf("%s:%d", c.config.Host, c.config.Port)
	client, err := ssh.Dial("tcp", addr, sshConfig)
	if err != nil {
		return fmt.Errorf("failed to connect to %s: %w", addr, err)
	}

	c.client = client
	c.connected = true
	return nil
}

// Close closes the SSH connection
func (c *Client) Close() error {
	if c.client != nil {
		return c.client.Close()
	}
	return nil
}

// Execute executes a command on the remote host
func (c *Client) Execute(ctx context.Context, command string) (*ExecuteResult, error) {
	if !c.connected {
		if err := c.Connect(ctx); err != nil {
			return nil, err
		}
	}

	session, err := c.client.NewSession()
	if err != nil {
		return nil, fmt.Errorf("failed to create session: %w", err)
	}
	defer session.Close()

	outPipe, err := session.StdoutPipe()
	if err != nil {
		return nil, err
	}
	errPipe, err := session.StderrPipe()
	if err != nil {
		return nil, err
	}

	err = session.Run(command)
	outBytes := readAll(outPipe)
	errBytes := readAll(errPipe)

	exitCode := 0
	if err != nil {
		if exitErr, ok := err.(*ssh.ExitError); ok {
			exitCode = exitErr.ExitStatus()
		}
	}

	return &ExecuteResult{
		Stdout:   string(outBytes),
		Stderr:   string(errBytes),
		ExitCode: exitCode,
		Error:    err,
	}, nil
}

// ExecuteInteractive executes a command with interactive shell
func (c *Client) ExecuteInteractive(ctx context.Context) error {
	if !c.connected {
		if err := c.Connect(ctx); err != nil {
			return err
		}
	}

	session, err := c.client.NewSession()
	if err != nil {
		return fmt.Errorf("failed to create session: %w", err)
	}
	defer session.Close()

	session.Stdout = os.Stdout
	session.Stderr = os.Stderr
	session.Stdin = os.Stdin

	// Request pseudo-terminal
	if err := session.RequestPty("xterm", 24, 80, ssh.TerminalModes{
		ssh.ECHO:          1,
		ssh.TTY_OP_ISPEED: 14400,
		ssh.TTY_OP_OSPEED: 14400,
	}); err != nil {
		return err
	}

	return session.Shell()
}

// Copy copies a file to the remote host
func (c *Client) Copy(ctx context.Context, localPath, remotePath string) error {
	if !c.connected {
		if err := c.Connect(ctx); err != nil {
			return err
		}
	}

	file, err := os.Open(localPath)
	if err != nil {
		return fmt.Errorf("failed to open local file: %w", err)
	}
	defer file.Close()

	session, err := c.client.NewSession()
	if err != nil {
		return fmt.Errorf("failed to create session: %w", err)
	}
	defer session.Close()

	// Use scp to copy file
	command := fmt.Sprintf("cat > %s", remotePath)
	stdin, err := session.StdinPipe()
	if err != nil {
		return err
	}

	if err := session.Start(command); err != nil {
		return err
	}

	if _, err := io.Copy(stdin, file); err != nil {
		return err
	}

	stdin.Close()
	return session.Wait()
}

// GetFile copies a file from the remote host
func (c *Client) GetFile(ctx context.Context, remotePath, localPath string) error {
	if !c.connected {
		if err := c.Connect(ctx); err != nil {
			return err
		}
	}

	result, err := c.Execute(ctx, fmt.Sprintf("cat %s", remotePath))
	if err != nil {
		return err
	}

	if result.Error != nil {
		return fmt.Errorf("remote error: %s", result.Stderr)
	}

	return os.WriteFile(localPath, []byte(result.Stdout), 0o600)
}

// Ping checks connectivity
func (c *Client) Ping(ctx context.Context) error {
	result, err := c.Execute(ctx, "echo OK")
	if err != nil {
		return err
	}
	if result.ExitCode != 0 {
		return fmt.Errorf("ping failed with exit code %d", result.ExitCode)
	}
	return nil
}

// GetRemoteInfo returns information about the remote system
func (c *Client) GetRemoteInfo(ctx context.Context) (map[string]string, error) {
	info := make(map[string]string)

	commands := map[string]string{
		"hostname": "hostname",
		"os":       "uname -s",
		"arch":     "uname -m",
		"kernel":   "uname -r",
		"uptime":   "uptime",
		"pwd":      "pwd",
	}

	for key, cmd := range commands {
		result, err := c.Execute(ctx, cmd)
		if err == nil && result.ExitCode == 0 {
			info[key] = result.Stdout
		}
	}

	return info, nil
}

func (c *Client) getAuthMethods() ([]ssh.AuthMethod, error) {
	var methods []ssh.AuthMethod

	// Try agent first
	if authSock := os.Getenv("SSH_AUTH_SOCK"); authSock != "" {
		conn, err := net.Dial("unix", authSock)
		if err == nil {
			defer conn.Close()
			ag := agent.NewClient(conn)
			signers, err := ag.Signers()
			if err == nil {
				methods = append(methods, ssh.PublicKeys(signers...))
			}
		}
	}

	// Try key file
	if c.config.KeyFile != "" {
		keyPath := os.ExpandEnv(c.config.KeyFile)
		key, err := os.ReadFile(keyPath)
		if err == nil {
			signer, err := ssh.ParsePrivateKey(key)
			if err == nil {
				methods = append(methods, ssh.PublicKeys(signer))
			}
		}
	}

	// Try password
	if c.config.Password != "" {
		methods = append(methods, ssh.Password(c.config.Password))
	}

	if len(methods) == 0 {
		return nil, fmt.Errorf("no auth methods available")
	}

	return methods, nil
}

func readAll(r io.Reader) []byte {
	var buf []byte
	b := make([]byte, 1024)
	for {
		n, err := r.Read(b)
		if n > 0 {
			buf = append(buf, b[:n]...)
		}
		if err != nil {
			break
		}
	}
	return buf
}
