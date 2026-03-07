export interface WatchTimePolicyInput {
  currentWatchTimeSeconds: number;
  requestedWatchTimeSeconds: number;
  lastAcceptedAt?: Date | null;
  maxDurationSeconds?: number;
  now?: Date;
}

export interface WatchTimePolicyResult {
  acceptedWatchTimeSeconds: number;
  acceptedAdvanceSeconds: number;
  ignored: boolean;
  maxAllowedAdvanceSeconds: number;
}

const MAX_CLOCK_SKEW_BUFFER_SECONDS = 15;
const MIN_ALLOWED_ADVANCE_SECONDS = 45;
const MAX_ALLOWED_ADVANCE_SECONDS = 300;

const normalizeWholeSeconds = (value: number): number => {
  if (!Number.isFinite(value) || value <= 0) {
    return 0;
  }
  return Math.floor(value);
};

export const computeAllowedWatchAdvanceSeconds = (elapsedSeconds: number): number => {
  const normalizedElapsed = normalizeWholeSeconds(elapsedSeconds);
  return Math.min(
    MAX_ALLOWED_ADVANCE_SECONDS,
    Math.max(MIN_ALLOWED_ADVANCE_SECONDS, normalizedElapsed + MAX_CLOCK_SKEW_BUFFER_SECONDS),
  );
};

export const applyWatchTimePolicy = (
  input: WatchTimePolicyInput,
): WatchTimePolicyResult => {
  const now = input.now instanceof Date ? input.now : new Date();
  const currentWatchTimeSeconds = normalizeWholeSeconds(input.currentWatchTimeSeconds);
  const requestedWatchTimeSeconds = normalizeWholeSeconds(input.requestedWatchTimeSeconds);
  const maxDurationSeconds = normalizeWholeSeconds(input.maxDurationSeconds || 0);

  const boundedRequestedWatchTimeSeconds =
    maxDurationSeconds > 0
      ? Math.min(requestedWatchTimeSeconds, maxDurationSeconds)
      : requestedWatchTimeSeconds;

  if (boundedRequestedWatchTimeSeconds <= currentWatchTimeSeconds) {
    return {
      acceptedWatchTimeSeconds: currentWatchTimeSeconds,
      acceptedAdvanceSeconds: 0,
      ignored: true,
      maxAllowedAdvanceSeconds: computeAllowedWatchAdvanceSeconds(0),
    };
  }

  const elapsedMilliseconds =
    input.lastAcceptedAt instanceof Date
      ? Math.max(0, now.getTime() - input.lastAcceptedAt.getTime())
      : 0;
  const elapsedSeconds = Math.floor(elapsedMilliseconds / 1000);
  const maxAllowedAdvanceSeconds = computeAllowedWatchAdvanceSeconds(elapsedSeconds);
  const requestedAdvanceSeconds = boundedRequestedWatchTimeSeconds - currentWatchTimeSeconds;

  return {
    acceptedWatchTimeSeconds: boundedRequestedWatchTimeSeconds,
    acceptedAdvanceSeconds: requestedAdvanceSeconds,
    ignored: false,
    maxAllowedAdvanceSeconds,
  };
};
