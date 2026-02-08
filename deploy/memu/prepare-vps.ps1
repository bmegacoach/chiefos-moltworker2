$password = "5Nc*PRty"
$vpsIP = "163.245.195.174"
$kimiKey = "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"

# Create install script content
$installScript = @'
#!/bin/bash
set -e
echo "🚀 memU Installation Starting..."

# Update and install docker
apt-get update -y
curl -fsSL https://get.docker.com | sh
systemctl enable docker && systemctl start docker

# Install docker compose
apt-get install -y docker-compose-plugin

# Install cloudflared
curl -L https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64 -o /usr/local/bin/cloudflared
chmod +x /usr/local/bin/cloudflared

# Create directory and files
mkdir -p /opt/memu && cd /opt/memu

cat > docker-compose.yml << 'EOF'
version: "3.8"
services:
  memu-server:
    image: nevamindai/memu-server:latest
    container_name: memu-server
    restart: unless-stopped
    ports: ["8000:8000"]
    environment:
      - OPENAI_API_KEY=${OPENAI_API_KEY}
      - OPENAI_API_BASE=${OPENAI_API_BASE}
      - DATABASE_URL=postgresql://postgres:${POSTGRES_PASSWORD}@memu-postgres:5432/memu
    depends_on:
      memu-postgres: {condition: service_healthy}
    networks: [memu-network]

  memu-postgres:
    image: pgvector/pgvector:pg16
    container_name: memu-postgres
    restart: unless-stopped
    environment:
      - POSTGRES_USER=postgres
      - POSTGRES_PASSWORD=${POSTGRES_PASSWORD}
      - POSTGRES_DB=memu
    volumes: [memu-postgres-data:/var/lib/postgresql/data]
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U postgres"]
      interval: 10s
      timeout: 5s
      retries: 5
    networks: [memu-network]

volumes:
  memu-postgres-data:
networks:
  memu-network:
EOF

cat > .env << 'ENVEOF'
OPENAI_API_KEY=KIMI_PLACEHOLDER
OPENAI_API_BASE=https://api.moonshot.cn/v1
POSTGRES_PASSWORD=memu_chiefos_secure_2024
ENVEOF

echo "✅ Files created. Starting services..."
docker compose up -d

echo "✅ memU deployed! Testing health..."
sleep 10
curl -s http://localhost:8000/health || echo "Still starting..."
'@

# Write script to temp file
$installScript | Out-File -FilePath "C:\temp\memu_install.sh" -Encoding UTF8 -NoNewline

Write-Host "Script created. Use plink or manual SSH to run it."
