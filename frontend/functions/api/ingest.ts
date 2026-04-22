import { errorResponse, jsonResponse, methodNotAllowed, optionsResponse, rejectDisallowedOrigin } from "../_lib/http";
import { ingestAll } from "../_lib/jobs";
import type { PagesContext } from "../_lib/types";

export const onRequest = async (context: PagesContext) => {
  if (context.request.method === "OPTIONS") return optionsResponse(context.env, context.request);
  const rejected = rejectDisallowedOrigin(context.env, context.request);
  if (rejected) return rejected;
  if (context.request.method !== "POST") return methodNotAllowed(context.env, context.request);

  try {
    return jsonResponse(context.env, context.request, await ingestAll(context.env));
  } catch (error) {
    return errorResponse(context.env, context.request, error, 500);
  }
};
