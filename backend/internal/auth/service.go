package auth

import (
	"errors"
	"strings"
	"time"

	"golang.org/x/crypto/bcrypt"
	"gorm.io/gorm"

	"skyport/internal/models"
)

var ErrInvalidCredentials = errors.New("invalid credentials")

type Service struct {
	db         *gorm.DB
	jwtSecret  string
	jwtExpires time.Duration
}

func NewService(db *gorm.DB, jwtSecret string, jwtExpires time.Duration) *Service {
	return &Service{db: db, jwtSecret: jwtSecret, jwtExpires: jwtExpires}
}

func (s *Service) Register(input RegisterRequest) (*AuthResponse, error) {
	email := strings.ToLower(strings.TrimSpace(input.Email))
	name := strings.TrimSpace(input.Name)
	hash, err := bcrypt.GenerateFromPassword([]byte(input.Password), bcrypt.DefaultCost)
	if err != nil {
		return nil, err
	}
	user := &models.User{Email: email, Name: name, PasswordHash: string(hash)}
	if err := s.db.Create(user).Error; err != nil {
		return nil, err
	}
	return s.issueToken(user)
}

func (s *Service) Login(input LoginRequest) (*AuthResponse, error) {
	email := strings.ToLower(strings.TrimSpace(input.Email))
	var user models.User
	if err := s.db.Where("email = ?", email).First(&user).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, ErrInvalidCredentials
		}
		return nil, err
	}
	if err := bcrypt.CompareHashAndPassword([]byte(user.PasswordHash), []byte(input.Password)); err != nil {
		return nil, ErrInvalidCredentials
	}
	return s.issueToken(&user)
}

func (s *Service) Me(userID uint) (*UserDTO, error) {
	var user models.User
	if err := s.db.First(&user, userID).Error; err != nil {
		return nil, err
	}
	return &UserDTO{ID: user.ID, Name: user.Name, Email: user.Email}, nil
}

func (s *Service) issueToken(user *models.User) (*AuthResponse, error) {
	raw, expiresAt, err := SignAccessToken(s.jwtSecret, user.ID, user.Email, s.jwtExpires)
	if err != nil {
		return nil, err
	}
	return &AuthResponse{
		User:         UserDTO{ID: user.ID, Name: user.Name, Email: user.Email},
		AccessToken:  raw,
		TokenType:    "Bearer",
		ExpiresAtUTC: expiresAt.Format(time.RFC3339),
	}, nil
}
