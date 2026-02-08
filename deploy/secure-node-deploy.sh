#!/bin/bash
# Secure Enclave Deployment Script for Moltworker
# Run this on your Secure Mini PC (Ubuntu/Debian) to build and deploy the worker.

set -e # Exit on error

echo "🚀 Starting Moltworker Secure Enclave Deployment..."

# 1. Update & Install Dependencies
# 1. Update & Install Dependencies (System)
echo "📦 Installing system dependencies..."
sudo apt-get update
# Note: We removed 'nodejs' and 'npm' from here because standard repos are often broken/outdated.
sudo apt-get install -y git docker.io build-essential curl

# 1.5 Install Node.js via NVM (Robust Method)
echo "🟢 Checking Node.js version..."

# Function to get major version
get_node_version() {
  node -v 2>/dev/null | cut -d. -f1 | tr -d 'v'
}

CURRENT_VER=$(get_node_version)

if ! command -v node &> /dev/null || [ -z "$CURRENT_VER" ] || [ "$CURRENT_VER" -lt 18 ]; then
    echo "⚠️ Node.js is missing or too old (found v${CURRENT_VER:-none}). Installing NVM + Node 20..."
    
    # Remove old apt version to avoid conflicts
    sudo apt-get remove -y nodejs npm || true
    sudo apt-get autoremove -y || true

    curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.7/install.sh | bash
    
    # Load NVM into current session immediately
    export NVM_DIR="$HOME/.nvm"
    [ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"
    
    # Install Node 20
    nvm install 20
    nvm use 20
    nvm alias default 20
else
    echo "✅ Node.js is up to date: $(node -v)"
fi

# 2. Configure Docker
echo "🐳 Configuring Docker..."
if ! systemctl is-active --quiet docker; then
    sudo systemctl start docker
    sudo systemctl enable docker
fi
sudo usermod -aG docker $USER || true

# 3. Setup Project
echo "📂 Setting up project..."
REPO_DIR="$HOME/chiefos-moltworker"

if [ -d "$REPO_DIR" ]; then
    echo "   Updating existing repo..."
    cd "$REPO_DIR"
    git pull origin main
else
    echo "   Cloning repository..."
    # Replace with your actual repo URL
    git clone https://github.com/bmegacoach/helpmecoach-ai-deployment.git "$REPO_DIR"
    cd "$REPO_DIR"
fi

# 4. Install Node Dependencies
echo "npm installing..."
npm ci

# 5. Wrangler Auth (Interactive first time)
echo "🔐 Checking Wrangler authentication..."
if ! npx wrangler whoami > /dev/null 2>&1; then
    echo "⚠️  You need to login to Wrangler."
    echo "   Run: 'npx wrangler login' and follow the link."
    # We exit here so the user can login interactively without the script swallowing the prompt
    exit 1
fi

# 6. Build & Deploy
echo "🚀 Deploying to Cloudflare..."
npm run build
npx wrangler deploy

echo "✅ Deployment Complete! The Moltworker should now be live and stable."
