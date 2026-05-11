package auth

type RegisterRequest struct {
	Name     string `json:"name" validate:"required,min=2,max=120"`
	Email    string `json:"email" validate:"required,email,max=255"`
	Password string `json:"password" validate:"required,min=8,max=128"`
}

type LoginRequest struct {
	Email    string `json:"email" validate:"required,email,max=255"`
	Password string `json:"password" validate:"required,min=8,max=128"`
}

type UserDTO struct {
	ID    uint   `json:"id"`
	Name  string `json:"name"`
	Email string `json:"email"`
}

type CredentialsDTO struct {
	GitAuthType string `json:"git_auth_type"`
	HasPAT      bool   `json:"has_pat"`
	HasSSHKey   bool   `json:"has_ssh_key"`
}

type UpdateCredentialsRequest struct {
	GitAuthType string `json:"git_auth_type" validate:"omitempty,oneof=ssh pat"`
	GitPAT      string `json:"git_pat" validate:"omitempty,max=4096"`
	GitSSHKey   string `json:"git_ssh_key" validate:"omitempty,max=4096"`
	ClearPAT    bool   `json:"clear_pat"`
	ClearSSHKey bool   `json:"clear_ssh_key"`
}

type AuthResponse struct {
	User         UserDTO `json:"user"`
	AccessToken  string  `json:"access_token"`
	TokenType    string  `json:"token_type"`
	ExpiresAtUTC string  `json:"expires_at"`
	// Future-ready placeholder; currently not issued.
	RefreshToken string `json:"refresh_token,omitempty"`
}
