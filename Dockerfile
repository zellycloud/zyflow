# ==============================================
# ZyFlow Multi-stage Dockerfile
# ==============================================

# Stage 1: Build
FROM node:20-alpine AS builder

WORKDIR /app

# Install build dependencies for native modules (better-sqlite3, node-pty)
RUN apk add --no-cache python3 make g++ linux-headers

# Copy package files
COPY package*.json ./
COPY packages/ ./packages/

# Install all dependencies (including devDependencies for build)
RUN npm ci

# Copy source code
COPY . .

# Build application
RUN npm run build

# Build MCP server
RUN npm run build:mcp || true

# ==============================================
# Stage 2: Production
# ==============================================
FROM node:20-alpine AS production

WORKDIR /app

# Install runtime dependencies for native modules
RUN apk add --no-cache python3 make g++ linux-headers curl

# Create non-root user
RUN addgroup -g 1001 -S zyflow && \
    adduser -S zyflow -u 1001 -G zyflow

# Copy package files
COPY package*.json ./
COPY packages/ ./packages/

# Install production dependencies only
RUN npm ci --omit=dev && \
    npm cache clean --force

# Rebuild native modules for production
RUN npm rebuild better-sqlite3

# Copy built assets from builder
COPY --from=builder /app/dist ./dist

# Copy server files (compiled TypeScript)
# Note: server runs via tsx in dev, but we copy source for production tsx execution
COPY --from=builder /app/server ./server
COPY --from=builder /app/tsconfig.json ./
COPY --from=builder /app/tsconfig.node.json ./

# Create data directory
RUN mkdir -p /app/data && chown -R zyflow:zyflow /app/data

# Environment variables
ENV NODE_ENV=production
ENV DATA_DIR=/app/data
ENV PORT=3100

# Switch to non-root user
USER zyflow

# Expose port
EXPOSE 3100

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD curl -f http://localhost:3100/api/health || exit 1

# Start server
CMD ["npx", "tsx", "server/index.ts"]
