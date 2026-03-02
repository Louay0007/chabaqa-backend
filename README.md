# Chabaqa Backend

## Email Campaign Delivery Checklist

Use this checklist when campaign emails fail with SMTP auth errors (for example `535-5.7.8 BadCredentials`).

1. Verify SMTP environment variables are set in deployment env (`.env.prod` or your custom deploy env file):
   - `EMAIL_HOST` or `EMAIL_SERVICE`
   - `EMAIL_USER`
   - `EMAIL_PASSWORD` (or `EMAIL_PASS`)
   - Optional: `EMAIL_FROM`, `EMAIL_PORT`, `EMAIL_SECURE`
2. For Gmail:
   - Enable 2FA on the sender account.
   - Use a Gmail App Password (16 characters), not the regular account password.
   - If the password is copied with spaces, backend now normalizes spaces automatically (unless `EMAIL_PASSWORD_STRIP_SPACES=false`).
3. In production:
   - Keep `EMAIL_ALLOW_ETHEREAL_FALLBACK=false` unless you intentionally want test-only delivery fallback.
4. Redeploy backend after env changes.

## Production Deploy Note

`docker-compose.prod.yml` loads backend env from:
1. `chabaqa-backend/.env` (base defaults)
2. `BACKEND_ENV_FILE` (defaults to `./.env.prod`)

During `scripts/deploy-prod.sh`, `BACKEND_ENV_FILE` is set from the env file argument so SMTP credentials in that file are applied to the backend container.
