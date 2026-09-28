# Bod Pod originals → reviewed nutrition draft

## Scope

Owner-requested client-first authoring. Entry: client or Fuel workspace → **Upload Bod Pod → Create nutrition draft**, route `/clients/[id]/fuel/create`.

1. Select an existing, authorized client. Upload up to three PDF/JPEG/PNG originals (3 MB each).
2. Optional assisted transcription; review the original, literal values, units, model and actual test date. Confirm the sources belong to the same client and test.
3. Complete age, height, explicit equation coefficient, activity, goal, training frequency, food context and screening.
4. Generate an UNSAVED proposal with estimated calories/macros, formula assumptions and, when available, USDA-backed meal portions/groceries.
5. Explicitly save the baseline and private strategy together through an atomic wrapper of the existing Fuel commands. Release is a separate exact-version review in the existing Fuel workspace.

No user-uploaded image/PDF, real measurement or client name is stored in this repository. The supplied machine-photo layout separates percent Fat/Lean from lb Fat/Lean/Total Body; the model label is literal source metadata. The supplied two-page IMS document is an unfilled template with a reference-classification table and a prechecked form box. Neither reference percentages, checkbox defaults, educational examples nor the handout's fixed 3,500-calorie illustration are executable measurement or nutrition rules. Uploaded originals remain unchanged.

## Configurations (server-only)

- `FUEL_REPORT_READER_ENABLED=true` deliberately opts in to the external reader.
- `FUEL_REPORT_READER_API_KEY` is a dedicated OpenAI project/service key, NOT a NEXT_PUBLIC variable.
- `FUEL_REPORT_READER_MODEL` is optional; default `gpt-4.1`, a vision/structured-output model. Test the selected model before client rollout.
- `USDA_FDC_API_KEY` is a USDA FoodData Central/data.gov key; no key is embedded or exposed to browsers.

Missing configuration is visible. Without the reader, private originals and manual confirmation still work. Without USDA access, numeric estimates still work but the menu is explicitly incomplete and no food macro values are fabricated. No key was obtained or configured as part of implementation.

The user explicitly consents before a selected original is transmitted to OpenAI. Only that file is sent, not the client directory, screening or profile. It can itself contain identifying/health information. Requests use a fixed HTTPS host, inline data, strict structured output, `store:false`, 45-second timeout, bounded output and no automatic retry. `store:false` is not a zero-retention or HIPAA assurance; verify provider/project retention, contractual requirements and appropriate permissions before rollout. A durable database reservation caps assisted reads to 30 per actor per hour. A new read after failure is an explicit new attempt; it can incur another provider charge. USDA receives generic food queries only, never client data.

## Measurement rules

Numbers are source observations, not corrections. Percentages and masses are separate. kg candidates are converted explicitly to lb for the review form while the quoted original is retained. Multiple distinct observations for one field remain unresolved. Name/date missing on the machine display remain null; EXIF/upload dates are not test dates. A blank template returns no measurements. A human confirms all fields, person and test date. The original files and SHA-256 references remain available. Additional reported fat mass, lean percent and model are retained in the private measurement-source protocol snapshot; they are not falsely squeezed into another chart column.

## Calculation policy v1

This is a transparent conservative general-adult coaching proposal, not diagnosis or medical nutrition therapy. It is NOT a validated IMS clinical algorithm. It deliberately does not infer safety from body fat, calendar bookings or a negative automated symptom search.

- Mifflin–St Jeor estimate: `10*kg + 6.25*height_cm - 5*age + coefficient`, +5 male equation / −161 female equation. Coefficient is explicitly chosen, not inferred from a name or photo. Bod Pod supplies measured body-composition context and weight, not a measured resting-metabolic rate.
- Coach-confirmed total-activity assumptions 1.30, 1.45 or 1.60. Proposed goal multipliers: maintenance/performance 1.00, loss 0.90, gain 1.05. These factors are product heuristics; workload, individual metabolism and intake can differ.
- Proposed protein 1.6 g/kg, fat 30% of proposed energy, carbohydrate remainder. Rounded arithmetic is visible; no false nutrient precision or automatic target adjustment.
- Product eligibility gates: ages 18–78; current test within 90 days; BMI 18.5–40; no positive/unknown screening flags; conservative energy floors (female coefficient 1,500, male 1,800 and never below calculated RMR), ceiling 4,000; carbs >=130 g; protein <=35% energy; low reported body fat blocks the automatic fat-loss option (female coefficient <18%, male <10%). These are intentionally cautious routing thresholds, NOT universal physiological limits, diagnoses or guarantees of safety. Do not silently clamp failed estimates.
- Screening includes pregnancy/lactation, restrictive-eating/ED concerns, medical nutrition or relevant medications, unexplained symptoms/change, high-demand training. Positive/unknown routes to individual professional review and habit-led alternatives.
- Training/rest start with equal targets. No exercise-calorie credits, appetite-medication dosing, supplement prescription, weight-loss deadline or guaranteed lean-mass retention.

## Food generation

A small exact-match USDA SR Legacy library is used, not model-authored food macros. Confirmed diet/meal-count/prep/budget inform a complete sample-day structure and three-day repeat shopping list. Food facts must match the exact description/preparation state and include per-100 g energy/protein/carbohydrate/fat. Missing or ambiguous entries withhold the menu. Bounded gram portions are fitted to the target; actual totals and remaining differences are displayed, not forced to equal the proposal. Unlisted additions and substitutions change nutrition. Conflicting or additional allergy/restriction inputs withhold the menu for manual review; no claimed allergy-safe substitution or cross-contact guarantee.

This first library is NOT a broad recipe database, varied seven-day plan, micronutrient-adequacy test, live-price comparison or fully automatic dietary-preference engine. Free-text preferences remain explicit coach review context. The existing private editor supports further authoring. Runtime USDA/provider integration needs live acceptance with configured keys; mocks do not prove a successful provider round trip.

## Database and authorization

Apply `packages/db/migrations/0093_nutrition_report_builder.sql` after 0078/0079 and current authorization reconciliation. Existing PDF routes remain compatible. Images use the same private bucket, canonical actor/client/source path and immutable registry with an added MIME field. Existing restrictive storage policy remains; no direct anonymous/authenticated bucket access is added.

`register_fuel_report_source` and `reserve_fuel_report_read` are service-only and revalidate the server-observed actor, active profile and assigned client. No client-supplied actor is trusted. `save_fuel_nutrition_draft` is SECURITY INVOKER, authenticated-only, and delegates to existing authorized, transactional Fuel commands. It validates original IDs and hashes against caller-scoped records. Both baseline and strategy commit, or neither. Both command receipts must be verified by the browser; ambiguous responses lock editing and replay the exact IDs/body, even after a later permission error. It never publishes, modifies financial/package/schedule data or writes back to an external business system.

## Required acceptance

Run source parser, full tests, ESLint, TypeScript, Next production build, dependency audit and native iOS simulator compile/link on the exact release head. Execute database tests in an isolated database, not by fabricating client JWTs or writing synthetic health records into hosted Supabase. After reviewed schema application, verify MIME column, policies, grants and unchanged real-data counts. Then deploy preview only and test iPhone photo selection, two-photo review, blank PDF template rejection, genuine report transcription, provider failure, USDA lookup/portions, confirmed atomic save, exact retry and separate release with legitimate authorized test personas.

References consulted 2026-09-28:
- Mifflin et al. original equation: https://pubmed.ncbi.nlm.nih.gov/2305711/
- Morton et al. protein/RET meta-analysis (population evidence, not individualized guarantee): https://bjsm.bmj.com/content/52/6/376
- NIDDK adult planner limitations: https://www.niddk.nih.gov/health-information/weight-management/body-weight-planner
- USDA API and data licensing: https://fdc.nal.usda.gov/api-guide/ and https://fdc.nal.usda.gov/
- OpenAI file input, structured output, retention: https://developers.openai.com/api/docs/guides/file-inputs and https://developers.openai.com/api/docs/guides/structured-outputs and https://developers.openai.com/api/docs/guides/your-data
