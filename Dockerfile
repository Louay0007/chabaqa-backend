# ================================
# Stage 1: Builder
# ================================
FROM node:20.11.1-alpine3.19 AS builder

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install all dependencies for build
RUN npm ci

# Copy source code
COPY . .

# Build with aggressive memory settings for low-RAM VPS
RUN NODE_OPTIONS="--max-old-space-size=3072 --max-semi-space-size=128" npm run build

# ================================
# Stage 2: Production
# ================================
FROM node:20.11.1-alpine3.19 AS production

# Install only curl for healthcheck
RUN apk add --no-cache curl

# Set production environment
ENV NODE_ENV=production \
    PORT=3000

WORKDIR /app

# Create non-root user
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nestjs -u 1001 -G nodejs

# Copy package files and install production dependencies only
COPY package*.json ./
RUN npm ci --omit=dev && npm cache clean --force

# Copy built application from builder
COPY --from=builder --chown=nestjs:nodejs /app/dist ./dist

# Create upload directories
RUN mkdir -p uploads/image uploads/video uploads/document uploads/audio public && \
    chown -R nestjs:nodejs uploads public

# Switch to non-root user
USER nestjs

# Expose port
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=3 \
    CMD curl -f http://localhost:3000/api/health || exit 1

# Start application
CMD ["node", "dist/main.js"]
