#!/bin/bash
# VPS Deployment Script for Moltworker
# Run this on your MemU VPS (Ubuntu/Debian) to build and deploy the worker.

set -e # Exit on error

echo "🚀 Starting Moltworker VPS Deployment Setup..."

# 1. Update & Install Dependencies
echo "📦 Installing system dependencies..."
sudo apt-get update
sudo apt-get install -y git nodejs npm docker.io build-essential

# 2. Configure Docker
echo "🐳 Configuring Docker..."
sudo systemctl start docker
sudo systemctl enable docker
sudo usermod -aG docker $USER || true

# 3. Setup Project
echo "📂 Setting up project..."
API_DIR="$HOME/chiefos-moltworker"

if [ -d "$API_DIR" ]; then
    echo "   Updating existing repo..."
    cd "$API_DIR"
    git pull origin main
else
    echo "   Cloning repository..."
    # Replace with your actual repo URL
    git clone https://github.com/bmegacoach/helpmecoach-ai-deployment.git "$API_DIR"
    cd "$API_DIR"
    # Navigate to moltworker subdirectory if needed (adjust as per repo structure)
    # cd moltworker 
fi

# 4. Install Node Dependencies
echo "npm installing..."
npm ci

# 5. Wrangler Auth (Interactive first time)
echo "🔐 Checking Wrangler authentication..."
if ! npx wrangler whoami > /dev/null 2>&1; then
    echo "⚠️  You need to login to Wrangler."
    echo "   Run: 'npx wrangler login' and follow the link."
    exit 1
fi

# 6. Build & Deploy
echo "🚀 Deploying to Cloudflare..."
npm run build
npx wrangler deploy

echo "✅ Deployment Complete!"
