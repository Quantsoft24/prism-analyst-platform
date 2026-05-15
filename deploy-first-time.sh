#!/bin/bash
# ══════════════════════════════════════════════════════════════
#  PRISM — First-Time Production Deployment Script
#  Run this on EC2: bash deploy-first-time.sh
# ══════════════════════════════════════════════════════════════
set -e

echo ""
echo "═══════════════════════════════════════════════════════"
echo "  PRISM — First-Time Production Deployment"
echo "═══════════════════════════════════════════════════════"
echo ""

# ── STEP 1: Stop old deployment ──
echo "🛑 STEP 1: Stopping old PRISM_ANALYST deployment..."
if [ -d ~/PRISM_ANALYST ]; then
  cd ~/PRISM_ANALYST
  docker compose -f docker-compose.prod.yml down 2>/dev/null || true
  echo "   Old deployment stopped."
  echo "   (Old code remains at ~/PRISM_ANALYST as backup)"
else
  echo "   No old deployment found, skipping."
fi
echo ""

# ── STEP 2: Clone new repos ──
echo "📥 STEP 2: Cloning new repos..."
mkdir -p ~/PRISM && cd ~/PRISM

if [ -d "prism-analyst-platform" ]; then
  echo "   prism-analyst-platform already exists, pulling latest..."
  cd prism-analyst-platform && git fetch --all && git checkout production && git pull origin production && cd ..
else
  git clone https://github.com/Quantsoft24/prism-analyst-platform.git
  cd prism-analyst-platform && git checkout production && cd ..
fi

if [ -d "prism-analyst-services" ]; then
  echo "   prism-analyst-services already exists, pulling latest..."
  cd prism-analyst-services && git fetch --all && git checkout production && git pull origin production && cd ..
else
  git clone https://github.com/Quantsoft24/prism-analyst-services.git
  cd prism-analyst-services && git checkout production && cd ..
fi
echo "   ✅ Repos ready on production branch"
echo ""

# ── STEP 3: Create landing page .env ──
echo "📝 STEP 3: Creating landing page .env..."
cat > ~/PRISM/prism-analyst-platform/thequantsoft/.env << 'EOF'
PORT=4000
TARGET_EMAIL=praveen.kumar@thequantsoft.co.in
SMTP_SERVICE=gmail
SMTP_USER=dhananjayraj75@gmail.com
SMTP_PASS=ejrkgblstpjpxauw
COMPANY_NAME=QUANTSOFT
LINKEDIN_URL=https://www.linkedin.com/company/quantsoft252
LINKEDIN_HANDLE=quantsoft252
PRISM_APP_URL=https://prism.thequantsoft.co.in/chat
LOCATION_MAIN=India · remote-first
LOCATION_SEC=Mumbai · Bangalore
COPYRIGHT_YEAR=2026
COPYRIGHT_DOMAIN=thequantsoft.co.in
EOF
echo "   ✅ Landing .env created"
echo ""

# ── STEP 4: Create backend .env (no DB for now) ──
echo "📝 STEP 4: Creating backend .env (no database)..."
cat > ~/PRISM/prism-analyst-services/.env << 'EOF'
HOST=0.0.0.0
PORT=8000
DEBUG=false
CORS_ORIGINS=["https://prism.thequantsoft.co.in"]
AUTH_ENABLED=false
EOF
echo "   ✅ Backend .env created"
echo ""

# ── STEP 5: Create certbot directory ──
echo "📁 STEP 5: Creating certbot directory..."
mkdir -p ~/PRISM/prism-analyst-platform/certbot/www
echo "   ✅ Done"
echo ""

# ── STEP 6: SSL cert for api subdomain ──
echo "🔒 STEP 6: Checking SSL cert for api.thequantsoft.co.in..."
if [ -d "/etc/letsencrypt/live/api.thequantsoft.co.in" ]; then
  echo "   SSL cert already exists, skipping."
else
  echo "   Issuing new SSL cert..."
  sudo certbot certonly --standalone \
    -d api.thequantsoft.co.in \
    --non-interactive --agree-tos \
    -m praveen.kumar@thequantsoft.co.in
  echo "   ✅ SSL cert issued"
fi
echo ""

# ── STEP 7: Build and deploy ──
echo "🚀 STEP 7: Building and deploying all services..."
cd ~/PRISM/prism-analyst-platform
docker compose -f docker-compose.prod.yml up -d --build
echo ""

# ── STEP 8: Wait and verify ──
echo "⏳ STEP 8: Waiting for services to start (15 seconds)..."
sleep 15
echo ""

echo "🩺 Service status:"
docker compose -f docker-compose.prod.yml ps
echo ""

echo "🔍 Health checks:"

if curl -sf -o /dev/null http://localhost:4000 2>/dev/null; then
  echo "   ✅ Landing   (localhost:4000) — healthy"
else
  echo "   ❌ Landing   (localhost:4000) — FAILED"
fi

if curl -sf -o /dev/null http://localhost:3000 2>/dev/null; then
  echo "   ✅ Frontend  (localhost:3000) — healthy"
else
  echo "   ❌ Frontend  (localhost:3000) — FAILED"
fi

HEALTH=$(curl -sf http://localhost:8000/health 2>/dev/null)
if echo "$HEALTH" | grep -q '"status":"ok"'; then
  echo "   ✅ Backend   (localhost:8000) — healthy"
else
  echo "   ❌ Backend   (localhost:8000) — FAILED"
fi

echo ""
echo "🌐 External URLs (test from browser):"
echo "   https://thequantsoft.co.in"
echo "   https://prism.thequantsoft.co.in"
echo "   https://api.thequantsoft.co.in/health"
echo ""
echo "═══════════════════════════════════════════════════════"
echo "  ✅ PRISM deployment complete!"
echo "═══════════════════════════════════════════════════════"
echo ""
