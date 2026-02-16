# Chabaqa Backend - Production Deployment

## Prerequisites

- Docker Desktop installed and running
- MongoDB Atlas account (connection string configured in `.env`)

## Quick Start

```bash
# Deploy (build & start)
deploy.cmd up

# Or on Linux/Mac
docker compose up -d --build
```

## Commands

| Command | Description |
|---------|-------------|
| `deploy.cmd up` | Build and start all containers |
| `deploy.cmd stop` | Stop all containers |
| `deploy.cmd restart` | Restart containers |
| `deploy.cmd logs` | View backend logs |
| `deploy.cmd status` | Check container status |
| `deploy.cmd build` | Rebuild without cache |

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                     Docker Network                       │
│  ┌─────────────────┐       ┌─────────────────┐          │
│  │   Backend:3000  │──────▶│   Redis:6379    │          │
│  └────────┬────────┘       └─────────────────┘          │
│           │                                             │
│           ▼                                             │
│  ┌─────────────────┐                                    │
│  │   Dozzle:8080   │                                    │
│  └─────────────────┘                                    │
└───────────┼─────────────────────────────────────────────┘
            │
            ▼
    ┌───────────────────┐
    │  MongoDB Atlas    │
    │  (Cloud Database) │
    └───────────────────┘
```

## Environment Variables

Key variables in `.env`:

| Variable | Description |
|----------|-------------|
| `MONGO_URI` | MongoDB Atlas connection string |
| `NODE_ENV` | Set to `production` |
| `PORT` | Backend port (default: 3000) |
| `REDIS_PASSWORD` | Redis authentication password |
| `HTTP_ACCESS_LOG` | Enable request/response access logs (default: `true`) |
| `DOZZLE_PORT` | Local bind port for Dozzle UI (default: `8088`) |
| `DOZZLE_FILTER` | Docker filter used by Dozzle (`name=chabaqa-`) |

## Health Check

```bash
curl http://localhost:3000/api/health
```

## Dozzle (Backend Inspection UI)

Dozzle is included in `docker-compose.yml` to inspect container logs and runtime stats.

- Public URL: `http://api.chabaqa.io:8088`

### What to inspect

- **Backend responses/statuses**: stream `chabaqa-backend` logs (enabled by `HTTP_ACCESS_LOG=true`)
- **Container stats**: CPU/memory in Dozzle container view
- **App metrics endpoint**: `GET /api/metrics` and `GET /api/metrics/system`

## Logs

```bash
# All logs
docker compose logs

# Backend only (follow mode)
docker logs -f chabaqa-backend

# Redis logs
docker logs chabaqa-redis
```

## Troubleshooting

### Backend won't start
1. Check logs: `docker logs chabaqa-backend`
2. Verify MongoDB Atlas connection string in `.env`
3. Ensure Atlas whitelist includes your server IP

### Redis connection failed
1. Check Redis is running: `docker compose ps`
2. Verify password matches in `.env` and `docker-compose.yml`
