package daemon

import (
	"bufio"
	"context"
	"io"
	"os"
	"time"
)

func (m *Manager) TailLogs(ctx context.Context, out io.Writer) error {
	file, err := os.Open(m.logPath)
	if err != nil {
		return err
	}
	defer file.Close()

	if _, err := file.Seek(0, io.SeekEnd); err != nil {
		return err
	}

	reader := bufio.NewReader(file)
	for {
		line, err := reader.ReadString('\n')
		if len(line) > 0 {
			if _, writeErr := io.WriteString(out, line); writeErr != nil {
				return writeErr
			}
		}
		if err == nil {
			continue
		}
		if err != io.EOF {
			return err
		}

		select {
		case <-ctx.Done():
			return ctx.Err()
		case <-time.After(500 * time.Millisecond):
		}

		info, statErr := file.Stat()
		if statErr != nil {
			return statErr
		}
		current, seekErr := file.Seek(0, io.SeekCurrent)
		if seekErr != nil {
			return seekErr
		}
		if info.Size() < current {
			if err := file.Close(); err != nil {
				return err
			}
			file, err = os.Open(m.logPath)
			if err != nil {
				return err
			}
			reader = bufio.NewReader(file)
		}
	}
}
