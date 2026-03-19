# ── Stage 1: Install dependencies ─────────────────────────────────────────────
FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --prefer-offline

# ── Stage 2: Build ────────────────────────────────────────────────────────────
FROM node:22-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY package.json package-lock.json nest-cli.json tsconfig.json tsconfig.build.json ./
COPY src ./src
RUN npx nest build

# ── Stage 3: Production image ────────────────────────────────────────────────
FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --prefer-offline && npm cache clean --force
COPY --from=builder /app/dist ./dist
COPY public ./public
RUN mkdir -p uploads hls-output
EXPOSE 3000
CMD ["node", "--max-old-space-size=1024", "dist/main.js"]
