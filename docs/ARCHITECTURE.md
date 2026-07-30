# Architecture

## Overview

This codebase started as a Decodo-powered Reddit report generator. The target direction is now a more general **Reddit Topic Agent**:

- collect Reddit posts and comments for a broad topic or a specific subreddit
- preserve raw discussion data for reuse
- extract structured signals from real user comments
- return agent-style outputs for research, product, and market analysis

The monorepo layout remains:

- `apps/frontend`: operator UI
- `apps/backend`: scraping, orchestration, storage, analysis
- `apps/shared`: reusable types

## Current Runtime Shape

Today the system still follows the original flow:

1. generate a scraping plan from a user prompt
2. collect Reddit posts through the active scraping provider
3. deep-dive into top post comments
4. summarize findings with an LLM
5. persist the run in MongoDB

This is still useful as the first operational version, but it should be treated as the foundation for a richer topic-analysis backend rather than the final architecture.

## Target Backend Layers

The backend should evolve toward four clearer layers.

### 1. Planning

Turns a broad topic into:

- candidate subreddits
- search queries
- time windows
- collection depth rules

This may use an LLM, but later we should allow rule-based fallback or cached topic templates.

### 2. Collection

Fetches posts and comment threads from Reddit through interchangeable providers.

Planned provider direction:

- `reddit-direct`: direct Reddit JSON provider
- `decodo`: optional managed provider

The important design rule is that orchestration should not depend on a single source vendor.

### 3. Normalization

Maps source payloads into stable internal entities such as:

- posts
- comments
- subreddits
- collection metadata

This layer should preserve raw text and source metadata so downstream analyses do not need to re-scrape.

### 4. Analysis

Converts normalized Reddit content into structured outputs. The long-term goal is to move beyond a single report summary and support agent-oriented fields such as:

- pain points
- feature requests
- objections
- sentiment
- representative quotes
- buying signals
- follow-up investigation suggestions

## Current Request Flow

### `POST /tracker/plan`

1. `TrackerController` receives `{ prompt, subreddits?, timeRange? }`
2. `TrackerService.generatePlan()` calls `LlmService.complete()`
3. `LlmService` resolves the active provider through `SettingsService`
4. a reviewable scraping plan is returned to the frontend

### `POST /tracker/analyze`

1. `TrackerController` receives a confirmed plan
2. `TrackerService.analyzePlan()` orchestrates:
   - parallel search scraping
   - subreddit feed scraping
   - deduplication and ranking
   - top-post comment deep dives
   - LLM summarization
   - Mongo persistence
3. the API returns `{ id, plan, posts, report }`

## Module Boundaries

### `tracker`

Pipeline orchestrator. This is the correct place for progress reporting and workflow sequencing, but not for vendor-specific scraping logic.

### `decodo`

Optional managed Reddit collection provider. It wraps Decodo and maps Reddit JSON responses into internal post and comment types.

### `reddit-source`

Provider selector for collection. It chooses between `reddit-direct` and `decodo` based on runtime settings while keeping the tracker pipeline unchanged.

### `llm`

Provider abstraction for plan generation and analysis. It currently supports:

- `claude`
- `openai`
- `gemini`
- `deepseek`

The interface should stay stable while the output schema becomes more agent-oriented.

### `queries`

Stores historical runs. This is the beginning of a future research memory layer, but today it stores one saved analysis per run.

### `settings`

Stores runtime provider and model preferences. Secrets remain environment-only.

## Near-Term Roadmap

### Phase 1

- support `deepseek` cleanly
- make `reddit-direct` the default collection provider
- keep Decodo available as a fallback
- preserve the current report flow so the app stays usable during refactor

### Phase 2

- separate raw collection data from analyzed outputs
- extend the report schema toward topic-agent fields

### Phase 3

- save topic templates
- support scheduled refreshes
- detect discussion changes over time
- expand beyond Reddit when useful
