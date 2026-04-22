import { errorResponse, jsonResponse, methodNotAllowed, optionsResponse, rejectDisallowedOrigin } from "../../_lib/http";
import { listJobsResponse } from "../../_lib/jobs";
import type { PagesContext } from "../../_lib/types";

export const onRequest = async (context: PagesContext) => {
  if (context.request.method === "OPTIONS") return optionsResponse(context.env, context.request);
  const rejected = rejectDisallowedOrigin(context.env, context.request);
  if (rejected) return rejected;
  if (context.request.method !== "GET") return methodNotAllowed(context.env, context.request);

  try {
    const url = new URL(context.request.url);
    const params = url.searchParams;
    return jsonResponse(
      context.env,
      context.request,
      await listJobsResponse(context.env, {
        q: params.get("q"),
        location: params.get("location"),
        min_score: params.get("min_score") ? Number(params.get("min_score")) : 0,
        max_score: params.get("max_score") ? Number(params.get("max_score")) : null,
        remote_policy: params.getAll("remote_policy"),
        date_posted_days: params.get("date_posted_days") ? Number(params.get("date_posted_days")) : null,
        action_status: params.getAll("action_status"),
        sort: params.get("sort") ?? "top",
        limit: params.get("limit") ? Number(params.get("limit")) : 200,
        live_search: params.get("live_search") === "true",
        max_years_required: params.get("max_years_required") ? Number(params.get("max_years_required")) : null,
        min_compensation: params.get("min_compensation") ? Number(params.get("min_compensation")) : null,
        seniority_level: params.getAll("seniority_level"),
        company_stage: params.getAll("company_stage"),
        hide_unknown_compensation: params.get("hide_unknown_compensation") === "true",
      }),
    );
  } catch (error) {
    return errorResponse(context.env, context.request, error, 400);
  }
};
