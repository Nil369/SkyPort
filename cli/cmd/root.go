package cmd

import (
	"context"
	"fmt"
	"os"
	"strings"
	"sync"
	"time"

	"github.com/spf13/cobra"
	"github.com/spf13/viper"

	"skyport-cli/internal/api"
	"skyport-cli/internal/store"
	"skyport-cli/internal/ui"
	"skyport-cli/internal/version"
)

type appKey struct{}

type App struct {
	Store       *store.Store
	Config      *store.Config
	Profile     store.ServerProfile
	Token       string
	Client      *api.Client
	ConfigPath  string
	ProfileName string
}

const defaultTimeout = 30 * time.Second

var (
	configPath string
	serverName string
	outputMode string
	bannerOnce sync.Once
	rootCmd    = &cobra.Command{
		Use:     "skyport",
		Short:   "SkyPort cloud platform CLI",
		Version: fmt.Sprintf("%s (%s)", version.Version, version.Commit),
		Run: func(cmd *cobra.Command, args []string) {
			bannerOnce.Do(ui.Banner)
			_ = cmd.Help()
		},
		PersistentPreRunE: func(cmd *cobra.Command, args []string) error {
			if cmd != nil && cmd.Parent() == nil {
				bannerOnce.Do(ui.Banner)
			}
			return initialize(cmd)
		},
	}
)

func Execute() error {
	return rootCmd.Execute()
}

func init() {
	cobra.OnInitialize(func() {
		viper.SetEnvPrefix("SKYPORT")
		viper.SetEnvKeyReplacer(strings.NewReplacer("-", "_"))
		viper.AutomaticEnv()
	})

	rootCmd.PersistentFlags().StringVar(&configPath, "config", "", "config file path")
	rootCmd.PersistentFlags().StringVar(&serverName, "server", "", "server profile name or id")
	rootCmd.PersistentFlags().StringVar(&outputMode, "output", "table", "output format (table|json)")

	rootCmd.AddCommand(newLoginCommand())
	rootCmd.AddCommand(newLogoutCommand())
	rootCmd.AddCommand(newWhoAmICommand())
	rootCmd.AddCommand(newServerCommand())
	rootCmd.AddCommand(newDeployCommand())
	rootCmd.AddCommand(newRollbackCommand())
	rootCmd.AddCommand(newRestartCommand())
	rootCmd.AddCommand(newLogsCommand())
	rootCmd.AddCommand(newStatusCommand())
	rootCmd.AddCommand(newStopCommand())
	rootCmd.AddCommand(newDockerCommand())
	rootCmd.AddCommand(newFilesCommand())
	rootCmd.AddCommand(newMarketplaceCommand())
	rootCmd.AddCommand(newProjectCommand())
	rootCmd.AddCommand(newPM2Command())
	rootCmd.AddCommand(newStartCommand())
	rootCmd.AddCommand(newServiceCommand())
}

func initialize(cmd *cobra.Command) error {
	if cmd == nil {
		return nil
	}
	if configPath == "" {
		configPath = viper.GetString("config")
	}
	if configPath == "" {
		configPath = os.Getenv("SKYPORT_CLI_CONFIG")
	}
	if serverName == "" {
		serverName = viper.GetString("server")
	}
	if serverName == "" {
		serverName = os.Getenv("SKYPORT_SERVER")
	}
	if outputMode == "table" {
		if v := strings.TrimSpace(viper.GetString("output")); v != "" {
			outputMode = v
		}
	}
	if env := strings.TrimSpace(os.Getenv("SKYPORT_OUTPUT")); env != "" {
		outputMode = env
	}
	if strings.TrimSpace(configPath) == "" {
		if home, err := store.DefaultConfigPath(); err == nil {
			configPath = home
		}
	}
	appStore, err := store.New(configPath)
	if err != nil {
		return err
	}
	profile := store.ServerProfile{}
	if selected := strings.TrimSpace(serverName); selected != "" {
		if p, ok := appStore.ResolveServer(selected); ok {
			profile = p
		} else if active, ok := appStore.ActiveServer(); ok {
			profile = active
		}
	} else if active, ok := appStore.ActiveServer(); ok {
		profile = active
	}
	app := &App{Store: appStore, Config: appStore.Config(), Profile: profile, ConfigPath: configPath, ProfileName: serverName}
	if profile.ID != "" {
		if token := strings.TrimSpace(os.Getenv("SKYPORT_TOKEN")); token != "" {
			app.Token = token
		} else if token, err := appStore.Token(profile.ID); err == nil {
			app.Token = token
		}
		app.Client = api.New(profile.BaseURL, app.Token)
	}
	cmd.SetContext(context.WithValue(cmd.Context(), appKey{}, app))
	return nil
}

func currentApp(cmd *cobra.Command) (*App, error) {
	if cmd == nil {
		return nil, fmt.Errorf("command context unavailable")
	}
	app, _ := cmd.Context().Value(appKey{}).(*App)
	if app == nil {
		return nil, fmt.Errorf("application state not initialized")
	}
	return app, nil
}

func requireClient(cmd *cobra.Command) (*App, error) {
	app, err := currentApp(cmd)
	if err != nil {
		return nil, err
	}
	if app.Client == nil {
		return nil, fmt.Errorf("no active server profile; run `skyport server add` first")
	}
	return app, nil
}

func outputFormat() string {
	mode := strings.ToLower(strings.TrimSpace(outputMode))
	if mode == "" {
		return "table"
	}
	return mode
}
