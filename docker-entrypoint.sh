#!/bin/sh
# Entrypoint script to ensure upload directories exist with correct permissions

# Create directories if they don't exist (works with mounted volumes)
mkdir -p /app/uploads/image /app/uploads/video /app/uploads/document /app/uploads/audio /app/public 2>/dev/null || true

# Start the application
exec node dist/main.js
