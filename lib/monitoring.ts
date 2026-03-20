import { readLocalStorage, writeLocalStorage } from "./browser-storage";

const SESSION_ID_STORAGE_KEY = "grain:monitoring-session-id";

function readEnv(name: keyof NodeJS.ProcessEnv) {
  const value = process.env[name];
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed || undefined;
}

export function getMonitoringDsn() {
  return readEnv("NEXT_PUBLIC_SENTRY_DSN");
}

export function getMonitoringEnvironment() {
  return readEnv("VERCEL_ENV") ?? readEnv("NODE_ENV") ?? "production";
}

export function getMonitoringRelease() {
  return readEnv("SENTRY_RELEASE") ?? readEnv("VERCEL_GIT_COMMIT_SHA");
}

export function getDeploymentTags() {
  return Object.fromEntries(
    Object.entries({
      vercel_env: readEnv("VERCEL_ENV"),
      vercel_target_env: readEnv("VERCEL_TARGET_ENV"),
      vercel_url: readEnv("VERCEL_URL"),
      vercel_deployment_id: readEnv("VERCEL_DEPLOYMENT_ID"),
      vercel_git_commit_ref: readEnv("VERCEL_GIT_COMMIT_REF"),
      vercel_git_commit_sha: readEnv("VERCEL_GIT_COMMIT_SHA"),
    }).filter(([, value]) => Boolean(value)),
  ) as Record<string, string>;
}

export function getClientSessionId() {
  if (typeof window === "undefined") return undefined;

  const existing = readLocalStorage(SESSION_ID_STORAGE_KEY);
  if (existing) return existing;

  const nextValue =
    typeof crypto !== "undefined" && crypto.randomUUID
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(16).slice(2)}`;

  writeLocalStorage(SESSION_ID_STORAGE_KEY, nextValue);
  return nextValue;
}

export function getClientMonitoringTags() {
  const sessionId = getClientSessionId();
  return {
    ...getDeploymentTags(),
    ...(sessionId ? { grain_session_id: sessionId } : {}),
  };
}
