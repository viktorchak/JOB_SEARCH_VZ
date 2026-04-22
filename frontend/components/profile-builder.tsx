"use client";

import type { ChangeEvent } from "react";
import { BriefcaseBusiness, Save } from "lucide-react";

import type {
  CareerPriority,
  CompanyStagePreference,
  PrimaryJobFamily,
  ProfileSeniority,
  UserProfile,
  UserProfileUpdate,
  YearsExperienceBucket,
} from "@/lib/api";

interface ProfileBuilderProps {
  profile: UserProfileUpdate;
  activeProfile: UserProfile | null;
  saving: boolean;
  onChange: <K extends keyof UserProfileUpdate>(key: K, value: UserProfileUpdate[K]) => void;
  onSave: () => void;
}

const jobFamilyOptions: Array<{ value: PrimaryJobFamily; label: string }> = [
  { value: "product_management", label: "Product Management" },
  { value: "strategy_operations", label: "Strategy & Operations" },
  { value: "engineering", label: "Engineering" },
  { value: "program_management", label: "Program Management" },
  { value: "business_operations", label: "Business Operations" },
  { value: "partnerships_bd", label: "Partnerships / BD" },
  { value: "data_analytics", label: "Data / Analytics" },
  { value: "design", label: "Design" },
  { value: "sales_gtm", label: "Sales / GTM" },
  { value: "non_technical_other", label: "Non-technical / Other" },
];

const seniorityOptions: Array<{ value: ProfileSeniority; label: string }> = [
  { value: "internship", label: "Internship" },
  { value: "entry_level", label: "Entry level" },
  { value: "associate", label: "Associate" },
  { value: "mid_senior", label: "Mid-Senior" },
  { value: "director", label: "Director" },
  { value: "executive", label: "Executive" },
];

const yearsOptions: YearsExperienceBucket[] = ["0-1", "2-4", "5-7", "8-10", "10+"];

const stageOptions: Array<{ value: CompanyStagePreference; label: string }> = [
  { value: "no_preference", label: "No preference" },
  { value: "startup", label: "Startup" },
  { value: "growth", label: "Growth" },
  { value: "late_stage", label: "Late-stage" },
  { value: "public", label: "Public" },
];

const priorityOptions: Array<{ value: CareerPriority; label: string }> = [
  { value: "learning", label: "Learning" },
  { value: "balanced", label: "Balanced" },
  { value: "ownership_scope", label: "Ownership & Scope" },
];

function FieldLabel({ children }: { children: string }) {
  return <span className="mb-2 block text-xs uppercase tracking-[0.24em] text-slate-500">{children}</span>;
}

export function ProfileBuilder({
  profile,
  activeProfile,
  saving,
  onChange,
  onSave,
}: ProfileBuilderProps) {
  const activeUpdatedAt = activeProfile ? new Date(activeProfile.updated_at).toLocaleString() : "Not saved yet";
  const isDefaultProfile = activeProfile?.is_default ?? true;

  return (
    <section className="rounded-[32px] border border-black/10 bg-white/85 p-5 shadow-[0_18px_60px_rgba(15,23,42,0.06)] backdrop-blur">
      <div className="flex flex-col gap-4 border-b border-black/10 pb-5 md:flex-row md:items-start md:justify-between">
        <div className="max-w-3xl">
          <p className="font-ui text-xs uppercase tracking-[0.38em] text-slate-500">Profile fit</p>
          <h2 className="font-display mt-3 text-2xl font-semibold text-slate-950">Build your scoring profile</h2>
          <p className="font-ui mt-2 text-sm leading-7 text-slate-600">
            Pick one primary job family, your current level, comp target, and whether this search is about
            learning or ownership. The dashboard reranks every scored job against this profile.
          </p>
        </div>
        <div className="rounded-[24px] border border-black/10 bg-[#f7f4ee] px-4 py-3 text-sm text-slate-700">
          <p className="font-ui font-semibold text-slate-900">Active profile</p>
          <p className="font-ui mt-1">
            {isDefaultProfile ? "Using starter defaults" : `Last updated: ${activeUpdatedAt}`}
          </p>
        </div>
      </div>

      <div className="mt-5 grid gap-4 lg:grid-cols-3">
        <label className="rounded-[26px] border border-black/10 bg-[#fffaf4] p-4">
          <FieldLabel>Primary Job Family</FieldLabel>
          <select
            value={profile.primary_job_family}
            onChange={(event) => onChange("primary_job_family", event.target.value as PrimaryJobFamily)}
            className="font-ui w-full bg-transparent text-base text-slate-900 outline-none"
          >
            {jobFamilyOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>

        <label className="rounded-[26px] border border-black/10 bg-[#fffaf4] p-4">
          <FieldLabel>Seniority</FieldLabel>
          <select
            value={profile.seniority_level}
            onChange={(event) => onChange("seniority_level", event.target.value as ProfileSeniority)}
            className="font-ui w-full bg-transparent text-base text-slate-900 outline-none"
          >
            {seniorityOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>

        <label className="rounded-[26px] border border-black/10 bg-[#fffaf4] p-4">
          <FieldLabel>Years Of Experience</FieldLabel>
          <select
            value={profile.years_experience_bucket}
            onChange={(event) => onChange("years_experience_bucket", event.target.value as YearsExperienceBucket)}
            className="font-ui w-full bg-transparent text-base text-slate-900 outline-none"
          >
            {yearsOptions.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </label>

        <label className="rounded-[26px] border border-black/10 bg-[#fffaf4] p-4">
          <FieldLabel>Compensation Floor</FieldLabel>
          <input
            type="number"
            min={0}
            value={profile.compensation_floor ?? ""}
            onChange={(event: ChangeEvent<HTMLInputElement>) =>
              onChange("compensation_floor", event.target.value ? Number(event.target.value) : null)
            }
            placeholder="Optional annual base"
            className="font-ui w-full bg-transparent text-base text-slate-900 outline-none placeholder:text-slate-400"
          />
        </label>

        <label className="rounded-[26px] border border-black/10 bg-[#fffaf4] p-4">
          <FieldLabel>Company Stage</FieldLabel>
          <select
            value={profile.company_stage_preference}
            onChange={(event) => onChange("company_stage_preference", event.target.value as CompanyStagePreference)}
            className="font-ui w-full bg-transparent text-base text-slate-900 outline-none"
          >
            {stageOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>

        <label className="rounded-[26px] border border-black/10 bg-[#fffaf4] p-4">
          <FieldLabel>Career Priority</FieldLabel>
          <select
            value={profile.career_priority}
            onChange={(event) => onChange("career_priority", event.target.value as CareerPriority)}
            className="font-ui w-full bg-transparent text-base text-slate-900 outline-none"
          >
            {priorityOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="mt-5 flex flex-col gap-3 rounded-[26px] border border-black/10 bg-[#f7f4ee] px-4 py-4 md:flex-row md:items-center md:justify-between">
        <div className="flex items-start gap-3">
          <div className="rounded-full bg-white p-2 text-teal-800">
            <BriefcaseBusiness className="h-4 w-4" />
          </div>
          <p className="font-ui max-w-3xl text-sm leading-6 text-slate-700">
            {isDefaultProfile
              ? "Save this once before your first serious search. Until then, the dashboard uses a generic starter profile and the scores are only provisional."
              : "Job family carries the most weight. Level combines seniority and years required. Career value shifts between learning and ownership depending on the profile you save here."}
          </p>
        </div>
        <button
          type="button"
          onClick={onSave}
          disabled={saving}
          className="font-ui inline-flex items-center justify-center gap-2 rounded-full bg-slate-950 px-5 py-3 text-sm text-white transition hover:bg-slate-800 disabled:opacity-60"
        >
          <Save className="h-4 w-4" />
          {saving ? "Saving profile..." : "Save profile"}
        </button>
      </div>
    </section>
  );
}
