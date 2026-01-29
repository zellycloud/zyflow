/**
 * CLI Adapter Module
 * Provides programmatic access to CLI tools
 *
 * NOTE: openspec module removed in TAG-014
 * Use server/tasks/db/schema.ts for task management
 */

// CLI Routes for Express app
import cliRouter from './routes.js'
export { cliRouter as cliRoutes }
