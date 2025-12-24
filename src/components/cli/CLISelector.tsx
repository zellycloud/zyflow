/**
 * CLI Selector Component
 *
 * Dropdown for selecting which CLI to use for agent execution
 */

import { useState, useEffect } from 'react'
import { ChevronDown, Check, Settings, Plus, Loader2 } from 'lucide-react'
import { cliApiUrl } from '@/config/api'

interface CLIProfile {
  id: string
  name: string
  type: string
  command: string
  description?: string
  icon?: string
  builtin?: boolean
  version?: string
}

interface CLISelectorProps {
  value: string
  onChange: (profileId: string) => void
  onCustomClick?: () => void
  disabled?: boolean
}

export function CLISelector({
  value,
  onChange,
  onCustomClick,
  disabled,
}: CLISelectorProps) {
  const [profiles, setProfiles] = useState<CLIProfile[]>([])
  const [loading, setLoading] = useState(true)
  const [open, setOpen] = useState(false)

  useEffect(() => {
    fetchProfiles()
  }, [])

  async function fetchProfiles() {
    try {
      setLoading(true)
      const res = await fetch(cliApiUrl.availableProfiles())
      const data = await res.json()
      if (data.success) {
        setProfiles(data.profiles)
        // Set default if no value selected
        if (!value && data.profiles.length > 0) {
          onChange(data.profiles[0].id)
        }
      }
    } catch (error) {
      console.error('Failed to fetch CLI profiles:', error)
    } finally {
      setLoading(false)
    }
  }

  const selectedProfile = profiles.find(p => p.id === value)

  if (loading) {
    return (
      <div className="flex items-center gap-2 px-3 py-2 bg-zinc-800 rounded-lg border border-zinc-700">
        <Loader2 className="w-4 h-4 animate-spin text-zinc-400" />
        <span className="text-sm text-zinc-400">Loading CLIs...</span>
      </div>
    )
  }

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => !disabled && setOpen(!open)}
        disabled={disabled}
        className={`
          flex items-center gap-2 px-3 py-2 w-full
          bg-zinc-800 rounded-lg border border-zinc-700
          hover:border-zinc-600 transition-colors
          ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}
        `}
      >
        {selectedProfile ? (
          <>
            <span className="text-lg">{selectedProfile.icon || '🔧'}</span>
            <span className="flex-1 text-left text-sm text-white">
              {selectedProfile.name}
            </span>
            {selectedProfile.version && (
              <span className="text-xs text-zinc-500">
                {selectedProfile.version.split('\n')[0].substring(0, 20)}
              </span>
            )}
          </>
        ) : (
          <span className="flex-1 text-left text-sm text-zinc-400">
            Select CLI...
          </span>
        )}
        <ChevronDown className="w-4 h-4 text-zinc-400" />
      </button>

      {open && (
        <>
          {/* Backdrop */}
          <div
            className="fixed inset-0 z-10"
            onClick={() => setOpen(false)}
          />

          {/* Dropdown */}
          <div className="absolute z-20 mt-1 w-full bg-zinc-800 rounded-lg border border-zinc-700 shadow-xl overflow-hidden">
            {profiles.length === 0 ? (
              <div className="px-3 py-4 text-center text-sm text-zinc-400">
                No CLI tools available.
                <br />
                Install Claude Code, Gemini CLI, etc.
              </div>
            ) : (
              <div className="max-h-60 overflow-y-auto">
                {profiles.map(profile => (
                  <button
                    key={profile.id}
                    type="button"
                    onClick={() => {
                      onChange(profile.id)
                      setOpen(false)
                    }}
                    className={`
                      flex items-center gap-3 w-full px-3 py-2.5
                      hover:bg-zinc-700/50 transition-colors
                      ${profile.id === value ? 'bg-zinc-700/30' : ''}
                    `}
                  >
                    <span className="text-lg">{profile.icon || '🔧'}</span>
                    <div className="flex-1 text-left">
                      <div className="text-sm text-white">{profile.name}</div>
                      {profile.description && (
                        <div className="text-xs text-zinc-500">
                          {profile.description}
                        </div>
                      )}
                    </div>
                    {profile.id === value && (
                      <Check className="w-4 h-4 text-emerald-500" />
                    )}
                  </button>
                ))}
              </div>
            )}

            {/* Footer actions */}
            <div className="border-t border-zinc-700">
              {onCustomClick && (
                <button
                  type="button"
                  onClick={() => {
                    onCustomClick()
                    setOpen(false)
                  }}
                  className="flex items-center gap-2 w-full px-3 py-2.5 hover:bg-zinc-700/50 transition-colors"
                >
                  <Plus className="w-4 h-4 text-zinc-400" />
                  <span className="text-sm text-zinc-400">Add Custom CLI</span>
                </button>
              )}
              <button
                type="button"
                onClick={() => {
                  fetchProfiles()
                  setOpen(false)
                }}
                className="flex items-center gap-2 w-full px-3 py-2.5 hover:bg-zinc-700/50 transition-colors"
              >
                <Settings className="w-4 h-4 text-zinc-400" />
                <span className="text-sm text-zinc-400">Refresh</span>
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
