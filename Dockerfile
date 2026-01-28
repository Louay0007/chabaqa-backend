# ================================
# Stage 1: Builder
# ================================
FROM node:20.19.0-alpine3.20 AS builder

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install all dependencies for build
RUN npm install --prefer-offline --no-audit

# Copy source code
COPY . .

# Build with aggressive memory settings for low-RAM VPS
RUN NODE_OPTIONS="--max-old-space-size=3072 --max-semi-space-size=128" npm run build

# ================================
# Stage 2: Production
# ================================
FROM node:20.19.0-alpine3.20 AS production

# Install only curl for healthcheck
RUN apk add --no-cache curl

# Set production environment
ENV NODE_ENV=production \
    PORT=3000

WORKDIR /app

# Copy package files and install production dependencies only
COPY package*.json ./
RUN npm install --omit=dev --prefer-offline --no-audit && npm cache clean --force

# Copy built application from builder
COPY --from=builder /app/dist ./dist

# Copy entrypoint script
COPY docker-entrypoint.sh /docker-entrypoint.sh
RUN chmod +x /docker-entrypoint.sh

# Create upload directories (will be overridden by volume mount, but ensures structure exists)
RUN mkdir -p uploads/image uploads/video uploads/document uploads/audio public

# Expose port
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=3 \
    CMD curl -f http://localhost:3000/api/health || exit 1

# Start application via entrypoint (runs as root to create dirs, then starts node)
ENTRYPOINT ["/docker-entrypoint.sh"]
