import { parseCsv } from "./env";
import type { CloudflareEnv } from "./types";

function buildAllowedOrigins(env: CloudflareEnv, request: Request): Set<string> {
  const allowed = new Set(parseCsv(env.CORS_ALLOWED_ORIGINS));
  const requestUrl = new URL(request.url);
  allowed.add(requestUrl.origin);
  return allowed;
}

export function isOriginAllowed(env: CloudflareEnv, request: Request): boolean {
  const origin = request.headers.get("origin");
  if (!origin) return true;
  return buildAllowedOrigins(env, request).has(origin);
}

export function buildCorsHeaders(env: CloudflareEnv, request: Request): HeadersInit {
  const origin = request.headers.get("origin");
  const allowedOrigins = buildAllowedOrigins(env, request);
  const headers: Record<string, string> = {
    "Access-Control-Allow-Methods": "GET,POST,PUT,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Max-Age": "86400",
  };
  if (origin && allowedOrigins.has(origin)) {
    headers["Access-Control-Allow-Origin"] = origin;
    headers["Vary"] = "Origin";
  }
  return headers;
}

export function optionsResponse(env: CloudflareEnv, request: Request): Response {
  return new Response(null, {
    status: 204,
    headers: buildCorsHeaders(env, request),
  });
}

export function rejectDisallowedOrigin(env: CloudflareEnv, request: Request): Response | null {
  if (isOriginAllowed(env, request)) return null;
  return jsonResponse(env, request, { detail: "Origin not allowed" }, 403);
}

export function jsonResponse(env: CloudflareEnv, request: Request, payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      "Content-Type": "application/json",
      ...buildCorsHeaders(env, request),
    },
  });
}

export function textResponse(env: CloudflareEnv, request: Request, body: string, status = 200): Response {
  return new Response(body, {
    status,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      ...buildCorsHeaders(env, request),
    },
  });
}

export function methodNotAllowed(env: CloudflareEnv, request: Request): Response {
  return jsonResponse(env, request, { detail: "Method not allowed" }, 405);
}

export async function readJson<T>(request: Request): Promise<T> {
  return (await request.json()) as T;
}

export function errorResponse(env: CloudflareEnv, request: Request, error: unknown, status = 400): Response {
  const detail = error instanceof Error ? error.message : "Something went wrong";
  return jsonResponse(env, request, { detail }, status);
}
