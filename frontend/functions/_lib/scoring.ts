import { getOptionalEnv } from "./env";
import type { CloudflareEnv } from "./types";
import {
  ensureActiveProfile,
  getJobAttributes,
  getScore,
  listAllJobs,
  listJobsMissingAttributes,
  listUnscoredJobs,
  saveJobAttributes,
  saveScore,
  type JobAttributeRecord,
  type JobRecord,
  type ScorePayload,
  type UserProfileRecord,
} from "./supabase";

const EMAIL_PROMPT = `Draft a concise referral-request email for the active user profile.
The tone should be credible, warm, and direct. Mention why the role is a fit in 2-3 concrete points.
Do not use placeholders. Do not invent facts beyond the provided profile and job description.`;

const FAMILY_PATTERNS: Array<[string, string[]]> = [
  ["product_management", ["product manager", "product management", "group product", "principal product", "product lead", "product owner"]],
  [
    "strategy_operations",
    [
      "strategy & operations",
      "strategy and operations",
      "chief of staff",
      "entrepreneur in residence",
      "eir",
      "corporate strategy",
      "strategic operations",
    ],
  ],
  [
    "engineering",
    [
      "software engineer",
      "engineering manager",
      "engineer",
      "developer",
      "full stack",
      "frontend engineer",
      "frontend developer",
      "backend engineer",
      "backend developer",
      "platform engineer",
      "data engineer",
      "machine learning engineer",
    ],
  ],
  ["program_management", ["program manager", "technical program manager", "tpm", "program management", "project manager"]],
  ["business_operations", ["business operations", "bizops", "operations manager", "business manager", "operations lead"]],
  ["partnerships_bd", ["partnerships", "business development", "partner manager", "alliances", "channel"]],
  ["data_analytics", ["data analyst", "analytics", "business analyst", "data scientist", "business intelligence", "bi analyst"]],
  ["design", ["designer", "product design", "ux", "ui", "researcher", "design lead"]],
  [
    "sales_gtm",
    [
      "sales engineer",
      "solutions engineer",
      "solution engineer",
      "sales",
      "account executive",
      "revenue",
      "growth",
      "marketing",
      "customer acquisition",
      "gtm",
    ],
  ],
  ["non_technical_other", ["finance", "accounting", "legal", "people ops", "human resources", "recruiting", "talent acquisition", "customer success", "support"]],
];

const FAMILY_ADJACENCY: Record<string, Set<string>> = {
  product_management: new Set(["program_management", "strategy_operations", "data_analytics"]),
  strategy_operations: new Set(["business_operations", "program_management", "partnerships_bd", "product_management"]),
  engineering: new Set(["data_analytics", "program_management", "product_management"]),
  program_management: new Set(["product_management", "strategy_operations", "business_operations", "engineering"]),
  business_operations: new Set(["strategy_operations", "program_management", "partnerships_bd"]),
  partnerships_bd: new Set(["sales_gtm", "strategy_operations", "business_operations"]),
  data_analytics: new Set(["product_management", "engineering", "business_operations"]),
  design: new Set(["product_management"]),
  sales_gtm: new Set(["partnerships_bd", "business_operations"]),
  non_technical_other: new Set(),
  unknown: new Set(),
};

const SENIORITY_KEYWORDS: Array<[string, string[]]> = [
  ["executive", ["chief", "cfo", "cto", "coo", "ceo", "vice president", "vp", "general manager"]],
  ["director", ["director", "head of", "sr director", "senior director"]],
  ["mid_senior", ["senior", "staff", "lead", "principal", "manager", "owner"]],
  ["associate", ["associate"]],
  ["entry_level", ["entry level", "entry-level", "junior", "new grad", "graduate", "apprentice"]],
  ["internship", ["intern", "internship", "co-op"]],
];

const COMPANY_STAGE_KEYWORDS: Record<string, string[]> = {
  startup: ["seed", "series a", "series-a", "early stage", "early-stage", "startup"],
  growth: ["series b", "series c", "series d", "growth stage", "growth-stage", "scale-up", "scaleup", "hypergrowth"],
  late_stage: ["late stage", "late-stage", "pre-ipo", "private equity backed", "private-equity-backed", "unicorn"],
  public: ["publicly traded", "nasdaq", "nyse", "fortune 500", "listed on", "s&p 500"],
};

const PUBLIC_COMPANY_HINTS = new Set([
  "amazon",
  "netflix",
  "capital one",
  "mastercard",
  "coca cola",
  "walmart",
  "google",
  "meta",
  "microsoft",
  "apple",
  "uber",
  "spotify",
  "salesforce",
  "adobe",
  "linkedin",
]);

const LEARNING_TERMS = [
  "mentorship",
  "mentor",
  "training",
  "rotation",
  "rotational",
  "career development",
  "learn",
  "growth mindset",
  "early career",
  "entry-level",
  "coaching",
];

const OWNERSHIP_TERMS = [
  "own",
  "ownership",
  "end-to-end",
  "0-to-1",
  "zero-to-one",
  "roadmap",
  "strategy",
  "c-suite",
  "executive",
  "autonomy",
  "decision",
  "mandate",
  "cross-functional leadership",
  "build",
];

const YEARS_BUCKETS: Record<string, [number, number]> = {
  "0-1": [0, 1],
  "2-4": [2, 4],
  "5-7": [5, 7],
  "8-10": [8, 10],
  "10+": [10, 15],
};

const SENIORITY_ORDER: Record<string, number> = {
  internship: 0,
  entry_level: 1,
  associate: 2,
  mid_senior: 3,
  director: 4,
  executive: 5,
  unknown: 2,
};

function nowIso(): string {
  return new Date().toISOString();
}

function normalizeText(value: string): string {
  return value.toLowerCase().replace(/\s+/g, " ").trim();
}

function patternMatches(text: string, pattern: string): boolean {
  const escaped = pattern.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\s+/g, "\\s+");
  return new RegExp(`(?<!\\w)${escaped}(?!\\w)`, "i").test(text);
}

function bestPatternMatch(text: string, buckets: Array<[string, string[]]>): string | null {
  let best: { rank: [number, number]; value: string } | null = null;
  for (const [index, bucket] of buckets.entries()) {
    const [value, patterns] = bucket;
    for (const pattern of patterns) {
      if (!patternMatches(text, pattern)) continue;
      const rank: [number, number] = [pattern.length, -index];
      if (!best || rank[0] > best.rank[0] || (rank[0] === best.rank[0] && rank[1] > best.rank[1])) {
        best = { rank, value };
      }
    }
  }
  return best ? best.value : null;
}

function extractJobFamily(title: string, description: string): string {
  return bestPatternMatch(title, FAMILY_PATTERNS) ?? bestPatternMatch(description, FAMILY_PATTERNS) ?? "unknown";
}

function extractSeniority(title: string, description: string): string {
  return bestPatternMatch(title, SENIORITY_KEYWORDS) ?? bestPatternMatch(description, SENIORITY_KEYWORDS) ?? "unknown";
}

function extractYearsRequired(text: string): [number | null, number | null] {
  const rangePatterns = [
    /(\d{1,2})\s*(?:\+|plus)?\s*(?:-|to|–|—)\s*(\d{1,2})\s+years?\b(?:\s+of)?(?:\s+\w+){0,3}?\s+experience\b/i,
    /between\s+(\d{1,2})\s+and\s+(\d{1,2})\s+years?\b(?:\s+of)?(?:\s+\w+){0,3}?\s+experience\b/i,
    /(\d{1,2})\s*(?:-|to|–|—)\s*(\d{1,2})\s+yrs?\b/i,
  ];
  for (const pattern of rangePatterns) {
    const match = text.match(pattern);
    if (!match) continue;
    const low = Number(match[1]);
    const high = Number(match[2]);
    if (Number.isFinite(low) && Number.isFinite(high) && low >= 0 && high >= low && high <= 50) {
      return [low, high];
    }
  }

  const singlePatterns = [
    /minimum of\s+(\d{1,2})\s+years?\b(?:\s+of)?(?:\s+\w+){0,3}?\s+experience\b/i,
    /at least\s+(\d{1,2})\s+years?\b(?:\s+of)?(?:\s+\w+){0,3}?\s+experience\b/i,
    /(\d{1,2})\+\s+years?\b(?:\s+of)?(?:\s+\w+){0,3}?\s+experience\b/i,
    /(\d{1,2})\s+years?\b(?:\s+of)?(?:\s+\w+){0,3}?\s+experience\b/i,
    /experience:\s*(\d{1,2})\s+years?\s+minimum\b/i,
    /requires?\s+(?:a\s+)?minimum\s+(?:of\s+)?(\d{1,2})\s+years?\b/i,
  ];
  for (const pattern of singlePatterns) {
    const match = text.match(pattern);
    if (!match) continue;
    const years = Number(match[1]);
    if (Number.isFinite(years) && years >= 0 && years <= 50) {
      return [years, years + 2];
    }
  }
  return [null, null];
}

function normalizeMoneyValue(raw: string, multiplier?: string | null, period: string = "year"): number {
  const value = Number(raw.replace(/,/g, ""));
  if (multiplier?.toLowerCase() === "k") return value * 1_000;
  if (multiplier?.toLowerCase() === "m") return value * 1_000_000;
  if (value < 1_000 && period !== "hour") return value * 1_000;
  return value;
}

function extractCompensation(job: JobRecord): [number | null, number | null, string | null, string | null] {
  if (job.salary_min !== null || job.salary_max !== null) {
    return [job.salary_min ?? null, job.salary_max ?? null, job.salary_currency ?? "USD", job.salary_period ?? "year"];
  }

  const match = job.jd_text.match(
    /\$?\s?(\d{2,3}(?:,\d{3})?(?:\.\d+)?)\s*(k|m)?\s*(?:-|to)\s*\$?\s?(\d{2,3}(?:,\d{3})?(?:\.\d+)?)\s*(k|m)?\s*(per\s+year|a\s+year|annually|year|per\s+hour|an\s+hour|hourly|hour|per\s+hr|hr)?/i,
  );
  if (!match) return [null, null, null, null];

  const periodToken = (match[5] ?? "year").toLowerCase();
  const period = periodToken.includes("hour") || periodToken.includes("hr") ? "hour" : "year";
  const low = normalizeMoneyValue(match[1], match[2], period);
  const high = normalizeMoneyValue(match[3], match[4], period);
  return [low, high, "USD", period];
}

function extractCompanyStage(company: string, combined: string): string {
  const companyLower = company.toLowerCase();
  for (const hint of PUBLIC_COMPANY_HINTS) {
    if (companyLower.includes(hint)) return "public";
  }
  for (const [stage, keywords] of Object.entries(COMPANY_STAGE_KEYWORDS)) {
    if (keywords.some((keyword) => combined.includes(keyword))) return stage;
  }
  return "unknown";
}

function signalScore(text: string, terms: string[]): number {
  const hits = terms.reduce((count, term) => count + (text.includes(term) ? 1 : 0), 0);
  return Math.min(10, hits * 2.5);
}

function normalizedCompensation(attributes: JobAttributeRecord): number | null {
  if (!attributes.compensation_known) return null;
  const value = attributes.compensation_max ?? attributes.compensation_min;
  if (value === null) return null;
  return attributes.compensation_period === "hour" ? value * 2080 : value;
}

function labelJobFamily(value: string): string {
  const labels: Record<string, string> = {
    product_management: "Product Management",
    strategy_operations: "Strategy & Operations",
    engineering: "Engineering",
    program_management: "Program Management",
    business_operations: "Business Operations",
    partnerships_bd: "Partnerships / BD",
    data_analytics: "Data / Analytics",
    design: "Design",
    sales_gtm: "Sales / GTM",
    non_technical_other: "Non-technical / Other",
    unknown: "Unknown",
  };
  return labels[value] ?? value;
}

function labelSeniority(value: string): string {
  const labels: Record<string, string> = {
    internship: "Internship",
    entry_level: "Entry level",
    associate: "Associate",
    mid_senior: "Mid-Senior",
    director: "Director",
    executive: "Executive",
    unknown: "Unknown",
  };
  return labels[value] ?? value;
}

function labelCompanyStage(value: string): string {
  const labels: Record<string, string> = {
    startup: "startup",
    growth: "growth-stage",
    late_stage: "late-stage",
    public: "public-company",
    unknown: "unknown",
    no_preference: "any",
  };
  return labels[value] ?? value;
}

function scoreJobFamily(profile: UserProfileRecord, attributes: JobAttributeRecord): number {
  if (attributes.job_family === profile.primary_job_family) return 40;
  if (attributes.job_family === "unknown") return 8;
  if (FAMILY_ADJACENCY[profile.primary_job_family]?.has(attributes.job_family)) return 24;
  return 0;
}

function scoreLevelFit(profile: UserProfileRecord, attributes: JobAttributeRecord): number {
  const seniorityDelta = Math.abs(
    (SENIORITY_ORDER[profile.seniority_level] ?? 2) - (SENIORITY_ORDER[attributes.seniority_level] ?? 2),
  );
  const seniorityPoints =
    attributes.seniority_level === "unknown" ? 8 : seniorityDelta === 0 ? 15 : seniorityDelta === 1 ? 10 : seniorityDelta === 2 ? 5 : 0;

  const [profileMin, profileMax] = YEARS_BUCKETS[profile.years_experience_bucket];
  let yearsPoints = 6;
  if (attributes.years_required_min !== null || attributes.years_required_max !== null) {
    const jobMin = attributes.years_required_min ?? attributes.years_required_max ?? 0;
    const jobMax = attributes.years_required_max ?? Math.max(jobMin + 2, jobMin);
    if (profileMax < jobMin) {
      yearsPoints = 0;
    } else if (profileMin > jobMax + 2) {
      yearsPoints = 4;
    } else if (profileMin <= jobMax && profileMax >= jobMin) {
      yearsPoints = 10;
    }
  }

  return seniorityPoints + yearsPoints;
}

function scoreCareerValue(profile: UserProfileRecord, attributes: JobAttributeRecord): number {
  const signal =
    profile.career_priority === "learning"
      ? attributes.learning_signal
      : profile.career_priority === "ownership_scope"
        ? attributes.ownership_signal
        : (attributes.learning_signal + attributes.ownership_signal) / 2;
  return Math.min(15, (signal / 10) * 15);
}

function scoreCompensationFit(profile: UserProfileRecord, attributes: JobAttributeRecord): number {
  if (profile.compensation_floor === null) return 10;
  const normalized = normalizedCompensation(attributes);
  if (normalized === null) return 4;
  if (normalized >= profile.compensation_floor) return 10;
  if (normalized >= profile.compensation_floor * 0.9) return 7;
  if (normalized >= profile.compensation_floor * 0.75) return 4;
  return 0;
}

function scoreCompanyStageFit(profile: UserProfileRecord, attributes: JobAttributeRecord): number {
  if (profile.company_stage_preference === "no_preference") return 10;
  if (attributes.company_stage === profile.company_stage_preference) return 10;
  if (attributes.company_stage === "unknown") return 4;
  const order: Record<string, number> = { startup: 0, growth: 1, late_stage: 2, public: 3, unknown: 1 };
  return Math.abs(order[attributes.company_stage] - order[profile.company_stage_preference]) === 1 ? 7 : 2;
}

function buildTopReasons(profile: UserProfileRecord, attributes: JobAttributeRecord, total: number): string[] {
  const reasons: string[] = [];
  if (attributes.job_family === profile.primary_job_family) {
    reasons.push(`Primary job family aligns with ${labelJobFamily(profile.primary_job_family)}.`);
  }
  if (scoreLevelFit(profile, attributes) >= 18) {
    reasons.push(`Level fit is strong for a ${labelSeniority(profile.seniority_level)} profile with ${profile.years_experience_bucket} years.`);
  }
  if (profile.career_priority === "learning" && attributes.learning_signal >= 6) {
    reasons.push("The role shows strong learning and mentorship signals.");
  }
  if (profile.career_priority === "ownership_scope" && attributes.ownership_signal >= 6) {
    reasons.push("The role offers clear ownership and scope signals.");
  }
  if (profile.career_priority === "balanced" && attributes.learning_signal + attributes.ownership_signal >= 12) {
    reasons.push("The role balances learning upside with meaningful ownership.");
  }
  if (profile.compensation_floor && scoreCompensationFit(profile, attributes) >= 7) {
    reasons.push("Known compensation is close to or above your target floor.");
  }
  if (profile.company_stage_preference !== "no_preference" && attributes.company_stage === profile.company_stage_preference) {
    reasons.push(`Company stage matches your preference for ${labelCompanyStage(profile.company_stage_preference)} roles.`);
  }
  if (!reasons.length) {
    reasons.push(`This role is a moderate fit for your ${labelJobFamily(profile.primary_job_family)} profile.`);
  }
  while (reasons.length < 3) {
    if (total >= 75) {
      reasons.push("Overall fit is strong enough to prioritize in the current search.");
    } else if (total >= 55) {
      reasons.push("The role has a mixed fit and needs closer review before acting.");
    } else {
      reasons.push("The role is currently a weaker fit against your active profile.");
    }
  }
  return reasons.slice(0, 3);
}

function buildRationale(profile: UserProfileRecord, attributes: JobAttributeRecord, total: number, reasons: string[]): string {
  const compSentence =
    profile.compensation_floor === null
      ? "Compensation is not constrained by a hard floor in the active profile."
      : attributes.compensation_known
        ? `Known compensation is ${normalizedCompensation(attributes)?.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }) ?? "available"} against a ${profile.compensation_floor.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 })} target.`
        : "Compensation is unknown, so pay fit is only partially credited.";

  return [
    `This role scored ${Math.round(total)}/100 for a ${labelJobFamily(profile.primary_job_family)} search.`,
    `Detected family: ${labelJobFamily(attributes.job_family)}. Seniority: ${labelSeniority(attributes.seniority_level)}.`,
    `Career priority is ${profile.career_priority.replace("_", " ")} and the role signals learning ${Math.round(attributes.learning_signal)}/10 and ownership ${Math.round(attributes.ownership_signal)}/10.`,
    compSentence,
    reasons.join(" "),
  ].join(" ");
}

export function extractJobAttributes(job: JobRecord): JobAttributeRecord {
  const title = normalizeText(job.title);
  const description = normalizeText(job.jd_text);
  const combined = [title, description].filter(Boolean).join("\n");
  const [salaryMin, salaryMax, salaryCurrency, salaryPeriod] = extractCompensation(job);
  const [yearsRequiredMin, yearsRequiredMax] = extractYearsRequired(combined);

  return {
    job_id: job.id,
    job_family: extractJobFamily(title, description),
    seniority_level: extractSeniority(title, description),
    years_required_min: yearsRequiredMin,
    years_required_max: yearsRequiredMax,
    compensation_known: salaryMin !== null || salaryMax !== null,
    compensation_min: salaryMin,
    compensation_max: salaryMax,
    compensation_currency: salaryCurrency,
    compensation_period: salaryPeriod,
    company_stage: extractCompanyStage(job.company, combined),
    learning_signal: signalScore(combined, LEARNING_TERMS),
    ownership_signal: signalScore(combined, OWNERSHIP_TERMS),
    extracted_at: nowIso(),
  };
}

export function scoreJob(profile: UserProfileRecord, attributes: JobAttributeRecord): ScorePayload {
  const dim_job_family_fit = scoreJobFamily(profile, attributes);
  const dim_level_fit = scoreLevelFit(profile, attributes);
  const dim_career_value_fit = scoreCareerValue(profile, attributes);
  const dim_compensation_fit = scoreCompensationFit(profile, attributes);
  const dim_company_stage_fit = scoreCompanyStageFit(profile, attributes);
  const total = Number(
    (
      dim_job_family_fit +
      dim_level_fit +
      dim_career_value_fit +
      dim_compensation_fit +
      dim_company_stage_fit
    ).toFixed(1),
  );
  const top_reasons = buildTopReasons(profile, attributes, total);
  const rationale = buildRationale(profile, attributes, total, top_reasons);
  return {
    total,
    dim_job_family_fit: Number(dim_job_family_fit.toFixed(1)),
    dim_level_fit: Number(dim_level_fit.toFixed(1)),
    dim_career_value_fit: Number(dim_career_value_fit.toFixed(1)),
    dim_compensation_fit: Number(dim_compensation_fit.toFixed(1)),
    dim_company_stage_fit: Number(dim_company_stage_fit.toFixed(1)),
    top_reasons,
    rationale,
  };
}

function scoreChanged(existing: ScorePayload, next: ScorePayload): boolean {
  return JSON.stringify(existing) !== JSON.stringify(next);
}

function rubricVersion(env: CloudflareEnv): string {
  return getOptionalEnv(env, "RUBRIC_VERSION") ?? "v1";
}

export async function ensureJobScored(env: CloudflareEnv, job: JobRecord, profile?: UserProfileRecord): Promise<ScorePayload> {
  const activeProfile = profile ?? (await ensureActiveProfile(env));
  let attributes = await getJobAttributes(env, job.id);
  if (!attributes) {
    attributes = extractJobAttributes(job);
    await saveJobAttributes(env, attributes);
  }
  const payload = scoreJob(activeProfile, attributes);
  const existing = await getScore(env, job.id);
  if (!existing || scoreChanged(existing, payload)) {
    await saveScore(env, job.id, rubricVersion(env), payload);
  }
  return payload;
}

export async function scoreUnscoredJobs(env: CloudflareEnv): Promise<{ processed: number; skipped: number; failed: number }> {
  const profile = await ensureActiveProfile(env);
  const jobsById = new Map<string, JobRecord>();
  for (const job of await listUnscoredJobs(env)) jobsById.set(job.id, job);
  for (const job of await listJobsMissingAttributes(env)) jobsById.set(job.id, job);

  let processed = 0;
  let failed = 0;
  for (const job of jobsById.values()) {
    try {
      await ensureJobScored(env, job, profile);
      processed += 1;
    } catch {
      failed += 1;
    }
  }
  return { processed, skipped: 0, failed };
}

export async function rescoreActiveProfile(env: CloudflareEnv): Promise<{ processed: number; skipped: number; failed: number }> {
  const profile = await ensureActiveProfile(env);
  const jobs = await listAllJobs(env);
  let processed = 0;
  let failed = 0;
  for (const job of jobs) {
    try {
      await ensureJobScored(env, job, profile);
      processed += 1;
    } catch {
      failed += 1;
    }
  }
  return { processed, skipped: 0, failed };
}

function buildProfileSummary(profile: UserProfileRecord): string {
  return [
    `Primary job family: ${labelJobFamily(profile.primary_job_family)}`,
    `Seniority: ${labelSeniority(profile.seniority_level)}`,
    `Years of experience: ${profile.years_experience_bucket}`,
    `Compensation floor: ${profile.compensation_floor ? `$${profile.compensation_floor.toLocaleString()}` : "None"}`,
    `Company stage preference: ${labelCompanyStage(profile.company_stage_preference)}`,
    `Career priority: ${profile.career_priority.replace("_", " ")}`,
  ].join("\n");
}

async function runGeminiJson(
  env: CloudflareEnv,
  systemPrompt: string,
  userPrompt: string,
): Promise<Record<string, unknown>> {
  const apiKey = getOptionalEnv(env, "GEMINI_API_KEY");
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY is not configured");
  }

  const model = getOptionalEnv(env, "GEMINI_MODEL") ?? "gemini-2.5-flash";
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: systemPrompt }] },
        contents: [{ role: "user", parts: [{ text: userPrompt }] }],
        generationConfig: {
          temperature: 0.2,
          responseMimeType: "application/json",
        },
      }),
    },
  );
  if (!response.ok) {
    throw new Error(`Gemini request failed with status ${response.status}`);
  }
  const payload = (await response.json()) as {
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
  };
  const text = payload.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) {
    throw new Error("Gemini did not return JSON output");
  }
  return JSON.parse(text) as Record<string, unknown>;
}

export async function draftEmail(
  env: CloudflareEnv,
  job: JobRecord,
  score: ScorePayload | null,
  profile?: UserProfileRecord,
): Promise<{ subject: string; body: string }> {
  const activeProfile = profile ?? (await ensureActiveProfile(env));
  const payload = await runGeminiJson(
    env,
    `${EMAIL_PROMPT}\n\n${buildProfileSummary(activeProfile)}`,
    [
      `Job title: ${job.title}`,
      `Company: ${job.company}`,
      `Location: ${job.location}`,
      `Job URL: ${job.jd_url}`,
      `Score rationale: ${score?.rationale ?? "No score rationale available."}`,
      `Top reasons: ${(score?.top_reasons ?? []).join(" | ")}`,
      `Job description:\n${job.jd_text}`,
      `Return strict JSON with keys "subject" and "body".`,
    ].join("\n\n"),
  );

  const subject = typeof payload.subject === "string" ? payload.subject.trim() : "";
  const body = typeof payload.body === "string" ? payload.body.trim() : "";
  if (!subject || !body) {
    throw new Error("Gemini did not return a valid email draft");
  }
  return { subject, body };
}
