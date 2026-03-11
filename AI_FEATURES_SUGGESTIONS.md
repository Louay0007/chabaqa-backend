# AI Feature Suggestions for Chabaqa

This document proposes additional AI features that fit Chabaqa’s learning, community, and commerce platform. It is grounded in the current backend integrations (AI Tutor + Live Support AI) and assumes the existing OpenRouter/Ollama Cloud provider abstraction.

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

## Suggested AI Features (Prioritized)

1. **Personalized Learning Paths**
- Goal: recommend next lessons, challenges, and resources based on progress and goals.
- Inputs: course progress, quiz/challenge outcomes, engagement signals.
- Output: ranked list of next items + short rationale.
- Fit: boosts retention and completion.

2. **Chapter Summaries and Micro-Notes**
- Goal: auto-generate short summaries, key takeaways, and quick-reference notes per chapter.
- Inputs: chapter content + notes.
- Output: summary, bullet takeaways, optional glossary.
- Fit: improves learning outcomes, searchable content.

3. **AI Quiz + Practice Generator**
- Goal: generate practice questions tailored to chapter difficulty.
- Inputs: chapter content, target difficulty.
- Output: MCQ/short answer + correct answers + explanation.
- Fit: increases engagement and measurable learning.

4. **Community Moderation Assist**
- Goal: triage and label content for moderation queue, with confidence scores.
- Inputs: post/comment text, user history signals.
- Output: category + severity + action suggestion (flag/allow/needs review).
- Fit: reduces admin workload and improves safety.

5. **Creator Content Assistant**
- Goal: help instructors draft lessons, exercises, and course outlines.
- Inputs: course goal, target audience, desired outcomes.
- Output: structured outline + lesson drafts.
- Fit: accelerates course creation and onboarding of new creators.

6. **Support Copilot for Admins**
- Goal: generate draft responses for human support agents.
- Inputs: ticket history + user context + policy docs.
- Output: suggested response with citations to internal policy text.
- Fit: faster support, consistent policies.

7. **Smart Search + Semantic Retrieval**
- Goal: allow learners to search across courses, resources, and community content with semantic similarity.
- Inputs: embeddings over course content, community posts, resources.
- Output: ranked results with highlights.
- Fit: better content discovery.

8. **AI Translation / Localization**
- Goal: translate course content and community posts to expand reach.
- Inputs: source text, target language.
- Output: translated text with optional glossary constraints.
- Fit: international growth.

## Implementation Guidance (Backend Architecture)

### 1. Keep Provider Abstraction
- Continue using the current OpenAI SDK + baseURL switch for OpenRouter/Ollama Cloud.
- Add feature-specific config keys for models and timeouts, similar to `SUPPORT_AI_*`.

### 2. Create a Shared AI Core Module
- Add `src/ai/ai-core` with:
  - Provider setup and model fallback logic
  - Shared retry + error classification
  - Centralized logging and metrics hooks
- This avoids duplication across new AI features.

### 3. Introduce a Prompt + Policy Registry
- Store system prompts in config or DB (admin-managed).
- Create a small table/collection for prompt templates and safety rules.
- Version prompts to allow rollback and A/B testing.

### 4. Add an Async Job Layer for Heavy Tasks
- For summarization, translation, or embedding generation, use a queue (BullMQ or similar).
- Store results in Mongo with status (pending/ready/failed).
- Avoid blocking user requests on long AI jobs.

### 5. Add Vector Search for Semantic Retrieval
- Options:
  - MongoDB Atlas Vector Search if available.
  - External vector DB (Pinecone/Weaviate/Qdrant).
- Create embeddings for:
  - Chapter content
  - Resource content
  - Community posts
- Provide a search API that returns results with context snippets.

## Safety and Trust Controls

- **Citations to Source Content** for tutor answers when possible.
- **No hallucination**: enforce “If not in context, say you don’t know.”
- **Sensitive content policies** for moderation and support.
- **Rate limits** per user + per IP for AI endpoints.
- **Audit logging** for AI outputs used in moderation or support.

## Data and Metrics

Track:
- AI usage per feature (calls, tokens, latency)
- Completion and retention lift for learning features
- Support deflection rate (bot resolves vs escalates)
- Moderation accuracy (admin overrides)

## Rollout Plan

1. Phase 1: Low-risk features
- Chapter summaries
- Quiz generation
- Admin support drafts

2. Phase 2: Moderation + personalization
- Moderation assist
- Learning paths

3. Phase 3: Semantic search + translation
- Embedding pipeline
- Multilingual content

## Quick Mapping to Existing Code

- **AI Tutor patterns**: `src/ai/ai.service.ts`
- **Support AI patterns**: `src/live-support/live-support-ai.service.ts`
- **Content access**: `src/cours`, `src/resource`, `src/post`, `src/community-page-content`
- **Admin tooling**: `src/admin/*`

---
If you want, I can turn any of the above into a concrete endpoint + schema design and wire it into the existing NestJS modules.
