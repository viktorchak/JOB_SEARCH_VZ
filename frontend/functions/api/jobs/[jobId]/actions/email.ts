import { emailReferral } from "../../../../_lib/jobs";
import { errorResponse, jsonResponse, methodNotAllowed, optionsResponse, readJson, rejectDisallowedOrigin } from "../../../../_lib/http";
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
    const payload = await readJson<{ to_email: string; subject: string; body: string }>(context.request);
    return jsonResponse(context.env, context.request, await emailReferral(context.env, jobId, payload));
  } catch (error) {
    const status = error instanceof Error && error.message === "Job not found" ? 404 : 400;
    return errorResponse(context.env, context.request, error, status);
  }
};
