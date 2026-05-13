package ui

import (
	"fmt"
	"io"
	"strings"
	"time"

	"github.com/pterm/pterm"
)

var (
	Accent   = pterm.NewStyle(pterm.FgCyan)
	Success  = pterm.NewStyle(pterm.FgLightGreen)
	Warning  = pterm.NewStyle(pterm.FgLightYellow)
	Danger   = pterm.NewStyle(pterm.FgLightRed)
	Muted    = pterm.NewStyle(pterm.FgGray)
)

func Banner() {
	sky := pterm.NewRGB(126, 196, 232)
	letters := pterm.NewLettersFromStringWithRGB("SkyPort", sky)
	if err := pterm.DefaultBigText.WithLetters(letters).Render(); err != nil {
		fmt.Println(pterm.NewStyle(pterm.FgLightCyan).Sprint("SkyPort"))
	}
	box := pterm.DefaultBox.
		WithTitle("SkyPort").
		WithTitleTopCenter(true).
		WithBoxStyle(pterm.NewStyle(pterm.FgLightCyan)).
		WithTextStyle(pterm.NewStyle(pterm.FgLightCyan))
	_ = box.Println("The Lightweight Developer Cloud OS")
}

func Spinner(text string, fn func() error) error {
	spinner, _ := pterm.DefaultSpinner.Start(text)
	err := fn()
	if err != nil {
		spinner.Fail(err.Error())
		return err
	}
	spinner.Success(text)
	return nil
}

func Infof(format string, args ...any) {
	pterm.Info.Printf(format+"\n", args...)
}

func Successf(format string, args ...any) {
	pterm.Success.Printf(format+"\n", args...)
}

func Warnf(format string, args ...any) {
	pterm.Warning.Printf(format+"\n", args...)
}

func Errorf(format string, args ...any) {
	pterm.Error.Printf(format+"\n", args...)
}

func Table(headers []string, rows [][]string) error {
	data := pterm.TableData{headers}
	data = append(data, rows...)
	return pterm.DefaultTable.WithHasHeader().WithData(data).Render()
}

func Prompt(label string, defaultValue string) (string, error) {
	if defaultValue != "" {
		fmt.Printf("%s [%s]: ", label, defaultValue)
	} else {
		fmt.Printf("%s: ", label)
	}
	var input string
	if _, err := fmt.Scanln(&input); err != nil {
		if err == io.EOF {
			return strings.TrimSpace(defaultValue), nil
		}
		return "", err
	}
	input = strings.TrimSpace(input)
	if input == "" {
		return strings.TrimSpace(defaultValue), nil
	}
	return input, nil
}

func Confirm(label string, defaultValue bool) (bool, error) {
	prompt := "[y/N]"
	if defaultValue {
		prompt = "[Y/n]"
	}
	value, err := Prompt(label+" "+prompt, "")
	if err != nil {
		return false, err
	}
	switch strings.ToLower(strings.TrimSpace(value)) {
	case "y", "yes", "true", "1":
		return true, nil
	case "n", "no", "false", "0":
		return false, nil
	default:
		return defaultValue, nil
	}
}

func HumanDuration(d time.Duration) string {
	if d < time.Second {
		return d.String()
	}
	return d.Round(time.Second).String()
}