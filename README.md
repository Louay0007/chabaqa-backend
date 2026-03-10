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

Supervisor-native deploy reads env from:
1. your deploy env file argument (for example `./.env.prod`)
2. `chabaqa-backend/.env` (must not conflict with shared runtime values)

During `scripts/deploy-native-apps.sh`, shared env variables are loaded from the env file argument so SMTP credentials and related settings are applied during build/runtime sync.
