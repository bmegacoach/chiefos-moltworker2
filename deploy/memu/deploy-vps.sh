#!/bin/bash
# memU Server Deployment Script for InterServer VPS
# Uses Cloudflare Tunnel for secure access (zero exposed ports)

set -e

echo "🚀 memU Server Deployment Script"
echo "================================"

# Configuration
MEMU_DIR="/opt/memu"
DOMAIN="memu.allcryptoatm.org"  # ChiefOS Short-Term Memory

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Check if running as root
if [ "$EUID" -ne 0 ]; then 
    echo -e "${RED}Please run as root (sudo)${NC}"
    exit 1
fi

# Step 1: Install Docker if not present
echo -e "\n${YELLOW}Step 1: Checking Docker installation...${NC}"
if ! command -v docker &> /dev/null; then
    echo "Installing Docker..."
    curl -fsSL https://get.docker.com | sh
    systemctl enable docker
    systemctl start docker
    echo -e "${GREEN}Docker installed successfully${NC}"
else
    echo -e "${GREEN}Docker already installed${NC}"
fi

# Step 2: Install Docker Compose plugin if not present
echo -e "\n${YELLOW}Step 2: Checking Docker Compose...${NC}"
if ! docker compose version &> /dev/null; then
    echo "Installing Docker Compose plugin..."
    apt-get update
    apt-get install -y docker-compose-plugin
    echo -e "${GREEN}Docker Compose installed successfully${NC}"
else
    echo -e "${GREEN}Docker Compose already installed${NC}"
fi

# Step 3: Install Cloudflared
echo -e "\n${YELLOW}Step 3: Installing Cloudflared...${NC}"
if ! command -v cloudflared &> /dev/null; then
    curl -L https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64 -o /usr/local/bin/cloudflared
    chmod +x /usr/local/bin/cloudflared
    echo -e "${GREEN}Cloudflared installed successfully${NC}"
else
    echo -e "${GREEN}Cloudflared already installed${NC}"
fi

# Step 4: Create directory structure
echo -e "\n${YELLOW}Step 4: Creating directory structure...${NC}"
mkdir -p ${MEMU_DIR}
cd ${MEMU_DIR}

# Step 5: Create docker-compose.yml
echo -e "\n${YELLOW}Step 5: Creating docker-compose.yml...${NC}"
cat > docker-compose.yml << 'EOF'
version: '3.8'

services:
  memu-server:
    image: nevamindai/memu-server:latest
    container_name: memu-server
    restart: unless-stopped
    # No external ports - accessed via Cloudflare Tunnel
    expose:
      - "8000"
    environment:
      - OPENAI_API_KEY=${OPENAI_API_KEY}
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
    driver: local

networks:
  memu-network:
    driver: bridge
EOF
echo -e "${GREEN}docker-compose.yml created${NC}"

# Step 6: Create .env file (user must edit)
echo -e "\n${YELLOW}Step 6: Creating .env template...${NC}"
if [ ! -f .env ]; then
    cat > .env << 'EOF'
# memU Environment Configuration
# IMPORTANT: Edit these values before starting!

# Required: Your OpenAI API Key (for embeddings)
OPENAI_API_KEY=sk-your-openai-key-here

# PostgreSQL Password (auto-generated, change if desired)
POSTGRES_PASSWORD=memu_$(openssl rand -hex 8)
EOF
    echo -e "${RED}⚠️  IMPORTANT: Edit .env file with your API keys!${NC}"
    echo "    nano ${MEMU_DIR}/.env"
else
    echo -e "${GREEN}.env already exists, keeping current values${NC}"
fi

# Step 7: Cloudflare Tunnel Setup Instructions
echo -e "\n${YELLOW}Step 7: Cloudflare Tunnel Setup${NC}"
echo "================================"
echo ""
echo "Run these commands to set up the tunnel:"
echo ""
echo "  1. Login to Cloudflare:"
echo "     cloudflared tunnel login"
echo ""
echo "  2. Create a tunnel:"
echo "     cloudflared tunnel create memu"
echo ""
echo "  3. Route DNS:"
echo "     cloudflared tunnel route dns memu ${DOMAIN}"
echo ""
echo "  4. Create tunnel config:"
cat << EOF
     cat > /root/.cloudflared/config.yml << 'CFEOF'
tunnel: memu
credentials-file: /root/.cloudflared/<TUNNEL_ID>.json

ingress:
  - hostname: ${DOMAIN}
    service: http://localhost:8000
  - service: http_status:404
CFEOF
EOF
echo ""
echo "  5. Start tunnel as service:"
echo "     cloudflared service install"
echo "     systemctl enable cloudflared"
echo "     systemctl start cloudflared"
echo ""

# Step 8: Start memU services
echo -e "\n${YELLOW}Starting memU services...${NC}"
echo "Run this after editing .env:"
echo "  cd ${MEMU_DIR} && docker compose up -d"
echo ""
echo "Check status with:"
echo "  docker compose ps"
echo "  docker compose logs -f memu-server"
echo ""

echo -e "${GREEN}✅ Deployment script complete!${NC}"
echo ""
echo "Next steps:"
echo "1. Edit ${MEMU_DIR}/.env with your OpenAI key"
echo "2. Run: cd ${MEMU_DIR} && docker compose up -d"
echo "3. Follow Cloudflare Tunnel setup above"
echo "4. Test: curl https://${DOMAIN}/health"
echo "5. Update Moltworker: npx wrangler secret put MEMU_API_URL"
echo "   Enter: https://${DOMAIN}"
