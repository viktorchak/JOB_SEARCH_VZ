export interface CloudflareEnv {
  SUPABASE_URL?: string;
  SUPABASE_SERVICE_ROLE_KEY?: string;
  SUPABASE_SERVICE_KEY?: string;
  GEMINI_API_KEY?: string;
  GEMINI_MODEL?: string;
  JSEARCH_API_KEY?: string;
  GOOGLE_CLIENT_ID?: string;
  GOOGLE_CLIENT_SECRET?: string;
  GOOGLE_CLIENT_Secret?: string;
  GOOGLE_REDIRECT_URI?: string;
  GOOGLE_CALENDAR_ID?: string;
  GOOGLE_CALENDAR_TIMEZONE?: string;
  EMAIL_FROM?: string;
  RUBRIC_VERSION?: string;
  CORS_ALLOWED_ORIGINS?: string;
}

export interface PagesContext<Params extends Record<string, string | undefined> = Record<string, string | undefined>> {
  request: Request;
  env: CloudflareEnv;
  params: Params;
  waitUntil?: (promise: Promise<unknown>) => void;
}
