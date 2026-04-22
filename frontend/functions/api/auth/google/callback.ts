import { exchangeGoogleCode } from "../../../_lib/google";
import { errorResponse, methodNotAllowed, optionsResponse, rejectDisallowedOrigin, textResponse } from "../../../_lib/http";
import type { PagesContext } from "../../../_lib/types";

export const onRequest = async (context: PagesContext) => {
  if (context.request.method === "OPTIONS") return optionsResponse(context.env, context.request);
  const rejected = rejectDisallowedOrigin(context.env, context.request);
  if (rejected) return rejected;
  if (context.request.method !== "GET") return methodNotAllowed(context.env, context.request);

  try {
    const url = new URL(context.request.url);
    const code = url.searchParams.get("code");
    const state = url.searchParams.get("state");
    if (!code) {
      throw new Error("Google OAuth code missing");
    }
    await exchangeGoogleCode(context.env, context.request, code, state);
    return textResponse(
      context.env,
      context.request,
      `
        <html>
          <body style="font-family: sans-serif; padding: 24px;">
            <h2>Google authentication complete.</h2>
            <p>You can close this tab and return to the dashboard.</p>
          </body>
        </html>
      `,
    );
  } catch (error) {
    return errorResponse(context.env, context.request, error, 400);
  }
};
