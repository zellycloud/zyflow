/**
 * CLI Adapter Module
 * Provides programmatic access to CLI tools
 */

export * from './openspec.js'

// CLI Routes for Express app
import cliRouter from './routes.js'
export { cliRouter as cliRoutes }
