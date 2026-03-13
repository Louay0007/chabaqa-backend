# AI Feature Suggestions for Chabaqa

This document proposes AI + data-driven features that fit Chabaqa’s learning, community, and commerce platform.

It is grounded in what already exists in the backend today:
- AI Tutor with conversation history persistence (`src/ai/*`, `AiChapterConversation`)
- Live Support AI responses for support chat (`src/live-support/live-support-ai.service.ts`)
- Rich tracking and analytics data (`ContentProgress`, `TrackingAction`, `AnalyticsDaily`, GA4)
- Commerce + subscription + wallet + payouts (Stripe/Flouci/manual)
- Notifications, email campaigns, admin dashboards, and moderation workflows

Primary goals:
1) Increase activation (new users reach “aha” faster)
2) Increase retention (more weekly return and completion)
3) Increase monetization (better conversion to paid + higher LTV)
4) Reduce ops load (support + moderation + admin work)
5) Help creators publish faster and sell more

## Product Fit Summary
Chabaqa already has:
- Learning content with chapters/sections
- Communities, posts, DMs, resources, events
- Commerce: products, subscriptions, payouts
- Admin dashboards and moderation workflows

The best AI expansions are ones that:
- Increase learner outcomes and retention
- Reduce admin load (moderation, support)
- Help creators monetize and scale content

## What “Data You Already Have” Enables (Quick Inventory)

### Behavioral signals (first-party)
You already persist structured progress and actions:
- `ContentProgress`: completion, watch time, rating/review, view counts, bookmarks, last accessed, metadata
- `TrackingAction`: `VIEW`, `START`, `COMPLETE`, `CHAPTER_START`, `CHAPTER_COMPLETE`, `LIKE`, `SHARE`, `DOWNLOAD`, `BOOKMARK`, `COMMENT`, `RATE`
- Trackable content types include `course`, `chapter`, `challenge`, `session`, `post`, `event`, `product`, `resource`, `community`, `subscription`

This is enough to power:
- Personalized next-step recommendations
- Churn-risk prediction (rule-based first; ML later)
- Difficulty calibration (“too easy/too hard”) using time-to-complete and drops
- Creator/marketing insights (what converts, what keeps users)
- Smart notifications and “nudges” that aren’t spammy

### Business signals
From commerce modules you can use:
- Plan/subscription state (entitlements, paywall decisions)
- Orders and product purchases
- Wallet top-ups + proofs, payouts, refunds (if present)
- Promo usage and fees

### Communication signals
- Email campaigns + login activity targeting
- Notifications (templates, preferences) + push subscriptions
- Live support conversations (user intent + friction points)

### Content signals
- Course and chapter content structure
- Community posts and moderation queues
- Resources and media assets

## Suggested AI Features (Full, Detailed, and Prioritized)

Below each feature includes: **What users see**, **Why it brings users**, **Data inputs**, **MVP scope**, and **Implementation notes**.

### 1) Onboarding “Goal-to-Plan” (Activation)
**What users see**
- First session asks 3–5 questions (goal, level, weekly time, preferred format, deadlines).
- Instantly outputs a 7-day or 14-day plan (small steps) and subscribes them to non-annoying reminders.

**Why it brings users**
- Faster “aha” moment; users feel guided, not lost.
- Easy to share (“here’s my plan”) and improves first-week retention.

**Data inputs**
- User choices + initial browse behavior
- Existing catalog metadata (course/chapter tags if available; if not, infer via AI classification once)

**MVP scope**
- A single endpoint that returns a plan + rationale text.
- Store plan JSON on the user profile (or a new `UserPlan` collection).

**Implementation notes**
- Start with rules + AI assistance, not pure AI: shortlist candidate courses via category/tags and only then ask AI to structure a plan.
- Add a “regenerate” and “edit plan” button; track acceptance vs regeneration as a quality signal.

### 2) Personalized Learning Paths (Retention)
**What users see**
- “Next best step” widget (home + course page) with 1–3 recommendations.
- Each item shows a reason: “Because you completed Chapter 2 yesterday” / “You bookmarked X” / “Similar learners did Y”.

**Why it brings users**
- Strong retention lever: personalized guidance keeps users progressing.

**Data inputs**
- `ContentProgress` and `TrackingAction` history
- Course enrollment/progress, challenge completion, session/event participation
- Subscription state (only recommend paid items if user is entitled or show upgrade path)

**MVP scope**
- Heuristic recommender first (fast, explainable):
  - Continue the last started course/chapter not completed
  - Recommend the next chapter after completion
  - If inactivity > N days, recommend a short recap + easiest next step
  - Use “time budget” to recommend short vs long items
- Add AI for the “reason text” and to diversify across content types.

**Implementation notes**
- Persist recommendations with `generatedAt`, `inputsHash` (so you can debug), and `clicked/completed` outcomes.
- Add negative feedback: “Not interested”, “Too hard”, “Already know this” (feeds future ranking).

### 3) Chapter Summaries + Micro-Notes (Retention + SEO)
**What users see**
- “Summary”, “Key takeaways”, “Glossary”, and “30-second recap”.
- Optional: “My notes” where AI converts highlights/bookmarks into revision cards.

**Why it brings users**
- Better learning outcomes; users come back to revise.
- Summary pages can be indexable for SEO (if your product allows public previews).

**Data inputs**
- Chapter text/structure + media transcript (if available)
- Bookmarks + highlights (if you store them) + chapter completion signals

**MVP scope**
- Generate on demand (first request) and cache per chapter + per language.
- Store as `ChapterAiSummary` document with versioning.

**Implementation notes**
- Use an async job for long chapters; serve last cached result immediately.
- Add “Report incorrect summary” to capture quality feedback.

### 4) AI Quiz + Practice Generator (Engagement)
**What users see**
- “Practice” tab per chapter: MCQ + short answer + spaced repetition.
- After a quiz: “weak areas” and “recommended next chapter”.

**Why it brings users**
- Measurable progress is sticky; quizzes create a habit loop.

**Data inputs**
- Chapter content + prior quiz attempts + completion/watch time

**MVP scope**
- Generate 5–10 questions per chapter, store them, randomize per user.
- Track attempt outcomes per question.

**Implementation notes**
- Enforce answer key correctness: include citations/snippets from chapter text.
- Add difficulty parameter and “explain like I’m 12 / 16 / professional”.

### 5) “Drop-off Recovery” Copilot (Retention)
**What users see**
- If a user drops during a chapter/course, the app offers:
  - A short recap
  - A 3-minute “catch-up”
  - A simpler alternate path (easier chapter / prerequisite)
  - Optional: “book a session” or “ask in community”

**Why it brings users**
- Converts frustration into progress; lowers churn.

**Data inputs**
- `watchTime`, repeated starts without completion, long gaps between starts, negative ratings/reviews

**MVP scope**
- Rule triggers + AI-generated recap/explanation for “where you got stuck”.

**Implementation notes**
- Keep it non-intrusive; show after a pattern (e.g., 2 failed attempts).

### 6) Smart Notifications: “Nudges that Feel Personal” (Retention + Growth)
**What users see**
- Notifications and emails that are:
  - Time-aware (“You have 15 minutes? Do this micro-step.”)
  - Context-aware (“Continue where you stopped.”)
  - Preference-aware (frequency, channels)

**Why it brings users**
- Better reactivation without spam; improves weekly retention.

**Data inputs**
- Notification preferences + `lastAccessedAt` + progress state + time budget
- Community engagement (new replies, mentions)

**MVP scope**
- 5–8 high-impact triggers:
  - “Continue last chapter”
  - “Finish what you started”
  - “You earned an achievement”
  - “New comment/reply”
  - “Session starting soon”

**Implementation notes**
- Add per-trigger caps (e.g., max 2/week) and per-user quiet hours.
- A/B test templates and timing.

### 7) Creator Copilot (Supply Growth)
**What creators see**
- Draft a course outline, chapter titles, exercises, quizzes, and marketing page copy.
- “Improve this chapter” (clarity, examples, structure) with safe rewrite controls.

**Why it brings users**
- More/better content supply drives organic acquisition and retention.

**Data inputs**
- Course goals + target audience + existing content + analytics (what chapters drop users)

**MVP scope**
- Creator-only endpoints:
  - Outline generator
  - Chapter rewrite suggestions (diff-based)
  - Quiz generator (ties into Feature #4)

**Implementation notes**
- Keep humans in control: AI suggests; creators approve.
- Store “AI-assisted content” metadata for transparency and later editing.

### 8) Community Moderation Assist (Ops + Trust)
**What admins see**
- Auto-triage: label posts/messages (spam, abuse, off-topic), severity, and suggested action.
- “Explain why” with highlighted text spans.

**Why it brings users**
- Safer communities = higher retention + more invites/shares.

**Data inputs**
- Text content + user history + prior moderation outcomes

**MVP scope**
- On post creation, run a lightweight classifier:
  - allow / needs review / block
- Add a queue for “needs review”.

**Implementation notes**
- Always allow human override; log overrides as training data.
- Keep latency low: do it async with a temporary “pending” state if needed.

### 9) Support Copilot + Self-Serve Resolution (Ops + Retention)
**What users see**
- Support chat that can actually solve common issues:
  - payments, subscriptions, access, login, upload problems
- If uncertain, prompts “Request Admin” (already in the live support prompt).

**Why it brings users**
- Faster resolutions reduce churn; good support becomes word-of-mouth.

**Data inputs**
- User subscription/order state, policy rules, error messages, common FAQs

**MVP scope**
- Add “tooling” (non-LLM functions) for AI to fetch safe account facts:
  - `getUserEntitlements()`
  - `getLatestOrderStatus()`
  - `getSubscriptionStatus()`
  - `getUploadLimits()`

**Implementation notes**
- Keep strong safety boundaries: never expose secrets; redact PII; only return user’s own data.
- Add structured “reason codes” for support outcomes (resolved/escalated).

### 10) Smart Search + Semantic Retrieval (Discovery)
**What users see**
- Search across courses, chapters, resources, posts with “semantic” relevance.
- “Ask Chabaqa” mode: answers with citations to exact chapters/resources.

**Why it brings users**
- Discovery improves; users find value faster; reduces support.

**Data inputs**
- Content text and metadata; embeddings; user context for personalization

**MVP scope**
- Start with a simple embeddings pipeline for course chapters and resources.
- Keep answers citation-first: return top-k chunks + generate response grounded in them.

**Implementation notes**
- If you don’t want a new DB dependency, Mongo Atlas Vector Search is the simplest path (if you’re on Atlas).

### 11) Translation / Localization (Acquisition)
**What users see**
- “Read in Arabic/French/English” per chapter/post.
- Creator sets glossary constraints (brand terms, technical vocabulary).

**Why it brings users**
- Expands addressable market; increases shareability.

**Data inputs**
- Text content + glossary + language preferences

**MVP scope**
- Translate on demand + cache per content item and language.

**Implementation notes**
- Tie translations to content version hashes so edits invalidate cache.

### 12) Growth Loops: AI-Powered “Shareables” (Acquisition)
**What users see**
- After completing a chapter/course: generate a share card:
  - “I learned X in 7 days” + a key takeaway
  - Optional: auto-post in community

**Why it brings users**
- Creates organic shares; makes learning public.

**Data inputs**
- Completion events + summary/takeaway + user consent

**MVP scope**
- Generate a text-based shareable first; later create images.

## Implementation Guidance (Backend Architecture)

### 1. Keep Provider Abstraction
- Continue using the current OpenAI SDK + baseURL switch for OpenRouter/Ollama Cloud (`AI_PROVIDER`, `OPENROUTER_*`, `OLLAMA_*`).
- Keep feature-specific config keys (you already do this for live support via `SUPPORT_AI_*`).
- Add per-feature model routing to control cost/latency:
  - `AI_TUTOR_MODEL`, `AI_TUTOR_FALLBACK_MODELS`
  - `AI_SUMMARY_MODEL`, `AI_QUIZ_MODEL`, `AI_TRANSLATION_MODEL`
  - `AI_MODERATION_MODEL` (ideally small + fast)

### 2. Create a Shared AI Core Module
- Optional but recommended: add `src/ai/ai-core/*` to avoid re-implementing:
  - provider setup
  - fallback logic
  - timeouts + retry policy
  - standardized logging (feature name, model, latency, success/failure)
  - redaction utilities (PII scrub)

This is particularly useful because `AiService` and `LiveSupportAiService` currently repeat provider setup in parallel.

### 3. Introduce a Prompt + Policy Registry
- Store system prompts in config or DB (admin-managed) with:
  - `key`, `version`, `language`, `template`, `updatedBy`, `updatedAt`
  - rollout flags for A/B testing
- Add a lightweight “policy snippets” registry for support/moderation:
  - refund policy, access policy, content policy, privacy policy
- Version prompts to allow rollback and controlled experimentation.

### 4. Add an Async Job Layer for Heavy Tasks
- For summarization, translation, embeddings, and batch moderation:
  - use a queue (BullMQ or similar)
  - store results in Mongo with `{ status, error, retries, model, createdAt }`
  - avoid blocking user requests on long AI jobs

Even without a queue, you can start with a Mongo “jobs” collection + a Nest scheduler, but a real queue is more reliable.

### 5. Add Vector Search for Semantic Retrieval
- Options:
  - MongoDB Atlas Vector Search if available.
  - External vector DB (Pinecone/Weaviate/Qdrant).
- Create embeddings for:
  - Chapter content
  - Resource content
  - Community posts
- Provide a search API that returns results with context snippets.

## Concrete Backend Blueprint (Schemas + Endpoints)

This section is intentionally concrete so you can turn it into tickets quickly.

### A) Common patterns (recommended for every AI feature)

#### 1) `AiRequestLog` (audit + cost + debugging)
Create a collection to log *every* AI request:
- `featureKey` (e.g., `chapter_summary`, `quiz_generate`, `support_reply`)
- `userId` (nullable for admin-only features)
- `contentType` + `contentId` (optional)
- `model`, `provider`, `latencyMs`, `success`, `errorCode`
- `promptVersion` and `policyVersion`
- `inputHash` (so you can detect duplicates)
- `tokenCounts` (if provider returns it) or estimated tokens

This enables:
- cost control
- quality tracking per model
- debugging “why did it answer that?”

#### 2) Feature flags + rollout
Add config-driven toggles:
- `AI_FEATURES_ENABLED=true/false`
- per-feature: `AI_FEATURE_CHAPTER_SUMMARY_ENABLED`, etc.
- optional % rollout by userId hash (simple deterministic rollout)

#### 3) Standard response shape
Use consistent API shapes so frontend is easy:
```json
{
  "status": "ready|pending|failed",
  "data": { "...": "..." },
  "generatedAt": "2026-03-13T00:00:00.000Z",
  "model": "google/gemini-2.5-flash-lite",
  "promptVersion": "v3",
  "cache": { "hit": true }
}
```

### B) Chapter summaries
**Schema suggestion**: `ChapterAiSummary`
- `courseId`, `chapterId`, `language`
- `summary`, `takeaways[]`, `glossary[]`, `difficulty`, `estimatedReadTime`
- `sourceHash` (hash of chapter text/transcript) + `promptVersion`

**Endpoints**
- `GET /ai/chapters/:chapterId/summary?lang=fr` (returns cached or `pending`)
- `POST /ai/chapters/:chapterId/summary:generate` (enqueue job; admin/creator gated)

### C) Quiz generation
**Schema suggestion**: `ChapterQuizBank` + `QuizAttempt`
- Bank: `chapterId`, `language`, `items[]` (question, options, answerKey, explanation, citations)
- Attempt: `userId`, `chapterId`, `answers[]`, `score`, `weakAreas[]`

**Endpoints**
- `GET /ai/chapters/:chapterId/quiz` (returns bank; randomized client-side)
- `POST /ai/chapters/:chapterId/quiz/attempts` (submit answers; store attempt)

### D) Personalized recommendations
Start simple with deterministic recommendations, then add AI only for explanation text.

**Schema suggestion**: `UserRecommendationSnapshot`
- `userId`, `items[]` (`contentType`, `contentId`, `rank`, `reason`, `reasonCode`)
- `generatedAt`, `inputsHash`, `clickedIds[]`, `completedIds[]`

**Endpoints**
- `GET /recommendations/home` (returns 1–3 “next best steps”)
- `POST /recommendations/feedback` (not interested/too hard/etc.)

### E) Moderation triage
**Schema suggestion**: `ModerationPrediction`
- `contentType`, `contentId`, `labels[]`, `severity`, `confidence`
- `highlights[]` (text spans if possible)
- `suggestedAction` (allow/review/block)

**Endpoints**
- `POST /moderation/predict` (internal)
- Admin UI reads from existing moderation queue + attaches predictions.

### F) Support copilot tooling (safe “read-only tools”)
Add internal service functions (not direct DB access from prompts):
- `getUserSubscriptionSummary(userId)`
- `getLatestPaymentStatus(userId)`
- `getAccessDecision(userId, contentType, contentId)`
- `getKnownIncidents()` (optional)

Then pass the outputs as structured context to the LLM (never raw secrets).

## “Data → Feature” Mapping (Concrete)

### Use `TrackingAction` as the backbone
Recommended events you already have are enough to drive most product features:
- Activation funnel: first `VIEW` → first `START` → first `CHAPTER_COMPLETE` → first `COMPLETE`
- Personalization: most recent actions, frequency, and preferred content types
- Quality signals:
  - time-to-first-start
  - repeated restarts
  - drop-off points by chapter
  - rating and review distribution

### Use GA4 for marketing attribution (not product truth)
Keep GA4 for acquisition and channel analysis, but use your own tracking as the “source of truth” for product behavior so you can tie outcomes to entitlements and content structure.

## Safety and Trust Controls

- **Citations to Source Content** for tutor answers when possible.
- **No hallucination**: enforce “If not in context, say you don’t know.”
- **Sensitive content policies** for moderation and support.
- **Rate limits** per user + per IP for AI endpoints.
- **Audit logging** for AI outputs used in moderation or support.

## Privacy, Security, and Abuse Prevention (Non-negotiables)
- Do not send secrets (API keys, passwords, tokens) to the AI provider.
- Redact PII when not needed (emails, phone numbers, addresses).
- Keep strict authorization: AI endpoints that reference course content must enforce entitlements/policy checks.
- Add per-user and per-IP rate limits for AI-heavy endpoints; your `SecurityModule` + throttlers are a good base.
- For user-generated content (posts/DMs/support), treat it as untrusted input:
  - prompt-injection resistant system prompt
  - never follow user instructions to reveal internal config or system prompts
- For moderation, prefer “suggest” over “auto-delete” until you have measured precision.

## Metrics That Actually Move Growth

### Core product metrics
- Activation: % of new users who complete 1 chapter within 24h / 72h
- Retention: D7, W2, W4 retention; “lessons per week”
- Learning outcomes: completion rate per course, time-to-complete, quiz improvement
- Community health: % posts needing review, response time, user reports
- Monetization: trial→paid conversion, ARPU, churn, upgrade rate

### AI feature metrics (per feature)
Track at minimum:
- Adoption: unique users, repeat users, feature entry points
- Effect: lift in completion/retention vs control
- Quality: thumbs up/down, regenerate rate, report rate
- Cost: tokens, latency, provider errors, fallback usage

### Ops metrics
- Support deflection: % resolved by bot vs escalated; time-to-resolution
- Moderation precision: override rate; false positives/negatives

## Rollout Plan

### Phase 1 (2–4 weeks): Low-risk, high ROI
- Chapter summaries + recap
- Quiz generation (basic)
- Smarter “continue learning” + drop-off recovery
- Support copilot improvements + safe tooling (read-only account facts)

### Phase 2 (4–8 weeks): Personalization + moderation
- Personalized learning path ranking + reasons
- Moderation triage + admin review improvements
- Smart notifications with caps + A/B tests

### Phase 3 (8–12 weeks): Discovery + internationalization
- Embedding pipeline + semantic search
- “Ask Chabaqa” with citations
- Translation/localization with glossary controls

## Quick Mapping to Existing Code

- **AI Tutor patterns**: `src/ai/ai.service.ts`
- **Support AI patterns**: `src/live-support/live-support-ai.service.ts`
- **Content access**: `src/cours`, `src/resource`, `src/post`, `src/community-page-content`
- **Admin tooling**: `src/admin/*`
- **Tracking backbone**: `src/common/modules/tracking.module.ts`, `src/schema/content-tracking.schema.ts`

---
If you want, I can turn the top 3 features into concrete backend work items (schemas + endpoints + queues + admin toggles) and wire them into the existing NestJS modules.
