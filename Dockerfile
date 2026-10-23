# Multi-stage Dockerfile optimized for Synology NAS
# Stage 1: Build frontend bundle with Vite
FROM node:20-slim AS builder
WORKDIR /app
COPY package*.json ./
# Skip native C++ build scripts during frontend build to save memory and time
RUN npm install --ignore-scripts
COPY index.html vite.config.ts tsconfig.json ./
COPY public ./public
COPY src ./src
RUN npm run build

# Stage 2: Production runtime
FROM node:20-slim

# Native build tools needed for better-sqlite3 compilation
RUN apt-get update && apt-get install -y python3 make g++ && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install production dependencies
COPY package*.json ./
RUN npm install --omit=dev

# Copy server code and built frontend bundle from builder stage
COPY server.ts ./
COPY tsconfig.json ./
COPY --from=builder /app/dist ./dist

# Ensure storage directories exist
RUN mkdir -p /app/data /app/plannings

ENV NODE_ENV=production
ENV DB_PATH=/app/data/guards.db
ENV PORT=3000

EXPOSE 3000

CMD ["npx", "tsx", "server.ts"]
