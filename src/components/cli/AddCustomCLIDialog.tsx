/**
 * Add Custom CLI Dialog
 *
 * Dialog for registering custom CLI tools
 */

import { useState } from 'react'
import { X, Terminal, HelpCircle } from 'lucide-react'

interface AddCustomCLIDialogProps {
  open: boolean
  onClose: () => void
  onAdd: (profile: {
    name: string
    command: string
    args?: string[]
    mcpFlag?: string
    description?: string
    icon?: string
  }) => void
}

export function AddCustomCLIDialog({
  open,
  onClose,
  onAdd,
}: AddCustomCLIDialogProps) {
  const [name, setName] = useState('')
  const [command, setCommand] = useState('')
  const [args, setArgs] = useState('')
  const [mcpFlag, setMcpFlag] = useState('')
  const [description, setDescription] = useState('')
  const [icon, setIcon] = useState('🔧')
  const [error, setError] = useState('')

  if (!open) return null

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')

    if (!name.trim()) {
      setError('Name is required')
      return
    }

    if (!command.trim()) {
      setError('Command is required')
      return
    }

    onAdd({
      name: name.trim(),
      command: command.trim(),
      args: args.trim() ? args.split(/\s+/) : undefined,
      mcpFlag: mcpFlag.trim() || undefined,
      description: description.trim() || undefined,
      icon: icon || '🔧',
    })

    // Reset form
    setName('')
    setCommand('')
    setArgs('')
    setMcpFlag('')
    setDescription('')
    setIcon('🔧')
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60"
        onClick={onClose}
      />

      {/* Dialog */}
      <div className="relative bg-zinc-900 rounded-xl border border-zinc-700 shadow-2xl w-full max-w-md mx-4">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-700">
          <div className="flex items-center gap-2">
            <Terminal className="w-5 h-5 text-zinc-400" />
            <h2 className="text-lg font-semibold text-white">Add Custom CLI</h2>
          </div>
          <button
            onClick={onClose}
            className="p-1 hover:bg-zinc-700 rounded-lg transition-colors"
          >
            <X className="w-5 h-5 text-zinc-400" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-4 space-y-4">
          {error && (
            <div className="p-3 bg-red-500/10 border border-red-500/30 rounded-lg text-sm text-red-400">
              {error}
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-zinc-300 mb-1">
              Name *
            </label>
            <input
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="My Custom CLI"
              className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-white placeholder:text-zinc-500 focus:outline-none focus:border-blue-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-zinc-300 mb-1">
              Command *
            </label>
            <input
              type="text"
              value={command}
              onChange={e => setCommand(e.target.value)}
              placeholder="my-cli"
              className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-white placeholder:text-zinc-500 focus:outline-none focus:border-blue-500 font-mono"
            />
            <p className="mt-1 text-xs text-zinc-500">
              The CLI command to execute (must be in PATH)
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium text-zinc-300 mb-1">
              Default Arguments
            </label>
            <input
              type="text"
              value={args}
              onChange={e => setArgs(e.target.value)}
              placeholder="--flag1 --flag2"
              className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-white placeholder:text-zinc-500 focus:outline-none focus:border-blue-500 font-mono"
            />
          </div>

          <div>
            <label className="flex items-center gap-1 text-sm font-medium text-zinc-300 mb-1">
              MCP Config Flag
              <HelpCircle className="w-3.5 h-3.5 text-zinc-500" />
            </label>
            <input
              type="text"
              value={mcpFlag}
              onChange={e => setMcpFlag(e.target.value)}
              placeholder="--mcp-config"
              className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-white placeholder:text-zinc-500 focus:outline-none focus:border-blue-500 font-mono"
            />
            <p className="mt-1 text-xs text-zinc-500">
              Flag to pass MCP server config (if supported)
            </p>
          </div>

          <div className="grid grid-cols-[1fr,80px] gap-3">
            <div>
              <label className="block text-sm font-medium text-zinc-300 mb-1">
                Description
              </label>
              <input
                type="text"
                value={description}
                onChange={e => setDescription(e.target.value)}
                placeholder="A custom CLI tool"
                className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-white placeholder:text-zinc-500 focus:outline-none focus:border-blue-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-zinc-300 mb-1">
                Icon
              </label>
              <input
                type="text"
                value={icon}
                onChange={e => setIcon(e.target.value)}
                placeholder="🔧"
                className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-white text-center focus:outline-none focus:border-blue-500"
                maxLength={2}
              />
            </div>
          </div>

          {/* Actions */}
          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm text-zinc-400 hover:text-white transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-4 py-2 text-sm bg-blue-600 hover:bg-blue-500 text-white rounded-lg transition-colors"
            >
              Add CLI
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
