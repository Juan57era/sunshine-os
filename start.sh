#!/bin/bash
# SUNSHINE OS — Start dev server + tunnel for phone access
# Run: ./start.sh

cd "$(dirname "$0")"

echo "☀️  Starting SUNSHINE OS..."

# Kill any existing processes
lsof -ti:3000 | xargs kill -9 2>/dev/null
pkill -f "lt --port 3000" 2>/dev/null

sleep 1

# Start dev server
npm run dev &
DEV_PID=$!

sleep 4

# Start tunnel
lt --port 3000 --subdomain sunshine-ops 2>/dev/null &
TUNNEL_PID=$!

sleep 3

# Get tunnel URL
TUNNEL_URL=$(curl -s http://localhost:3000 -o /dev/null -w "%{url}" 2>/dev/null)

echo ""
echo "═══════════════════════════════════════"
echo "  SUNSHINE OS — ONLINE"
echo "═══════════════════════════════════════"
echo ""
echo "  Local:   http://localhost:3000"
echo "  Phone:   Check tunnel output above"
echo "  Vercel:  https://sunshine-os.vercel.app"
echo ""
echo "  PIN: 5757"
echo ""
echo "  Press Ctrl+C to stop"
echo "═══════════════════════════════════════"
echo ""

# Wait for Ctrl+C
trap "kill $DEV_PID $TUNNEL_PID 2>/dev/null; echo ''; echo 'SUNSHINE OS stopped.'; exit 0" INT
wait
