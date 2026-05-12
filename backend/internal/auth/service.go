package auth

import (
	"errors"
	"strings"
	"time"

	"golang.org/x/crypto/bcrypt"
	"gorm.io/gorm"

	"skyport/internal/access"
	"skyport/internal/config"
	"skyport/internal/models"
)

var (
	ErrInvalidCredentials = errors.New("invalid credentials")
	ErrRegistrationClosed = errors.New("registration closed")
	ErrAccountDisabled    = errors.New("account disabled")
)

type Service struct {
	db         *gorm.DB
	cfg        *config.Config
	jwtSecret  string
	jwtExpires time.Duration
}

func NewService(db *gorm.DB, cfg *config.Config) *Service {
	return &Service{
		db:         db,
		cfg:        cfg,
		jwtSecret:  cfg.JWTSecret,
		jwtExpires: cfg.JWTExpires,
	}
}

func (s *Service) Register(input RegisterRequest) (*AuthResponse, error) {
	var existing int64
	if err := s.db.Model(&models.User{}).Count(&existing).Error; err != nil {
		return nil, err
	}
	if existing > 0 && !s.cfg.OpenRegistration {
		return nil, ErrRegistrationClosed
	}

	email := strings.ToLower(strings.TrimSpace(input.Email))
	name := strings.TrimSpace(input.Name)
	hash, err := bcrypt.GenerateFromPassword([]byte(input.Password), bcrypt.DefaultCost)
	if err != nil {
		return nil, err
	}
	user := &models.User{Email: email, Name: name, PasswordHash: string(hash), Enabled: true}
	if err := s.db.Create(user).Error; err != nil {
		return nil, err
	}

	rbac := access.NewService(s.db)
	role := access.RoleDeveloper
	if strings.TrimSpace(input.Role) != "" {
		role = strings.ToLower(strings.TrimSpace(input.Role))
	} else if existing == 0 {
		role = access.RoleOwner
	}
	if err := rbac.AssignPrimaryRole(user.ID, role); err != nil {
		return nil, err
	}

	_ = s.db.Create(&models.UserActivityLog{
		UserID: user.ID,
		Action: "user.register",
		Target: user.Email,
		Detail: "self-registration",
	}).Error

	return s.issueToken(user)
}

func (s *Service) Login(input LoginRequest, ip, userAgent string) (*AuthResponse, error) {
	email := strings.ToLower(strings.TrimSpace(input.Email))
	var user models.User
	if err := s.db.Where("email = ?", email).First(&user).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, ErrInvalidCredentials
		}
		return nil, err
	}
	if !user.Enabled {
		return nil, ErrAccountDisabled
	}
	if err := bcrypt.CompareHashAndPassword([]byte(user.PasswordHash), []byte(input.Password)); err != nil {
		return nil, ErrInvalidCredentials
	}

	_ = s.db.Create(&models.LoginHistory{
		UserID:    user.ID,
		Success:   true,
		IP:        strings.TrimSpace(ip),
		UserAgent: trimUA(userAgent),
	}).Error

	return s.issueToken(&user)
}

func trimUA(ua string) string {
	if len(ua) <= 512 {
		return ua
	}
	return ua[:512]
}

func (s *Service) Me(userID uint) (*UserDTO, error) {
	var user models.User
	if err := s.db.First(&user, userID).Error; err != nil {
		return nil, err
	}
	dto, err := s.buildUserDTO(&user)
	if err != nil {
		return nil, err
	}
	return &dto, nil
}

func (s *Service) buildUserDTO(u *models.User) (UserDTO, error) {
	rbac := access.NewService(s.db)
	roles, err := rbac.RoleNamesForUser(u.ID)
	if err != nil {
		return UserDTO{}, err
	}
	perms, err := rbac.PermissionsForUser(u.ID)
	if err != nil {
		return UserDTO{}, err
	}
	return UserDTO{
		ID:                 u.ID,
		Name:               u.Name,
		Email:              u.Email,
		Enabled:            u.Enabled,
		AvatarRelativePath: strings.TrimSpace(u.AvatarRelativePath),
		Roles:              roles,
		Permissions:        perms,
	}, nil
}

func (s *Service) issueToken(user *models.User) (*AuthResponse, error) {
	now := time.Now().UTC()
	dto, err := s.buildUserDTO(user)
	if err != nil {
		dto = UserDTO{ID: user.ID, Name: user.Name, Email: user.Email, Enabled: user.Enabled}
	}

	if user.ActiveToken != "" && user.TokenExpiresAt != nil && user.TokenExpiresAt.After(now) {
		if _, err := ParseAccessToken(user.ActiveToken, s.jwtSecret); err == nil {
			dto2, derr := s.buildUserDTO(user)
			if derr == nil {
				dto = dto2
			}
			return &AuthResponse{
				User:         dto,
				AccessToken:  user.ActiveToken,
				TokenType:    "Bearer",
				ExpiresAtUTC: user.TokenExpiresAt.UTC().Format(time.RFC3339),
			}, nil
		}
	}

	raw, expiresAt, err := SignAccessToken(s.jwtSecret, user.ID, user.Email, s.jwtExpires)
	if err != nil {
		return nil, err
	}
	user.ActiveToken = raw
	user.TokenExpiresAt = &expiresAt
	if err := s.db.Model(user).Updates(map[string]any{
		"active_token":     user.ActiveToken,
		"token_expires_at": user.TokenExpiresAt,
	}).Error; err != nil {
		return nil, err
	}

	dto3, derr := s.buildUserDTO(user)
	if derr == nil {
		dto = dto3
	}

	return &AuthResponse{
		User:         dto,
		AccessToken:  raw,
		TokenType:    "Bearer",
		ExpiresAtUTC: expiresAt.Format(time.RFC3339),
	}, nil
}

func (s *Service) Logout(userID uint) error {
	return s.db.Model(&models.User{}).Where("id = ?", userID).Updates(map[string]any{
		"active_token":     "",
		"token_expires_at": nil,
	}).Error
}
