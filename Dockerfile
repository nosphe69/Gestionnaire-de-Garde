# Production Dockerfile optimized for low-RAM NAS (Synology 1GB RAM)
# The frontend bundle in ./dist is pre-built in AI Studio Cloud,
# so the NAS never runs heavy Vite/TypeScript compilation.
FROM node:20-slim

# Native build tools needed for better-sqlite3
RUN apt-get update && apt-get install -y python3 make g++ && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install ONLY production dependencies (skips Vite, devDependencies, minimal RAM)
COPY package*.json ./
RUN npm install --omit=dev

# Copy server and pre-built frontend bundle
COPY server.ts ./
COPY tsconfig.json ./
COPY dist ./dist

# Ensure storage directories exist
RUN mkdir -p /app/data /app/plannings

ENV NODE_ENV=production
ENV DB_PATH=/app/data/guards.db
ENV PORT=3000

EXPOSE 3000

CMD ["npx", "tsx", "server.ts"]
