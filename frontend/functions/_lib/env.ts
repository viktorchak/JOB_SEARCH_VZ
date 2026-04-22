import type { CloudflareEnv } from "./types";

function readEnvValue(env: CloudflareEnv, key: keyof CloudflareEnv): string | undefined {
  const value = env[key];
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed ? trimmed : undefined;
}

export function getRequiredEnv(env: CloudflareEnv, ...keys: Array<keyof CloudflareEnv>): string {
  for (const key of keys) {
    const value = readEnvValue(env, key);
    if (value) return value;
  }
  throw new Error(`Missing required environment variable: ${keys.join(" or ")}`);
}

export function getOptionalEnv(env: CloudflareEnv, ...keys: Array<keyof CloudflareEnv>): string | undefined {
  for (const key of keys) {
    const value = readEnvValue(env, key);
    if (value) return value;
  }
  return undefined;
}

export function parseCsv(value: string | undefined): string[] {
  if (!value) return [];
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}
