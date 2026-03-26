#!/bin/bash

# Get the directory where this script is located
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

# Navigate to the project root (one level up from scripts/)
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

# Navigate to the src folder where astro.html lives
cd "$PROJECT_ROOT/src" || exit 1

# Start python server in background on port 8000
python3 -m http.server 8000 &

# Wait a moment for the server to start
sleep 2

# Open the default browser to the dashboard
if command -v xdg-open >/dev/null 2>&1; then
    xdg-open http://localhost:8000/astro.html
elif command -v open >/dev/null 2>&1; then
    open http://localhost:8000/astro.html   # macOS fallback
else
    echo "Open your browser and go to: http://localhost:8000/astro.html"
fi
