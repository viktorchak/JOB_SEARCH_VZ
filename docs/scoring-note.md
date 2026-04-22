# Scoring Note

The scoring system ranks jobs with a deterministic 100-point model based on the user’s profile. I used five criteria because they reflect the main factors a job seeker actually cares about: whether the role is in the right job family, whether the level matches their experience, whether the role offers the kind of career value they want, whether compensation is acceptable, and whether the company stage fits their preference. Hard constraints such as location, remote policy, maximum years required, minimum compensation, and allowed seniority are handled as filters outside the score, so disqualified jobs are removed instead of merely ranked lower. I excluded domain match as a primary scoring factor because it is less important than role family and level for this product, and I excluded LLM-based ranking from the live scoring path so profile changes remain fast, deterministic, and explainable.

| Criterion | Weight | Rationale |
|---|---:|---|
| Job family fit | 40 | Most important signal; the role must be in the user’s target lane. |
| Level fit | 25 | Combines seniority and years required so jobs are not too junior or too senior. |
| Career value fit | 15 | Adapts ranking for users who prioritize learning versus ownership and scope. |
| Compensation fit | 10 | Checks whether known pay meets the user’s floor, but stays modest because salary data is often missing. |
| Company stage fit | 10 | Rewards alignment with startup, growth, late-stage, or public-company preference. |
