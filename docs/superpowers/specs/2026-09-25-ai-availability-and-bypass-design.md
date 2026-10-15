# AI Availability and Bypass Design

## Goal

Keep email processing and spam checks working when an AI provider or configured model is unavailable, and let an organization administrator disable AI features with the existing setting.

## Current behavior

- The Experimental Features page already has an `isAiEnabled` setting, but its label describes only AI email summarization.
- The shared LLM client reads the first experiment setting in the database and falls back to environment configuration when the setting is disabled. This can allow AI calls to continue while the UI says AI is off.
- Draft, explanation, and toolbox routes call a provider and return an error when it fails.
- Summary jobs fail when AI is disabled or provider calls fail, stopping notifications.
- Mail synchronization has a local statistical spam classifier, but an optional legacy model call may be attempted for borderline results. It is not governed by the organization setting.
- Meilisearch search always requests hybrid semantic ranking with the `default` embedder, even if the embedding endpoint or model is unavailable.

## Design

Use the existing organization-scoped `isAiEnabled` value as an administrator-controlled master switch. When it is off, keep the enable switch visible and hide the provider, model, API key, base URL, and custom prompt controls. When it is on, show those configuration controls. A disabled organization setting prevents external model calls even when environment variables are configured.

Add per-member preferences to the existing Preferences area so each signed-in member can independently enable or disable AI-assisted personal actions and Meilisearch semantic embeddings. These preferences are organization-membership scoped. The organization master switch always takes precedence over a member's AI preference. Background organization work (automatic spam classification and queued summaries) follows the organization setting, while interactive draft, explanation, toolbox, and manual spam actions respect both the organization switch and the current member's preference.

Meilisearch searches use hybrid semantic ranking only when the current member has embeddings enabled. If the embedding provider or model is unavailable, retry the same search as lexical/full-text search without the hybrid embedder so search results remain available.

When AI is disabled, unavailable, or returns a provider/model error:

- Email synchronization continues. Automatic spam classification uses the local statistical classifier result for borderline messages.
- Manual spam and phishing checks use the same local classifier and return its score, risk decision, and reason when AI is disabled or unavailable. User spam feedback and training remain available.
- Label summary jobs use a deterministic digest of available subject, sender, date, and snippet data. The digest is identified as a basic fallback summary, and the worker continues to webhook notification and completion.
- Interactive draft generation, email explanation, and non-spam toolbox actions return a clear unavailable/disabled response without blocking ordinary email operations.

## Error handling and boundaries

Provider timeouts, connectivity failures, unavailable models, authentication errors, and provider error responses are treated as AI unavailability for optional background work. Fallbacks are limited to AI-dependent operations; unrelated database, search, or notification failures keep their existing error behavior. Interactive AI-only operations do not fabricate successful generated content.

Provider configuration and the master switch remain organization-scoped; personal AI and embedding preferences are scoped to the organization membership. The spam-check flow will receive organization context so its enablement decision and model configuration cannot leak across organizations. The current schema will need member preference fields or an equivalent membership preference record; the existing organization-level master switch remains unchanged.

## Verification

Verify member preferences are isolated by organization membership, the settings API preserves the disabled master state, the LLM client refuses calls when the organization or member has disabled AI, provider failures take the specified local/digest fallback paths, semantic-search failures retry lexically, and unrelated worker failures still fail normally. Review the affected route and UI responses for clear disabled/unavailable messaging and confirm AI provider controls disappear while the organization master switch is off.
