package docker

import (
	"context"
	"sync"
	"time"
)

// WebhookPayload represents minimal GitHub webhook data we need to enqueue a deployment.
type WebhookPayload struct {
	CommitSHA string
	Branch    string
	Ref       string
}

type projectQueue struct {
	mu      sync.Mutex
	running bool
	pending *WebhookPayload
}

// Queue manages per-project deployment serialization. Only the newest queued payload is kept.
type Queue struct {
	mu     sync.Mutex
	queues map[uint]*projectQueue
}

var DefaultQueue = NewQueue()

func NewQueue() *Queue {
	return &Queue{queues: make(map[uint]*projectQueue)}
}

// Enqueue a GitHub payload for the given project. If multiple enqueues happen while a
// deployment is pending, only the newest payload is retained.
func (q *Queue) Enqueue(projectID uint, payload WebhookPayload) {
	q.mu.Lock()
	pq, ok := q.queues[projectID]
	if !ok {
		pq = &projectQueue{}
		q.queues[projectID] = pq
	}
	pq.mu.Lock()
	pq.pending = &payload
	start := !pq.running
	if start {
		pq.running = true
	}
	pq.mu.Unlock()
	q.mu.Unlock()

	if start {
		go q.run(projectID, pq)
	}
}

func (q *Queue) run(projectID uint, pq *projectQueue) {
	defer func() {
		pq.mu.Lock()
		pq.running = false
		pq.pending = nil
		pq.mu.Unlock()
	}()

	for {
		pq.mu.Lock()
		payload := pq.pending
		pq.pending = nil
		pq.mu.Unlock()

		if payload == nil {
			return
		}

		emitLog(projectID, "queue: starting deployment for commit "+payload.CommitSHA)

		// Build image
		b := NewBuilder()
		ctx, cancel := context.WithTimeout(context.Background(), 30*time.Minute)
		logsCh, _ := b.BuildImage(ctx, projectID, "./", payload.CommitSHA)
		for l := range logsCh {
			emitLog(projectID, l)
		}
		cancel()

		// Deploy
		d := NewDeployer()
		cid, err := d.DeployNewContainer(context.Background(), projectID, "image:tag", 0)
		if err != nil {
			emitLog(projectID, "deploy failed: "+err.Error())
			continue
		}
		emitLog(projectID, "deployed container id="+cid)

		// Healthcheck (stubbed)
		hc := NewHealthChecker()
		ok, logs := hc.Check(context.Background(), "http://127.0.0.1:0", HealthOptions{})
		for _, l := range logs {
			emitLog(projectID, l)
		}
		if !ok {
			emitLog(projectID, "healthcheck failed, attempting rollback")
			_ = NewRollbackManager().Rollback(context.Background(), projectID)
			continue
		}

		// Switch traffic (stub)
		_ = NewProxyManager().SwitchTraffic(context.Background(), projectID, "http://127.0.0.1:0")
		emitLog(projectID, "traffic switched")

		// Cleanup stub
		_ = NewCleanupManager().Cleanup(context.Background(), projectID, 3)

		// After processing, loop to see if a newer pending payload exists.
	}
}
