#!/bin/bash
# Navigate to the folder containing your HTML file
cd /home/$USER/Documents

# Start python server in background (port 8000)
python -m http.server 8000 &

# Wait a second for it to initialize
sleep 3

# Open your default browser to the dashboard
xdg-open http://localhost:8000/astro.html
