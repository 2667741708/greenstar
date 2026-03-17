#!/bin/bash
ulimit -n 65536
echo "Starting Vite..."
npm run dev -- --host 0.0.0.0
echo "Vite exited with code $?"
# Keep the session open so we can read the logs if it crashes
sleep 3600
