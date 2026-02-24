#!/bin/sh
# Entrypoint script to ensure upload directories exist with correct permissions

# Create directories if they don't exist (works with mounted volumes)
mkdir -p /app/uploads/image /app/uploads/video /app/uploads/document /app/uploads/audio /app/public 2>/dev/null || true

# Start the application (compatible with both Nest output layouts)
if [ -f /app/dist/src/main.js ]; then
  exec node /app/dist/src/main.js
fi

if [ -f /app/dist/main.js ]; then
  exec node /app/dist/main.js
fi

echo "Error: unable to find NestJS entrypoint in /app/dist"
find /app/dist -maxdepth 2 -type f | head -n 30
exit 1
