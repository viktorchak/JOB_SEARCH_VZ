import { errorResponse, jsonResponse, methodNotAllowed, optionsResponse, readJson, rejectDisallowedOrigin } from "../_lib/http";
import { getProfile, updateProfile } from "../_lib/jobs";
import type { PagesContext } from "../_lib/types";

export const onRequest = async (context: PagesContext) => {
  if (context.request.method === "OPTIONS") return optionsResponse(context.env, context.request);
  const rejected = rejectDisallowedOrigin(context.env, context.request);
  if (rejected) return rejected;

  try {
    if (context.request.method === "GET") {
      return jsonResponse(context.env, context.request, await getProfile(context.env));
    }
    if (context.request.method === "PUT") {
      const payload = await readJson<{
        primary_job_family: string;
        seniority_level: string;
        years_experience_bucket: string;
        compensation_floor: number | null;
        company_stage_preference: string;
        career_priority: string;
      }>(context.request);
      return jsonResponse(context.env, context.request, await updateProfile(context.env, payload));
    }
    return methodNotAllowed(context.env, context.request);
  } catch (error) {
    return errorResponse(context.env, context.request, error, 400);
  }
};
