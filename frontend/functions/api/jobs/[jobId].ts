import { errorResponse, jsonResponse, methodNotAllowed, optionsResponse, rejectDisallowedOrigin } from "../../_lib/http";
import { getJobDetailResponse } from "../../_lib/jobs";
import type { PagesContext } from "../../_lib/types";

export const onRequest = async (context: PagesContext<{ jobId?: string }>) => {
  if (context.request.method === "OPTIONS") return optionsResponse(context.env, context.request);
  const rejected = rejectDisallowedOrigin(context.env, context.request);
  if (rejected) return rejected;
  if (context.request.method !== "GET") return methodNotAllowed(context.env, context.request);

  try {
    const jobId = context.params.jobId;
    if (!jobId) {
      throw new Error("Job id missing");
    }
    const detail = await getJobDetailResponse(context.env, jobId);
    if (!detail) {
      return jsonResponse(context.env, context.request, { detail: "Job not found" }, 404);
    }
    return jsonResponse(context.env, context.request, detail);
  } catch (error) {
    return errorResponse(context.env, context.request, error, 400);
  }
};
