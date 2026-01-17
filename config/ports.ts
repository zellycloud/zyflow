/**
 * ZyFlow Port Configuration
 *
 * Central configuration for all server ports.
 * Edit these values to change ports across the entire application.
 */

export const PORTS = {
  /** Frontend development server (Vite) */
  FRONTEND: parseInt(process.env.VITE_PORT || '3200', 10),

  /** Backend API server (Express) */
  API: parseInt(process.env.API_PORT || '3100', 10),
} as const

/**
 * Get the full URL for the frontend server
 */
export function getFrontendUrl(): string {
  return `http://localhost:${PORTS.FRONTEND}`
}

/**
 * Get the full URL for the API server
 */
export function getApiUrl(): string {
  return `http://localhost:${PORTS.API}`
}
