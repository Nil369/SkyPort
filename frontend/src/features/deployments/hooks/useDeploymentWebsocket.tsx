import { useEffect, useRef } from 'react'
import { useDeploymentsStore } from '../stores/useDeploymentsStore'

export function useDeploymentWebsocket(deploymentId?: number) {
  const wsRef = useRef<WebSocket | null>(null)
  const appendLog = useDeploymentsStore((s) => s.appendLog)
  useEffect(() => {
    if (!deploymentId) return
    let cancelled = false

    const token = localStorage.getItem('token')
    const baseUrl = `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws/deployments/${deploymentId}/logs` + (token ? `?token=${token}` : '')

    const connect = () => {
      if (cancelled) return
      try {
        const ws = new WebSocket(baseUrl, ['jwt'])
        wsRef.current = ws
        ws.onmessage = (ev) => {
          appendLog(deploymentId, String(ev.data))
        }
        ws.onclose = () => {
          wsRef.current = null
          if (cancelled) return
          // attempt reconnect after delay
          setTimeout(() => connect(), 2000)
        }
        ws.onerror = () => {
          // close and let onclose trigger reconnect
          try { ws.close() } catch {}
        }
      } catch (e) {
        // schedule reconnect
        setTimeout(() => connect(), 2000)
      }
    }

    connect()

    return () => {
      cancelled = true
      try { wsRef.current?.close() } catch {}
      wsRef.current = null
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deploymentId])
}
