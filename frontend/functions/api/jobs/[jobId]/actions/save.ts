import { saveJob } from "../../../../_lib/jobs";
import { errorResponse, jsonResponse, methodNotAllowed, optionsResponse, rejectDisallowedOrigin } from "../../../../_lib/http";
import type { PagesContext } from "../../../../_lib/types";

export const onRequest = async (context: PagesContext<{ jobId?: string }>) => {
  if (context.request.method === "OPTIONS") return optionsResponse(context.env, context.request);
  const rejected = rejectDisallowedOrigin(context.env, context.request);
  if (rejected) return rejected;
  if (context.request.method !== "POST") return methodNotAllowed(context.env, context.request);

  try {
    const jobId = context.params.jobId;
    if (!jobId) {
      throw new Error("Job id missing");
    }
    return jsonResponse(context.env, context.request, await saveJob(context.env, jobId));
  } catch (error) {
    const status = error instanceof Error && error.message === "Job not found" ? 404 : 400;
    return errorResponse(context.env, context.request, error, status);
  }
};
