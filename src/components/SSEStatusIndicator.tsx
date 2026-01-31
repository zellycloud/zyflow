/**
 * SSE Status Indicator Component
 *
 * Displays real-time SSE connection status in the header
 * Shows connection state with visual indicators
 *
 * @module components/SSEStatusIndicator
 */

import { useSSEStatus } from '@/hooks/useSSEConnection'
import { useSSEStore, selectConnectionStatus, selectReconnectAttempt, selectMaxReconnectAttempts } from '@/stores/sseStore'
import { Wifi, WifiOff, AlertCircle, RotateCw } from 'lucide-react'

// =============================================
// Component
// =============================================

export function SSEStatusIndicator() {
  const status = useSSEStore(selectConnectionStatus)
  const reconnectAttempt = useSSEStore(selectReconnectAttempt)
  const maxReconnectAttempts = useSSEStore(selectMaxReconnectAttempts)
  const connectionInfo = useSSEStore((state) => state.connection)

  // Determine display properties
  const isConnected = status === 'connected'
  const isConnecting = status === 'connecting'
  const isReconnecting = status === 'reconnecting'
  const isFailed = status === 'failed'
  const isDisconnected = status === 'disconnected'

  // Color and icon based on status
  const getStatusDisplay = () => {
    if (isConnected) {
      return {
        bgColor: 'bg-green-100',
        textColor: 'text-green-700',
        borderColor: 'border-green-300',
        icon: <Wifi className="w-4 h-4" />,
        label: 'Connected',
        tooltip: 'SSE connection is active',
      }
    }

    if (isConnecting) {
      return {
        bgColor: 'bg-blue-100',
        textColor: 'text-blue-700',
        borderColor: 'border-blue-300',
        icon: <RotateCw className="w-4 h-4 animate-spin" />,
        label: 'Connecting',
        tooltip: 'Establishing SSE connection...',
      }
    }

    if (isReconnecting) {
      return {
        bgColor: 'bg-yellow-100',
        textColor: 'text-yellow-700',
        borderColor: 'border-yellow-300',
        icon: <RotateCw className="w-4 h-4 animate-spin" />,
        label: `Reconnecting (${reconnectAttempt}/${maxReconnectAttempts})`,
        tooltip: `Reconnecting... Attempt ${reconnectAttempt} of ${maxReconnectAttempts}`,
      }
    }

    if (isFailed) {
      return {
        bgColor: 'bg-red-100',
        textColor: 'text-red-700',
        borderColor: 'border-red-300',
        icon: <AlertCircle className="w-4 h-4" />,
        label: 'Connection Failed',
        tooltip: `Failed to connect: ${connectionInfo.lastError || 'Unknown error'}`,
      }
    }

    // Disconnected
    return {
      bgColor: 'bg-gray-100',
      textColor: 'text-gray-600',
      borderColor: 'border-gray-300',
      icon: <WifiOff className="w-4 h-4" />,
      label: 'Disconnected',
      tooltip: 'SSE connection is inactive',
    }
  }

  const display = getStatusDisplay()

  return (
    <div
      className={`flex items-center gap-2 px-3 py-1.5 rounded border ${display.bgColor} ${display.borderColor} ${display.textColor} text-sm font-medium transition-all`}
      title={display.tooltip}
    >
      <span className="flex-shrink-0">{display.icon}</span>
      <span className="hidden sm:inline flex-shrink-0">{display.label}</span>

      {/* Compact version for mobile */}
      {isConnected && (
        <span className="sm:hidden flex-shrink-0 w-2 h-2 rounded-full bg-green-600" />
      )}
      {isReconnecting && (
        <span className="sm:hidden flex-shrink-0 text-xs">
          {reconnectAttempt}/{maxReconnectAttempts}
        </span>
      )}
      {isFailed && (
        <span className="sm:hidden flex-shrink-0 w-2 h-2 rounded-full bg-red-600" />
      )}
      {isDisconnected && (
        <span className="sm:hidden flex-shrink-0 w-2 h-2 rounded-full bg-gray-400" />
      )}
    </div>
  )
}

// =============================================
// Detailed Status Component (for debugging)
// =============================================

export function SSEStatusDetailed() {
  const connectionInfo = useSSEStore((state) => state.connection)
  const queuedEventsCount = useSSEStore((state) => state.queuedEvents.length)

  return (
    <div className="space-y-2 rounded border border-gray-200 bg-white p-3 text-xs">
      <div>
        <span className="font-semibold">Status:</span> {connectionInfo.status}
      </div>

      <div>
        <span className="font-semibold">Reconnect Attempt:</span>{' '}
        {connectionInfo.reconnectAttempt}/{connectionInfo.maxReconnectAttempts}
      </div>

      {connectionInfo.lastConnectionTime && (
        <div>
          <span className="font-semibold">Last Connected:</span>{' '}
          {new Date(connectionInfo.lastConnectionTime).toLocaleTimeString()}
        </div>
      )}

      {connectionInfo.lastDisconnectionTime && (
        <div>
          <span className="font-semibold">Last Disconnected:</span>{' '}
          {new Date(connectionInfo.lastDisconnectionTime).toLocaleTimeString()}
        </div>
      )}

      {connectionInfo.lastError && (
        <div>
          <span className="font-semibold">Last Error:</span> {connectionInfo.lastError}
        </div>
      )}

      {connectionInfo.nextRetryIn && (
        <div>
          <span className="font-semibold">Next Retry In:</span>{' '}
          {(connectionInfo.nextRetryIn / 1000).toFixed(1)}s
        </div>
      )}

      {queuedEventsCount > 0 && (
        <div className="text-yellow-600">
          <span className="font-semibold">Queued Events:</span> {queuedEventsCount}
        </div>
      )}
    </div>
  )
}

// =============================================
// Minimal Dot Indicator (for header)
// =============================================

export function SSEStatusDot() {
  const status = useSSEStore(selectConnectionStatus)

  let bgColor = 'bg-gray-400'

  if (status === 'connected') {
    bgColor = 'bg-green-500'
  } else if (status === 'connecting' || status === 'reconnecting') {
    bgColor = 'bg-yellow-500 animate-pulse'
  } else if (status === 'failed') {
    bgColor = 'bg-red-500'
  }

  return (
    <div className={`w-2 h-2 rounded-full ${bgColor}`} title={`SSE Status: ${status}`} />
  )
}

export default SSEStatusIndicator
