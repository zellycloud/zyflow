/**
 * Offline Mode Banner Component
 *
 * Displays offline status and pending operations
 * Shows automatic sync progress and manual reconnect button
 *
 * @module components/OfflineModeBanner
 */

import { useEffect, useState } from 'react'
import { useNetworkStatus } from '@/hooks/useNetworkStatus'
import { useOfflineStore, selectIsOffline, selectQueueLength, selectIsSyncing, selectSyncProgress } from '@/stores/offlineStore'
import { getOfflineQueueManager } from '@/api/offline-queue'
import { AlertCircle, Wifi, WifiOff, RefreshCw, Check } from 'lucide-react'

// =============================================
// Component
// =============================================

export function OfflineModeBanner() {
  const isOffline = useOfflineStore(selectIsOffline)
  const queueLength = useOfflineStore(selectQueueLength)
  const isSyncing = useOfflineStore(selectIsSyncing)
  const syncProgress = useOfflineStore(selectSyncProgress)
  const [syncComplete, setSyncComplete] = useState(false)

  // Network status monitoring
  useNetworkStatus({
    onOnline: async () => {
      // Auto-sync when coming online
      const queueManager = getOfflineQueueManager()
      if (queueManager.hasQueuedOperations()) {
        await queueManager.sync()
      }
    },
  })

  // Reset sync complete indicator
  useEffect(() => {
    if (!isSyncing && syncComplete) {
      const timer = setTimeout(() => setSyncComplete(false), 2000)
      return () => clearTimeout(timer)
    }
  }, [isSyncing, syncComplete])

  // Update sync complete status
  useEffect(() => {
    if (!isSyncing && syncProgress.total > 0 && syncProgress.completed === syncProgress.total) {
      setSyncComplete(true)
    }
  }, [isSyncing, syncProgress])

  // Handle manual sync
  const handleSync = async () => {
    const queueManager = getOfflineQueueManager()
    await queueManager.sync()
  }

  if (!isOffline) {
    return null
  }

  const progressPercent = syncProgress.total > 0 ? (syncProgress.completed / syncProgress.total) * 100 : 0

  return (
    <div className="fixed top-0 left-0 right-0 z-40 bg-yellow-50 border-b border-yellow-200 px-4 py-3 shadow-sm">
      <div className="max-w-full mx-auto">
        {/* Main status row */}
        <div className="flex items-center justify-between gap-3">
          {/* Status indicator and text */}
          <div className="flex items-center gap-3 flex-1 min-w-0">
            <div className="flex-shrink-0">
              {syncComplete ? (
                <Check className="w-5 h-5 text-green-600" />
              ) : isSyncing ? (
                <RefreshCw className="w-5 h-5 text-blue-600 animate-spin" />
              ) : (
                <WifiOff className="w-5 h-5 text-yellow-600" />
              )}
            </div>

            <div className="flex-1 min-w-0">
              {syncComplete ? (
                <p className="text-sm font-medium text-green-700">
                  Sync complete - all changes uploaded
                </p>
              ) : isSyncing ? (
                <div className="space-y-1">
                  <p className="text-sm font-medium text-blue-700">
                    Syncing ({syncProgress.completed}/{syncProgress.total})
                  </p>
                  <div className="w-full max-w-xs bg-blue-200 rounded-full h-1.5">
                    <div
                      className="bg-blue-600 h-1.5 rounded-full transition-all duration-300"
                      style={{ width: `${progressPercent}%` }}
                    />
                  </div>
                </div>
              ) : (
                <div className="space-y-1">
                  <p className="text-sm font-medium text-yellow-800 flex items-center gap-1">
                    <AlertCircle className="w-4 h-4" />
                    Offline - changes will be uploaded when connection restored
                  </p>
                  {queueLength > 0 && (
                    <p className="text-xs text-yellow-700">
                      {queueLength} pending {queueLength === 1 ? 'change' : 'changes'}
                    </p>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Action buttons */}
          <div className="flex items-center gap-2 flex-shrink-0">
            {!syncComplete && queueLength > 0 && !isSyncing && (
              <button
                onClick={handleSync}
                className="inline-flex items-center gap-2 px-3 py-1.5 bg-yellow-200 hover:bg-yellow-300 text-yellow-800 rounded text-sm font-medium transition-colors"
                title="Manually sync pending changes"
              >
                <RefreshCw className="w-4 h-4" />
                Sync Now
              </button>
            )}

            {isSyncing && (
              <div className="flex items-center gap-1 text-xs text-blue-600 font-medium">
                <RefreshCw className="w-3 h-3 animate-spin" />
                Syncing...
              </div>
            )}

            {syncComplete && (
              <div className="flex items-center gap-1 text-xs text-green-600 font-medium">
                <Check className="w-3 h-3" />
                Synced
              </div>
            )}
          </div>
        </div>

        {/* Details row (for dev/debug) */}
        {process.env.NODE_ENV === 'development' && queueLength > 0 && (
          <div className="mt-2 text-xs text-yellow-700">
            Queue size: {queueLength} | Last sync: {useOfflineStore.getState().lastSyncTime ? new Date(useOfflineStore.getState().lastSyncTime!).toLocaleTimeString() : 'Never'}
          </div>
        )}
      </div>
    </div>
  )
}

// =============================================
// Export
// =============================================

export default OfflineModeBanner
