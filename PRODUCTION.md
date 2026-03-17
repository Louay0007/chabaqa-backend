# Chabaqa Backend - Production Deployment (Supervisor)

This repository now deploys backend/frontend as native host processes managed by Supervisor.

## Deployment command

```bash
./scripts/deploy-native-apps.sh ./.env.prod
```

The script builds apps, syncs runtime artifacts to `/var/www`, restarts Supervisor programs, verifies runtime env wiring, checks Redis connectivity, and (when enabled) deploys monitoring.

## GitHub Actions deploy

The backend repo workflow `Deploy to VPS` SSHes into the server and runs the VPS-side script:

- `/home/ubuntu/chabaqa/scripts/deploy-from-github.sh`

It then verifies `chabaqa-backend` is `RUNNING` in Supervisor and hits the health endpoint (default `http://127.0.0.1:3000/api/health`).

## Required services on host

- Supervisor (`supervisorctl` available)
- Node.js + npm
- Redis (if `REDIS_ENABLED=true`)
- Nginx (recommended for TLS and routing)
- `apt` access (required when `MONITORING_ENABLED=true` to install/update monitoring packages)

## Health and metrics endpoints

- Health: `GET /api/health`
- System health: `GET /api/health/system`
- Prometheus metrics: `GET /api/metrics/prometheus`

## Monitoring and alerting

Monitoring overlay is in [`monitoring/README.md`](/home/ubuntu/chabaqa/monitoring/README.md).

Enable in `.env.prod`:

```env
MONITORING_ENABLED=true
GRAFANA_ADMIN_PASSWORD=replace_with_strong_password
```

Deploy monitoring only:

```bash
./scripts/deploy-monitoring.sh ./.env.prod
```

Or deploy app + monitoring together:

```bash
./scripts/deploy-native-apps.sh ./.env.prod
```

## Supervisor web UI

Install template config:

```bash
sudo install -m 0640 monitoring/supervisor/supervisor-webui.conf.example /etc/supervisor/conf.d/webui.conf
sudo systemctl restart supervisor
```

## Troubleshooting quick checks

```bash
sudo supervisorctl status chabaqa-backend chabaqa-frontend
curl -fsS http://127.0.0.1:3000/api/health
curl -fsS http://127.0.0.1:3000/api/metrics/prometheus | head -n 20
```
