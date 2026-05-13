# SkyPort VPS Cluster Management System

A production-ready VPS cluster management system integrated into the SkyPort admin dashboard, enabling secure SSH access to remote servers through a browser-based terminal with comprehensive key encryption and session management.

## Features

### VPS Management
- **Add/Edit/Delete VPS**: Full CRUD operations for managing VPS instances
- **Secure Key Storage**: AES-256 encrypted SSH key storage with SHA256 fingerprinting
- **Multiple Auth Methods**: Support for both SSH key-based and password authentication
- **VPS Status Monitoring**: Real-time status tracking (online/offline/unreachable)
- **Connection Analytics**: Track connection history and usage statistics
- **Tagging & Filtering**: Organize servers with custom tags and advanced filtering
- **Metadata Storage**: Notes, SSH port, username, and host key verification

### SSH Terminal Access
- **Browser-based Terminal**: Real-time SSH terminal using xterm.js
- **WebSocket Streaming**: Secure WebSocket-based session streaming
- **Terminal Resizing**: Dynamic terminal size adjustment
- **Multi-session Support**: Run multiple concurrent SSH sessions
- **Session Management**: Automatic idle timeout and graceful disconnection
- **Terminal Recording**: Download terminal session output
- **Dark Theme**: GitHub-inspired dark terminal theme

### File Preview System
- **Multi-format Support**: Code, text, images, video, audio, PDF, documents
- **Syntax Highlighting**: CodeMirror with extensive language support
- **Lazy Loading**: Virtualized, chunk-based rendering
- **Large File Handling**: Efficient handling of files up to 1GB+
- **MIME Detection**: Automatic format detection
- **Download Support**: Fallback download option for unsupported formats

### Update Notifications
- **GitHub Release Polling**: Automatic checking for new versions
- **Semantic Version Comparison**: Intelligent version comparison
- **Changelog Modal**: Detailed release notes and version information
- **Notification Banner**: Non-intrusive update alerts
- **Dismissible Notifications**: User control over notifications

### Security Features
- **AES-256 Encryption**: Industry-standard encryption for SSH keys
- **Secure Memory Handling**: Automatic wiping of sensitive data
- **Session Isolation**: Per-user session management
- **Key Fingerprinting**: SHA256 fingerprint display for verification
- **No Client-side Exposure**: SSH keys never transmitted to frontend
- **Server-side SSH**: All SSH operations handled server-side
- **HTTPS/WSS Support**: Secure WebSocket connections

## Architecture

### Backend (Go)
```
internal/
├── vps/
│   ├── models.go           # VPS and SSH data models
│   ├── service.go          # VPS business logic
│   ├── crypto.go           # AES-256 encryption utilities
│   ├── ssh_manager.go      # SSH session management
│   └── session_manager.go  # Session lifecycle
├── updates/
│   └── release_checker.go  # GitHub release checking
├── api/
│   ├── vps_handler.go      # VPS REST endpoints
│   └── ssh_terminal_handler.go # WebSocket terminal handler
└── database/
    └── init.go             # Database initialization
```

### Frontend (React + TypeScript)
```
src/
├── components/
│   ├── VPSManagement/
│   │   ├── VPSList.tsx           # VPS table & actions
│   │   ├── VPSAddEditForm.tsx    # Add/Edit form
│   │   ├── SSHTerminal.tsx       # xterm.js terminal
│   │   └── index.ts
│   ├── FilePreview/
│   │   └── FilePreview.tsx       # Multi-format file preview
│   └── Updates/
│       └── UpdateNotification.tsx # Update notifications
├── services/
│   └── api.ts                    # API client layer
├── hooks/
│   └── useVPS.ts                 # Custom React hooks
└── stores/
    └── vpsStore.ts              # Zustand store
```

## Setup & Installation

### Backend Setup

1. **Install Dependencies**:
```bash
cd backend
go mod download
```

2. **Generate Encryption Key**:
```bash
# Generate a secure encryption key
openssl rand -base64 32
```

3. **Configure Environment**:
```bash
cp .env.example .env
# Edit .env and add encryption key:
SKYPORT_ENCRYPTION_KEY=<generated-key>
```

4. **Initialize Database**:
```bash
# Database automatically initializes on first run
go run cmd/server/main.go
```

### Frontend Setup

1. **Install Dependencies**:
```bash
cd frontend
npm install
```

2. **Add shadcn/ui Components**:
```bash
# Install required UI components
npx shadcn-ui@latest add button input label textarea select tabs dialog dropdown-menu table badge skeleton

# Install terminal support
npm install xterm xterm-addon-fit

# Install utilities
npm install date-fns
```

3. **Start Development Server**:
```bash
npm run dev
```

4. **Configure API URL** in `.env`:
```
VITE_API_URL=http://localhost:8080/api/v1
```

## API Endpoints

### VPS Management
- `GET /api/v1/vps` - List all VPS servers
- `POST /api/v1/vps` - Create new VPS
- `GET /api/v1/vps/:id` - Get specific VPS
- `PUT /api/v1/vps/:id` - Update VPS
- `DELETE /api/v1/vps/:id` - Delete VPS
- `POST /api/v1/vps/:id/test` - Test SSH connection

### Terminal
- `GET /api/v1/terminal/:vpsId/ws` - WebSocket SSH terminal

### Updates
- `GET /api/v1/updates/check` - Check for new releases
- `GET /api/v1/updates/latest` - Get latest release info

## Usage Examples

### Creating a VPS with SSH Key
```typescript
const response = await vpsApi.createVPS({
  server_name: "Production Server",
  ip_address: "192.168.1.100",
  ssh_username: "ubuntu",
  ssh_port: 22,
  auth_type: "key",
  ssh_key_content: "-----BEGIN RSA PRIVATE KEY-----...",
  ssh_key_filename: "prod-server.pem",
  tags: ["production", "web"],
  notes: "Main production web server"
});
```

### Testing SSH Connection
```typescript
const result = await vpsApi.testConnection(vpsId);
if (result.data.success) {
  console.log("SSH connection successful");
} else {
  console.error(result.data.message);
}
```

### Opening SSH Terminal
The terminal is automatically available through the WebSocket connection. Simply open the terminal dialog and start typing commands.

## Data Models

### VPSServer
- `id`: Unique identifier
- `server_name`: Display name
- `ip_address`: VPS IP address
- `ssh_username`: SSH username
- `ssh_port`: SSH port (default 22)
- `auth_type`: 'key' or 'password'
- `encrypted_ssh_key`: AES-256 encrypted private key
- `encrypted_password`: AES-256 encrypted password
- `key_fingerprint`: SHA256 fingerprint
- `key_filename`: Original key file name
- `tags`: JSON array of tags
- `notes`: User notes
- `status`: 'online', 'offline', or 'unreachable'
- `last_connection_time`: Last connection timestamp
- `connection_count`: Total connections

### SSHSession
- `id`: Session identifier
- `vps_server_id`: Associated VPS
- `user_id`: Admin user ID
- `session_token`: Unique session token
- `terminal_width`: Terminal width in chars
- `terminal_height`: Terminal height in rows
- `is_active`: Session status
- `connected_at`: Connection timestamp
- `disconnected_at`: Disconnection timestamp
- `bytes_sent`: Data sent count
- `bytes_received`: Data received count

## Encryption Details

### Key Generation
```go
// Generate 256-bit encryption key
key, err := crypto.GenerateEncryptionKey()
// Returns base64-encoded key
```

### SSH Key Encryption
```go
// Encrypt SSH private key
encryptor, err := crypto.NewEncryptor(keyHex)
encrypted, err := encryptor.Encrypt(sshKeyBytes)

// Decrypt for SSH operations
decrypted, err := encryptor.Decrypt(encryptedText)
```

### Fingerprint Generation
```go
// Generate SSH key fingerprint (SHA256)
fingerprint, err := crypto.HashSSHKey(keyContent)
// Returns format: SHA256:base64hash
```

## Security Best Practices

1. **Environment Variables**: Store `SKYPORT_ENCRYPTION_KEY` in secure environment variables
2. **HTTPS/WSS**: Always use HTTPS and WSS (secure WebSocket) in production
3. **Session Timeout**: Configure appropriate SSH session timeouts
4. **Rate Limiting**: Enable rate limiting to prevent brute force attacks
5. **Access Control**: Implement role-based access control (RBAC)
6. **Audit Logging**: Log all SSH connections and administrative actions
7. **Key Rotation**: Regularly rotate encryption keys
8. **Secure Transport**: Never transmit SSH keys over unencrypted connections

## Performance Optimization

- **Connection Pooling**: SSH connection reuse
- **Session Cleanup**: Automatic cleanup of idle sessions
- **Caching**: Release information caching
- **Pagination**: VPS list pagination
- **Lazy Loading**: Terminal and file components
- **Compression**: WebSocket message compression

## Troubleshooting

### SSH Connection Failed
1. Verify SSH server is running: `ssh -T git@<ip> -p <port>`
2. Check firewall rules
3. Verify authentication credentials
4. Check network connectivity

### WebSocket Connection Error
1. Ensure WebSocket support is enabled
2. Check CORS configuration
3. Verify protocol (ws:// vs wss://)
4. Check browser console for errors

### Encryption Issues
1. Verify `SKYPORT_ENCRYPTION_KEY` is set
2. Check key format (must be valid base64)
3. Ensure key length is 128, 192, or 256 bits

## Development

### Running Tests
```bash
# Backend tests
cd backend
go test ./...

# Frontend tests
cd frontend
npm test
```

### Building for Production
```bash
# Backend build
cd backend
go build -o skyport cmd/server/main.go

# Frontend build
cd frontend
npm run build
```

## Future Enhancements

- [ ] Multi-hop SSH (bastion/jump hosts)
- [ ] SSH Key Management API
- [ ] Connection Sharing
- [ ] Command Templates
- [ ] SSH Audit Logging
- [ ] Two-Factor Authentication
- [ ] LDAP/Active Directory Integration
- [ ] Connection Monitoring
- [ ] Bandwidth Monitoring
- [ ] Automatic Health Checks

## Contributing

1. Fork the repository
2. Create a feature branch
3. Commit your changes
4. Push to the branch
5. Create a Pull Request

## License

See LICENSE file in the root directory.

## Support

For issues, questions, or suggestions:
- GitHub Issues: [SkyPort Issues](https://github.com/skyport/skyport/issues)
- Documentation: [SkyPort Docs](https://docs.skyport.app)
- Discord: [SkyPort Community](https://discord.gg/skyport)
