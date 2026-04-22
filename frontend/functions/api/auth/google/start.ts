import { buildGoogleAuthorizationUrl } from "../../../_lib/jobs";
import { errorResponse, jsonResponse, methodNotAllowed, optionsResponse, rejectDisallowedOrigin } from "../../../_lib/http";
import type { PagesContext } from "../../../_lib/types";

export const onRequest = async (context: PagesContext) => {
  if (context.request.method === "OPTIONS") return optionsResponse(context.env, context.request);
  const rejected = rejectDisallowedOrigin(context.env, context.request);
  if (rejected) return rejected;
  if (context.request.method !== "GET") return methodNotAllowed(context.env, context.request);

  try {
    return jsonResponse(context.env, context.request, {
      authorization_url: await buildGoogleAuthorizationUrl(context.env, context.request),
    });
  } catch (error) {
    return errorResponse(context.env, context.request, error, 400);
  }
};
