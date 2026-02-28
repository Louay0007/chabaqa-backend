const LOCALHOST_ORIGINS = [
  'http://localhost:3000',
  'http://localhost:3001',
  'http://localhost:8080',
  'http://127.0.0.1:3000',
  'http://127.0.0.1:3001',
  'http://127.0.0.1:8080',
];

const INSECURE_SECRET_VALUES = new Set([
  'your-secret-key',
  'your-refresh-secret-key',
  'media-dev-secret',
  'change-me',
  'changeme',
  'secret',
  'test',
]);

function normalizeOrigin(origin: string): string | null {
  try {
    const parsed = new URL(origin.trim());
    return `${parsed.protocol}//${parsed.host}`;
  } catch {
    return null;
  }
}

function parseOrigins(raw?: string): string[] {
  if (!raw) return [];
  return raw
    .split(',')
    .map((entry) => normalizeOrigin(entry))
    .filter((entry): entry is string => Boolean(entry));
}

export function isProductionEnvironment(): boolean {
  return process.env.NODE_ENV === 'production';
}

export function getAllowedCorsOrigins(): string[] {
  const configured = [
    ...parseOrigins(process.env.FRONTEND_URL),
    ...parseOrigins(process.env.NEXT_PUBLIC_APP_URL),
    ...parseOrigins(process.env.CORS_ALLOWED_ORIGINS),
  ];

  if (!isProductionEnvironment()) {
    configured.push(...LOCALHOST_ORIGINS);
  }

  return Array.from(new Set(configured));
}

export function isCorsOriginAllowed(origin: string | undefined, allowlist: string[]): boolean {
  if (!origin) {
    return true;
  }

  const normalized = normalizeOrigin(origin);
  if (!normalized) {
    return false;
  }

  return allowlist.includes(normalized);
}

export function getRequiredSecret(
  envName: string,
  options?: { devFallback?: string; allowInsecureInDev?: boolean },
): string {
  const value = process.env[envName]?.trim();
  const isProduction = isProductionEnvironment();

  if (value) {
    if (isProduction && INSECURE_SECRET_VALUES.has(value.toLowerCase())) {
      throw new Error(`[SECURITY] ${envName} is set to an insecure default value`);
    }
    return value;
  }

  if (!isProduction && options?.devFallback) {
    if (!options.allowInsecureInDev) {
      console.warn(`[SECURITY] ${envName} is missing. Using development fallback value.`);
    }
    return options.devFallback;
  }

  throw new Error(`[SECURITY] Missing required secret: ${envName}`);
}

export function getJwtSecret(): string {
  return getRequiredSecret('JWT_SECRET', {
    devFallback: 'local-dev-jwt-secret-change-me',
  });
}

export function getJwtRefreshSecret(): string {
  return getRequiredSecret('JWT_REFRESH_SECRET', {
    devFallback: 'local-dev-jwt-refresh-secret-change-me',
  });
}

export function getMediaPrivateTokenSecret(): string {
  return process.env.MEDIA_PRIVATE_TOKEN_SECRET?.trim()
    || getJwtSecret();
}

export function isSwaggerEnabled(): boolean {
  if (!isProductionEnvironment()) {
    return true;
  }
  return process.env.ENABLE_SWAGGER === 'true';
}

