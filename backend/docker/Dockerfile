# Dockerfile
FROM node:20-alpine AS builder

WORKDIR /app

# Install scanner CLIs
RUN apk add --no-cache \
    python3 \
    py3-pip \
    git

# Install Semgrep
RUN pip3 install semgrep

# Install Gitleaks
RUN wget https://github.com/gitleaks/gitleaks/releases/download/v8.18.0/gitleaks_8.18.0_linux_x64.tar.gz && \
    tar -xzf gitleaks_8.18.0_linux_x64.tar.gz && \
    mv gitleaks /usr/local/bin/ && \
    rm gitleaks_8.18.0_linux_x64.tar.gz

# Copy package files
COPY package*.json ./
RUN npm ci

# Copy source
COPY . .

# Build TypeScript
RUN npm run build

# Production stage
FROM node:20-alpine

WORKDIR /app

# Copy scanners from builder
COPY --from=builder /usr/local/bin/semgrep /usr/local/bin/
COPY --from=builder /usr/local/bin/gitleaks /usr/local/bin/

# Copy built app
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package*.json ./

ENV NODE_ENV=production

EXPOSE 3000

CMD ["node", "dist/server.ts"]