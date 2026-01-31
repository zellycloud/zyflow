/**
 * WebSocket 서버 모듈
 * 실시간 데이터 업데이트를 클라이언트에 푸시
 */

import { WebSocketServer, WebSocket } from 'ws'
import type { Server } from 'http'

export type WSEventType =
  | 'task:created'
  | 'task:updated'
  | 'task:deleted'
  | 'task:archived'
  | 'change:created'
  | 'change:updated'
  | 'change:synced'
  | 'change:archived'
  | 'spec:updated'
  | 'sync:completed'
  | 'inbox:updated'
  | 'backlog:synced'
  | 'backlog:task:created'
  | 'backlog:task:updated'
  | 'backlog:task:deleted'

export interface WSEvent {
  type: WSEventType
  payload: unknown
  timestamp: number
}

let wss: WebSocketServer | null = null

/**
 * WebSocket 서버 초기화
 */
export function initWebSocket(server: Server): WebSocketServer {
  wss = new WebSocketServer({ server, path: '/ws' })

  wss.on('connection', (ws) => {
    console.log('[WebSocket] Client connected')

    ws.on('close', () => {
      console.log('[WebSocket] Client disconnected')
    })

    ws.on('error', (error) => {
      console.error('[WebSocket] Error:', error)
    })

    // 연결 확인 메시지
    ws.send(
      JSON.stringify({
        type: 'connected',
        payload: { message: 'WebSocket connected' },
        timestamp: Date.now(),
      })
    )
  })

  console.log('[WebSocket] Server initialized on /ws')
  return wss
}

/**
 * 모든 연결된 클라이언트에 이벤트 브로드캐스트
 */
export function broadcast(event: WSEvent): void {
  if (!wss) {
    console.warn('[WebSocket] Server not initialized')
    return
  }

  const message = JSON.stringify(event)

  wss.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(message)
    }
  })
}

/**
 * 특정 이벤트 타입으로 브로드캐스트
 */
export function emit(type: WSEventType, payload: unknown): void {
  broadcast({
    type,
    payload,
    timestamp: Date.now(),
  })
}

/**
 * WebSocket 서버 인스턴스 반환
 */
export function getWebSocketServer(): WebSocketServer | null {
  return wss
}
