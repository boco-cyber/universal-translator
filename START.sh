#!/usr/bin/env bash
set -e

echo ""
echo " ========================================"
echo "  Universal AI Translator - Starting up"
echo " ========================================"
echo ""

# Check Node.js
if ! command -v node &> /dev/null; then
    echo " [ERROR] Node.js not found!"
    echo " Please install Node.js from https://nodejs.org"
    exit 1
fi

# Install dependencies if missing
if [ ! -d "node_modules" ]; then
    echo " Installing dependencies..."
    npm install
fi

# Create data dirs
mkdir -p data/uploads

# Start server and open browser
echo " Starting server on http://localhost:3333"
echo ""

# Open browser
if command -v xdg-open &> /dev/null; then
    sleep 1 && xdg-open http://localhost:3333 &
elif command -v open &> /dev/null; then
    sleep 1 && open http://localhost:3333 &
fi

node server.js
