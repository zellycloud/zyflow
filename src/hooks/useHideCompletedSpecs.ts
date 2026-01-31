import { useHideCompletedStore } from '@/stores/useHideCompletedStore'

/**
 * Hook to manage hide completed SPECs preference
 * - Uses Zustand for state management
 * - Persists to localStorage automatically
 * - Syncs across all components in the same tab
 */
export function useHideCompletedSpecs() {
  const hideCompleted = useHideCompletedStore((state) => state.hideCompleted)
  const setHideCompleted = useHideCompletedStore((state) => state.setHideCompleted)
  const toggle = useHideCompletedStore((state) => state.toggle)

  return { hideCompleted, setHideCompleted, toggle }
}
