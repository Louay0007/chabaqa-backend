# ================================
# Stage 1: Dependencies
# ================================
FROM node:20.11.1-alpine3.19 AS dependencies

# Install security updates and required packages
RUN apk update && \
    apk upgrade && \
    apk add --no-cache \
    dumb-init \
    curl \
    && rm -rf /var/cache/apk/*

WORKDIR /app

# Copy package files for dependency installation
COPY package*.json ./

# Install dependencies with production optimizations
RUN npm ci --only=production --ignore-scripts && \
    npm cache clean --force

# ================================
# Stage 2: Builder
# ================================
FROM node:20.11.1-alpine3.19 AS builder

# Install build dependencies
RUN apk update && \
    apk add --no-cache python3 make g++ && \
    rm -rf /var/cache/apk/*

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install all dependencies (including dev dependencies for build)
RUN npm ci --ignore-scripts

# Copy source code
COPY . .

# Build the application with optimizations
RUN NODE_ENV=production \
    NODE_OPTIONS="--max-old-space-size=4096" \
    npm run build && \
    npm prune --production

# ================================
# Stage 3: Production
# ================================
FROM node:20.11.1-alpine3.19 AS production

# Install security updates and runtime dependencies
RUN apk update && \
    apk upgrade && \
    apk add --no-cache \
    dumb-init \
    curl \
    tini \
    && rm -rf /var/cache/apk/*

# Set production environment
ENV NODE_ENV=production \
    NODE_OPTIONS="--max-old-space-size=2048 --max-semi-space-size=64" \
    UV_THREADPOOL_SIZE=128 \
    PORT=3000

WORKDIR /app

# Create non-root user with specific UID/GID
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nestjs -u 1001 -G nodejs

# Copy production dependencies from dependencies stage
COPY --from=dependencies --chown=nestjs:nodejs /app/node_modules ./node_modules

# Copy built application from builder stage
COPY --from=builder --chown=nestjs:nodejs /app/dist ./dist
COPY --from=builder --chown=nestjs:nodejs /app/package*.json ./

# Create necessary directories with proper permissions
RUN mkdir -p uploads/image uploads/video uploads/document uploads/audio public && \
    chown -R nestjs:nodejs uploads public && \
    chmod -R 755 uploads public

# Switch to non-root user
USER nestjs

# Expose application port
EXPOSE 3000

# Health check with optimized settings
HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=3 \
    CMD curl -f http://localhost:3000/api/health || exit 1

# Use tini as init system for proper signal handling
ENTRYPOINT ["/sbin/tini", "--"]

# Start application with production optimizations
CMD ["node", "--enable-source-maps", "dist/main.js"]
