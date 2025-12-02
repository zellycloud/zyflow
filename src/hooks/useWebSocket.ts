/**
 * WebSocket 연결 및 실시간 이벤트 처리 훅
 */

import { useEffect, useRef, useCallback, useState } from 'react'
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
  const wsRef = useRef<WebSocket | null>(null)
  const reconnectAttempts = useRef(0)
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  const [isConnected, setIsConnected] = useState(false)
  const queryClient = useQueryClient()

  const connect = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      return
    }

    try {
      const ws = new WebSocket(WS_URL)

      ws.onopen = () => {
        console.log('[WebSocket] Connected')
        setIsConnected(true)
        reconnectAttempts.current = 0
        onConnect?.()
      }

      ws.onclose = () => {
        console.log('[WebSocket] Disconnected')
        setIsConnected(false)
        wsRef.current = null
        onDisconnect?.()

        // 자동 재연결
        if (autoReconnect && reconnectAttempts.current < MAX_RECONNECT_ATTEMPTS) {
          reconnectAttempts.current++
          console.log(`[WebSocket] Reconnecting... (${reconnectAttempts.current}/${MAX_RECONNECT_ATTEMPTS})`)
          reconnectTimeoutRef.current = setTimeout(connect, RECONNECT_INTERVAL)
        }
      }

      ws.onerror = (error) => {
        console.error('[WebSocket] Error:', error)
      }

      ws.onmessage = (event) => {
        try {
          const data: WSEvent = JSON.parse(event.data)

          // 커스텀 이벤트 핸들러 호출
          onEvent?.(data)

          // 이벤트 타입에 따라 React Query 캐시 무효화
          handleEventInvalidation(data, queryClient)
        } catch (error) {
          console.error('[WebSocket] Failed to parse message:', error)
        }
      }

      wsRef.current = ws
    } catch (error) {
      console.error('[WebSocket] Connection failed:', error)
    }
  }, [autoReconnect, onConnect, onDisconnect, onEvent, queryClient])

  const disconnect = useCallback(() => {
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current)
      reconnectTimeoutRef.current = null
    }
    reconnectAttempts.current = MAX_RECONNECT_ATTEMPTS // 재연결 방지
    wsRef.current?.close()
    wsRef.current = null
    setIsConnected(false)
  }, [])

  // 컴포넌트 마운트 시 연결, 언마운트 시 해제
  useEffect(() => {
    connect()
    return () => {
      disconnect()
    }
  }, [connect, disconnect])

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
    const ws = new WebSocket(WS_URL)

    ws.onopen = () => setIsConnected(true)
    ws.onclose = () => setIsConnected(false)
    ws.onerror = () => setIsConnected(false)

    return () => ws.close()
  }, [])

  return isConnected
}
