#!/bin/bash
# memU Complete Installation Script
# Run this on Ubuntu VPS

set -e

echo "🚀 memU Server Installation - Starting..."

# Update system
apt-get update -y

# Install Docker
if ! command -v docker &> /dev/null; then
    echo "📦 Installing Docker..."
    curl -fsSL https://get.docker.com | sh
    systemctl enable docker
    systemctl start docker
fi

# Install Docker Compose plugin
if ! docker compose version &> /dev/null; then
    echo "📦 Installing Docker Compose..."
    apt-get install -y docker-compose-plugin
fi

# Install cloudflared
if ! command -v cloudflared &> /dev/null; then
    echo "📦 Installing Cloudflared..."
    curl -L https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64 -o /usr/local/bin/cloudflared
    chmod +x /usr/local/bin/cloudflared
fi

# Create memU directory
mkdir -p /opt/memu
cd /opt/memu

# Create docker-compose.yml
cat > docker-compose.yml << 'COMPOSE'
version: '3.8'
services:
  memu-server:
    image: nevamindai/memu-server:latest
    container_name: memu-server
    restart: unless-stopped
    ports:
      - "8000:8000"
    environment:
      - OPENAI_API_KEY=${OPENAI_API_KEY}
      - OPENAI_API_BASE=${OPENAI_API_BASE}
      - DATABASE_URL=postgresql://postgres:${POSTGRES_PASSWORD}@memu-postgres:5432/memu
    depends_on:
      memu-postgres:
        condition: service_healthy
    networks:
      - memu-network

  memu-postgres:
    image: pgvector/pgvector:pg16
    container_name: memu-postgres
    restart: unless-stopped
    environment:
      - POSTGRES_USER=postgres
      - POSTGRES_PASSWORD=${POSTGRES_PASSWORD}
      - POSTGRES_DB=memu
    volumes:
      - memu-postgres-data:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U postgres"]
      interval: 10s
      timeout: 5s
      retries: 5
    networks:
      - memu-network

volumes:
  memu-postgres-data:
COMPOSE

# Create .env with Kimi API
cat > .env << 'ENVFILE'
# Kimi K2.5 API (OpenAI-compatible)
OPENAI_API_KEY=KIMI_KEY_PLACEHOLDER
OPENAI_API_BASE=https://api.moonshot.cn/v1
POSTGRES_PASSWORD=memu_chiefos_2024
ENVFILE

echo "✅ memU installation complete!"
echo "Next: Update .env with Kimi key, then run: docker compose up -d"
