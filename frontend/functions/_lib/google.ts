import { getOptionalEnv, getRequiredEnv } from "./env";
import type { CloudflareEnv } from "./types";
import { consumeGoogleOAuthState, getGoogleToken, saveGoogleOAuthState, saveGoogleToken, type JobRecord } from "./supabase";

const SCOPES = [
  "https://www.googleapis.com/auth/gmail.send",
  "https://www.googleapis.com/auth/calendar.events",
];

function base64UrlEncode(bytes: Uint8Array): string {
  let binary = "";
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function buildRedirectUri(env: CloudflareEnv, request: Request): string {
  return getOptionalEnv(env, "GOOGLE_REDIRECT_URI") ?? `${new URL(request.url).origin}/api/auth/google/callback`;
}

function isTokenValid(expiryDate: string | null): boolean {
  if (!expiryDate) return false;
  return new Date(expiryDate).getTime() - 60_000 > Date.now();
}

async function refreshAccessToken(env: CloudflareEnv) {
  const existing = await getGoogleToken(env);
  if (!existing?.refresh_token) {
    throw new Error("Google OAuth token not found. Complete /api/auth/google/start first.");
  }

  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: getRequiredEnv(env, "GOOGLE_CLIENT_ID"),
      client_secret: getRequiredEnv(env, "GOOGLE_CLIENT_SECRET", "GOOGLE_CLIENT_Secret"),
      refresh_token: existing.refresh_token,
      grant_type: "refresh_token",
    }),
  });

  if (!response.ok) {
    throw new Error(`Google token refresh failed with status ${response.status}`);
  }

  const payload = (await response.json()) as {
    access_token?: string;
    expires_in?: number;
    token_type?: string;
    scope?: string;
  };
  const refreshedAccessToken = payload.access_token ?? existing.access_token ?? null;
  const emailFrom =
    existing.email_from ??
    (refreshedAccessToken ? await fetchAuthenticatedEmail(env, refreshedAccessToken) : null);

  const updated = await saveGoogleToken(env, {
    access_token: refreshedAccessToken,
    refresh_token: existing.refresh_token,
    token_type: payload.token_type ?? existing.token_type,
    scope: payload.scope ?? existing.scope,
    expiry_date: payload.expires_in ? new Date(Date.now() + payload.expires_in * 1000).toISOString() : existing.expiry_date,
    email_from: emailFrom,
  });

  if (!updated.access_token) {
    throw new Error("Google access token is unavailable after refresh");
  }

  return updated;
}

async function getAccessToken(env: CloudflareEnv): Promise<string> {
  const token = await getGoogleToken(env);
  if (!token?.access_token && !token?.refresh_token) {
    throw new Error("Google OAuth token not found. Complete /api/auth/google/start first.");
  }
  if (token?.access_token && isTokenValid(token.expiry_date)) {
    return token.access_token;
  }
  return (await refreshAccessToken(env)).access_token ?? "";
}

async function googleJsonRequest<T>(
  env: CloudflareEnv,
  input: RequestInfo | URL,
  init?: RequestInit,
): Promise<T> {
  const accessToken = await getAccessToken(env);
  const response = await fetch(input, {
    ...init,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
  if (!response.ok) {
    const body = await response.text();
    throw new Error(body || `Google API request failed with status ${response.status}`);
  }
  return (await response.json()) as T;
}

async function fetchAuthenticatedEmail(env: CloudflareEnv, accessToken: string): Promise<string | null> {
  try {
    const response = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/profile", {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });
    if (!response.ok) return null;
    const payload = (await response.json()) as { emailAddress?: string };
    return payload.emailAddress ?? null;
  } catch {
    return null;
  }
}

function fiveBusinessDaysOut(): Date {
  const current = new Date();
  current.setHours(9, 30, 0, 0);
  let added = 0;
  while (added < 5) {
    current.setDate(current.getDate() + 1);
    const day = current.getDay();
    if (day !== 0 && day !== 6) {
      added += 1;
    }
  }
  return current;
}

export async function googleAuthStatus(env: CloudflareEnv): Promise<{ configured: boolean; authenticated: boolean; token_path: string | null; email_from: string | null }> {
  const configured = Boolean(getOptionalEnv(env, "GOOGLE_CLIENT_ID") && getOptionalEnv(env, "GOOGLE_CLIENT_SECRET", "GOOGLE_CLIENT_Secret"));
  if (!configured) {
    return { configured: false, authenticated: false, token_path: null, email_from: null };
  }
  const token = await getGoogleToken(env);
  const authenticated = Boolean(token && (isTokenValid(token.expiry_date) || token.refresh_token));
  return {
    configured: true,
    authenticated,
    token_path: null,
    email_from: token?.email_from ?? null,
  };
}

export async function buildGoogleAuthorizationUrl(env: CloudflareEnv, request: Request): Promise<string> {
  const clientId = getRequiredEnv(env, "GOOGLE_CLIENT_ID");
  const clientSecret = getRequiredEnv(env, "GOOGLE_CLIENT_SECRET", "GOOGLE_CLIENT_Secret");
  if (!clientId || !clientSecret) {
    throw new Error("Google OAuth is not configured");
  }

  const state = crypto.randomUUID();
  await saveGoogleOAuthState(env, state);

  const redirectUri = buildRedirectUri(env, request);
  const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("access_type", "offline");
  url.searchParams.set("include_granted_scopes", "true");
  url.searchParams.set("prompt", "consent");
  url.searchParams.set("scope", SCOPES.join(" "));
  url.searchParams.set("state", state);
  return url.toString();
}

export async function exchangeGoogleCode(
  env: CloudflareEnv,
  request: Request,
  code: string,
  state: string | null,
): Promise<void> {
  if (!state) {
    throw new Error("Google OAuth state missing");
  }
  const matched = await consumeGoogleOAuthState(env, state);
  if (!matched) {
    throw new Error("Google OAuth state mismatch");
  }

  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: getRequiredEnv(env, "GOOGLE_CLIENT_ID"),
      client_secret: getRequiredEnv(env, "GOOGLE_CLIENT_SECRET", "GOOGLE_CLIENT_Secret"),
      code,
      grant_type: "authorization_code",
      redirect_uri: buildRedirectUri(env, request),
    }),
  });
  if (!response.ok) {
    throw new Error(`Google token exchange failed with status ${response.status}`);
  }
  const payload = (await response.json()) as {
    access_token?: string;
    refresh_token?: string;
    expires_in?: number;
    token_type?: string;
    scope?: string;
  };
  const emailFrom = payload.access_token ? await fetchAuthenticatedEmail(env, payload.access_token) : null;
  await saveGoogleToken(env, {
    access_token: payload.access_token ?? null,
    refresh_token: payload.refresh_token ?? null,
    token_type: payload.token_type ?? null,
    scope: payload.scope ?? null,
    expiry_date: payload.expires_in ? new Date(Date.now() + payload.expires_in * 1000).toISOString() : null,
    email_from: emailFrom ?? getOptionalEnv(env, "EMAIL_FROM") ?? null,
  });
}

export async function sendGoogleEmail(
  env: CloudflareEnv,
  payload: { to_email: string; subject: string; body: string },
): Promise<{ id?: string | null }> {
  const from = (await getGoogleToken(env))?.email_from ?? getOptionalEnv(env, "EMAIL_FROM");
  const lines = [
    `To: ${payload.to_email}`,
    ...(from ? [`From: ${from}`] : []),
    `Subject: ${payload.subject}`,
    "Content-Type: text/plain; charset=utf-8",
    "",
    payload.body,
  ];
  const raw = base64UrlEncode(new TextEncoder().encode(lines.join("\r\n")));
  return googleJsonRequest<{ id?: string | null }>(
    env,
    "https://gmail.googleapis.com/gmail/v1/users/me/messages/send",
    {
      method: "POST",
      body: JSON.stringify({ raw }),
    },
  );
}

export async function createFollowUpEvent(
  env: CloudflareEnv,
  job: JobRecord,
  actionLabel: string,
): Promise<{ id?: string | null; htmlLink?: string | null }> {
  const start = fiveBusinessDaysOut();
  const end = new Date(start.getTime() + 30 * 60 * 1000);
  const calendarId = getOptionalEnv(env, "GOOGLE_CALENDAR_ID") ?? "primary";
  const timeZone = getOptionalEnv(env, "GOOGLE_CALENDAR_TIMEZONE") ?? "America/New_York";
  const encodedCalendarId = encodeURIComponent(calendarId);
  return googleJsonRequest<{ id?: string | null; htmlLink?: string | null }>(
    env,
    `https://www.googleapis.com/calendar/v3/calendars/${encodedCalendarId}/events`,
    {
      method: "POST",
      body: JSON.stringify({
        summary: `Follow up: ${job.company} — ${job.title}`,
        description: `Action: ${actionLabel}\nJob URL: ${job.jd_url}`,
        start: { dateTime: start.toISOString(), timeZone },
        end: { dateTime: end.toISOString(), timeZone },
      }),
    },
  );
}
