import { create } from 'zustand'
import { persist } from 'zustand/middleware'

interface HideCompletedState {
  hideCompleted: boolean
  setHideCompleted: (value: boolean) => void
  toggle: () => void
}

export const useHideCompletedStore = create<HideCompletedState>()(
  persist(
    (set) => ({
      hideCompleted: false,
      setHideCompleted: (value) => set({ hideCompleted: value }),
      toggle: () => set((state) => ({ hideCompleted: !state.hideCompleted })),
    }),
    {
      name: 'zyflow-hide-completed-specs',
    }
  )
)
