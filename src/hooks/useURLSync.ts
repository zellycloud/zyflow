import { useEffect } from 'react'
import type { SelectedItem } from '@/types'

export function useURLSync(
  selectedItem: SelectedItem,
  setSelectedItem: (item: SelectedItem) => void
) {
  // 1. URL -> State (Popstate only - initial load handled by getInitialItemFromURL)
  useEffect(() => {
    const handlePopState = () => {
      const item = getInitialItemFromURL()
      if (item) {
        setSelectedItem(item)
      } else {
        // Root or unknown path -> maybe reset or keep? 
        // For now, let's reset to null if root
        if (window.location.pathname === '/' || window.location.pathname === '') {
            setSelectedItem(null)
        }
      }
    }

    window.addEventListener('popstate', handlePopState)
    return () => window.removeEventListener('popstate', handlePopState)
  }, [setSelectedItem])

  // 2. State -> URL
  useEffect(() => {
    if (!selectedItem) {
        // If null, maybe go to root?
        if (window.location.pathname !== '/') {
            // only push if not already there to avoid loops or unwanted history
             window.history.pushState(null, '', '/')
        }
        return
    }

    let newPath = '/'
    
    switch (selectedItem.type) {
      case 'project':
        newPath = `/project/${selectedItem.projectId}`
        break
      case 'change':
        newPath = `/project/${selectedItem.projectId}/change/${selectedItem.changeId}`
        break
      case 'docs':
        newPath = `/project/${selectedItem.projectId}/docs`
        if (selectedItem.docPath) {
          newPath += `?path=${encodeURIComponent(selectedItem.docPath)}`
        }
        break
      case 'backlog':
        newPath = `/project/${selectedItem.projectId}/backlog`
        break
      case 'project-settings':
        newPath = `/project/${selectedItem.projectId}/settings`
        break
      case 'standalone-tasks':
        newPath = `/project/${selectedItem.projectId}/tasks`
        break
      case 'agent':
        newPath = `/project/${selectedItem.projectId}/agents`
        break
      case 'post-task':
        newPath = `/project/${selectedItem.projectId}/post-task`
        break
      case 'alerts':
        newPath = `/project/${selectedItem.projectId}/alerts`
        break
      case 'archived':
        newPath = `/project/${selectedItem.projectId}/archives`
        break
       case 'settings':
        newPath = `/settings`
        break
    }

    const currentUrl = window.location.pathname + window.location.search
    if (currentUrl !== newPath) {
      window.history.pushState(null, '', newPath)
    }
  }, [selectedItem])
}

// Helper to get initial state from URL
export function getInitialItemFromURL(): SelectedItem | null {
    const path = window.location.pathname
    const parts = path.split('/').filter(Boolean)

    if (parts[0] === 'project' && parts[1]) {
        const projectId = parts[1]
        // decodeURIComponent is safer for IDs
        const decodedProjectId = decodeURIComponent(projectId)

        if (parts[2] === 'change' && parts[3]) {
            return { type: 'change', projectId: decodedProjectId, changeId: decodeURIComponent(parts[3]) }
        } else if (parts[2] === 'docs') {
            const urlParams = new URLSearchParams(window.location.search)
            const docPath = urlParams.get('path')
            return { type: 'docs', projectId: decodedProjectId, docPath: docPath ?? undefined }
        } else if (parts[2] === 'backlog') {
            return { type: 'backlog', projectId: decodedProjectId }
        } else if (parts[2] === 'settings') {
            return { type: 'project-settings', projectId: decodedProjectId }
        } else if (parts[2] === 'tasks') {
            return { type: 'standalone-tasks', projectId: decodedProjectId }
        } else if (parts[2] === 'agents') {
             return { type: 'agent', projectId: decodedProjectId }
        } else if (parts[2] === 'post-task') {
             return { type: 'post-task', projectId: decodedProjectId }
        } else if (parts[2] === 'alerts') {
             return { type: 'alerts', projectId: decodedProjectId }
        } else if (parts[2] === 'archives') {
            return { type: 'archived', projectId: decodedProjectId }
        }
        return { type: 'project', projectId: decodedProjectId }
    } else if (parts[0] === 'settings') {
        return { type: 'settings' }
    }
    return null
}
