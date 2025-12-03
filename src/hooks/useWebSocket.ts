/**
 * WebSocket 연결 및 실시간 이벤트 처리 훅
 */

import { useEffect, useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'

export type WSEventType =
  | 'connected'
  | 'task:created'
  | 'task:updated'
  | 'task:deleted'
  | 'task:archived'
  | 'change:created'
  | 'change:updated'
  | 'change:synced'
  | 'inbox:updated'

export interface WSEvent {
  type: WSEventType
  payload: unknown
  timestamp: number
}

const WS_URL = 'ws://localhost:3001/ws'
const RECONNECT_INTERVAL = 3000
const MAX_RECONNECT_ATTEMPTS = 10

interface UseWebSocketOptions {
  /** 자동 재연결 활성화 (기본: true) */
  autoReconnect?: boolean
  /** 이벤트 핸들러 */
  onEvent?: (event: WSEvent) => void
  /** 연결 성공 시 콜백 */
  onConnect?: () => void
  /** 연결 종료 시 콜백 */
  onDisconnect?: () => void
}

export function useWebSocket(options: UseWebSocketOptions = {}) {
  const { autoReconnect = true, onEvent, onConnect, onDisconnect } = options
  const [isConnected, setIsConnected] = useState(false)
  const queryClient = useQueryClient()

  // refs로 콜백을 저장하여 useEffect 재실행 방지
  const optionsRef = useRef({ autoReconnect, onEvent, onConnect, onDisconnect })
  optionsRef.current = { autoReconnect, onEvent, onConnect, onDisconnect }

  const wsRef = useRef<WebSocket | null>(null)
  const reconnectAttemptsRef = useRef(0)
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    let isMounted = true

    const connect = () => {
      // 이미 연결 중이거나 연결됨
      if (wsRef.current?.readyState === WebSocket.OPEN ||
          wsRef.current?.readyState === WebSocket.CONNECTING) {
        return
      }

      if (!isMounted) return

      try {
        const ws = new WebSocket(WS_URL)

        ws.onopen = () => {
          if (!isMounted) {
            ws.close()
            return
          }
          console.log('[WebSocket] Connected')
          setIsConnected(true)
          reconnectAttemptsRef.current = 0
          optionsRef.current.onConnect?.()
        }

        ws.onclose = () => {
          if (!isMounted) return

          console.log('[WebSocket] Disconnected')
          setIsConnected(false)
          wsRef.current = null
          optionsRef.current.onDisconnect?.()

          // 자동 재연결
          if (optionsRef.current.autoReconnect &&
              isMounted &&
              reconnectAttemptsRef.current < MAX_RECONNECT_ATTEMPTS) {
            reconnectAttemptsRef.current++
            console.log(`[WebSocket] Reconnecting... (${reconnectAttemptsRef.current}/${MAX_RECONNECT_ATTEMPTS})`)
            reconnectTimeoutRef.current = setTimeout(connect, RECONNECT_INTERVAL)
          }
        }

        ws.onerror = () => {
          // 에러는 onclose에서 처리되므로 여기서는 무시
          // Strict Mode로 인한 early close 에러도 무시
        }

        ws.onmessage = (event) => {
          if (!isMounted) return
          try {
            const data: WSEvent = JSON.parse(event.data)
            optionsRef.current.onEvent?.(data)
            handleEventInvalidation(data, queryClient)
          } catch (error) {
            console.error('[WebSocket] Failed to parse message:', error)
          }
        }

        wsRef.current = ws
      } catch (error) {
        console.error('[WebSocket] Connection failed:', error)
      }
    }

    connect()

    return () => {
      isMounted = false

      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current)
        reconnectTimeoutRef.current = null
      }

      reconnectAttemptsRef.current = MAX_RECONNECT_ATTEMPTS // 재연결 방지

      if (wsRef.current) {
        wsRef.current.close()
        wsRef.current = null
      }
    }
  }, [queryClient]) // queryClient는 stable하므로 한 번만 실행됨

  const connect = () => {
    reconnectAttemptsRef.current = 0
    if (wsRef.current?.readyState !== WebSocket.OPEN &&
        wsRef.current?.readyState !== WebSocket.CONNECTING) {
      // 기존 연결이 없으면 새로 연결
      const ws = new WebSocket(WS_URL)
      ws.onopen = () => {
        setIsConnected(true)
        optionsRef.current.onConnect?.()
      }
      ws.onclose = () => {
        setIsConnected(false)
        optionsRef.current.onDisconnect?.()
      }
      ws.onmessage = (event) => {
        try {
          const data: WSEvent = JSON.parse(event.data)
          optionsRef.current.onEvent?.(data)
          handleEventInvalidation(data, queryClient)
        } catch (error) {
          console.error('[WebSocket] Failed to parse message:', error)
        }
      }
      wsRef.current = ws
    }
  }

  const disconnect = () => {
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current)
      reconnectTimeoutRef.current = null
    }
    reconnectAttemptsRef.current = MAX_RECONNECT_ATTEMPTS
    if (wsRef.current) {
      wsRef.current.close()
      wsRef.current = null
    }
    setIsConnected(false)
  }

  return {
    isConnected,
    connect,
    disconnect
  }
}

/**
 * 이벤트 타입에 따라 React Query 캐시 무효화
 */
function handleEventInvalidation(event: WSEvent, queryClient: ReturnType<typeof useQueryClient>) {
  switch (event.type) {
    case 'task:created':
    case 'task:updated':
    case 'task:deleted':
    case 'task:archived':
      // 태스크 관련 쿼리 무효화
      queryClient.invalidateQueries({ queryKey: ['flow', 'tasks'] })
      queryClient.invalidateQueries({ queryKey: ['flow', 'changes'] })
      queryClient.invalidateQueries({ queryKey: ['kanban'] })
      break

    case 'change:created':
    case 'change:updated':
    case 'change:synced':
      // Change 관련 쿼리 무효화
      queryClient.invalidateQueries({ queryKey: ['flow', 'changes'] })
      queryClient.invalidateQueries({ queryKey: ['flow', 'tasks'] })
      queryClient.invalidateQueries({ queryKey: ['projects'] })
      break

    case 'inbox:updated':
      // Inbox 쿼리 무효화
      queryClient.invalidateQueries({ queryKey: ['flow', 'tasks'] })
      queryClient.invalidateQueries({ queryKey: ['kanban'] })
      break

    case 'connected':
      // 연결 시 전체 데이터 새로고침
      queryClient.invalidateQueries({ queryKey: ['flow'] })
      queryClient.invalidateQueries({ queryKey: ['projects'] })
      break
  }
}

/**
 * WebSocket 상태만 구독하는 가벼운 훅
 */
export function useWebSocketStatus() {
  const [isConnected, setIsConnected] = useState(false)

  useEffect(() => {
    let isMounted = true
    const ws = new WebSocket(WS_URL)

    ws.onopen = () => {
      if (isMounted) setIsConnected(true)
    }
    ws.onclose = () => {
      if (isMounted) setIsConnected(false)
    }
    ws.onerror = () => {
      // 에러는 onclose에서 처리
    }

    return () => {
      isMounted = false
      ws.close()
    }
  }, [])

  return isConnected
}
