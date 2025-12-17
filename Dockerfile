# ================================
# Stage 1: Builder
# ================================
FROM node:20-alpine AS builder

# Set working directory
WORKDIR /app

# Configure npm for better performance and reliability
RUN npm config set fetch-timeout 300000 && \
  npm config set fetch-retries 5 && \
  npm config set fetch-retry-mintimeout 20000 && \
  npm config set fetch-retry-maxtimeout 120000

# Copy package files first (better layer caching)
COPY package*.json ./

# Install all dependencies (needed for build)
# Using --prefer-offline to speed up the build
RUN npm ci --prefer-offline || npm ci

# Copy source code
COPY . .

# Build the application
RUN npm run build

# ================================
# Stage 2: Production
# ================================
FROM node:20-alpine AS production

# Set working directory
WORKDIR /app

# Configure npm for better performance and reliability
RUN npm config set fetch-timeout 300000 && \
  npm config set fetch-retries 5 && \
  npm config set fetch-retry-mintimeout 20000 && \
  npm config set fetch-retry-maxtimeout 120000

# Copy package files
COPY package*.json ./

# Install only production dependencies with optimizations
RUN npm ci --omit=dev --prefer-offline || npm ci --omit=dev && \
  npm cache clean --force

# Copy built application from builder stage
COPY --from=builder /app/dist ./dist

# Create uploads directory
RUN mkdir -p uploads && chmod 755 uploads

# Create a non-root user for security
RUN addgroup -g 1001 -S nodejs && \
  adduser -S nestjs -u 1001

# Change ownership of app files
RUN chown -R nestjs:nodejs /app

# Switch to non-root user
USER nestjs

# Expose the application port
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=30s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3000/api/health', (r) => {process.exit(r.statusCode === 200 ? 0 : 1)})"

# Start the application
CMD ["node", "dist/main.js"]
