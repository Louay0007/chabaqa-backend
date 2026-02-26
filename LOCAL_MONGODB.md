# Local MongoDB Workflow

This project can run a local MongoDB stack for development without touching Atlas.

## 1) Start local MongoDB + mongo-express

From `chabaqa-backend/`:

```bash
npm run db:up
```

Services:
- MongoDB: `127.0.0.1:27017`
- mongo-express UI: `http://localhost:8081`

Credentials come from `.env.local-db`:
- `MONGO_EXPRESS_USER`
- `MONGO_EXPRESS_PASS`

## 2) Local env overrides

Create local override file from example:

```bash
cp .env.local-db.example .env.local-db
```

Expected defaults:

```env
MONGO_URI=mongodb://127.0.0.1:27017/chabaqa_local
DB_NAME=chabaqa_local
ALLOW_REMOTE_WIPE=false
SAMPLE_LIMIT=5
```

Env loading order for local DB commands:
1. `.env`
2. `.env.local-db` (overrides `.env`)

## 3) Run backend against local MongoDB

```bash
npm run start:dev:localdb
```

## 4) Inspect collections and data

CLI inspection:

```bash
npm run db:inspect
```

Output includes:
- Collection list
- Document count per collection
- Sample documents (limited by `SAMPLE_LIMIT`)

UI inspection:
- Open `http://localhost:8081`
- Browse collections/documents from `chabaqa_local`

## 5) Fresh start / wipe database

Dry run (safe default):

```bash
npm run db:wipe:dry
```

Execute wipe:

```bash
npm run db:wipe
```

Safety behavior:
- Wipe is blocked for non-local hosts unless `ALLOW_REMOTE_WIPE=true`
- Script prints target host and DB before deletion

## 6) Seed baseline data

Seed plans + achievements:

```bash
npm run db:seed
```

Or individually:

```bash
npm run db:seed:plans
npm run db:seed:achievements
```

Expected collections after seed:
- `plans`
- `achievements`

## 7) Stop stack / logs

```bash
npm run db:logs
npm run db:down
```
