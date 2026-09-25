# AI Availability and Bypass Design

## Goal

Keep email processing and spam checks working when an AI provider or configured model is unavailable, and let an organization administrator disable AI features with the existing setting.

## Current behavior

- The Experimental Features page already has an `isAiEnabled` setting, but its label describes only AI email summarization.
- The shared LLM client reads the first experiment setting in the database and falls back to environment configuration when the setting is disabled. This can allow AI calls to continue while the UI says AI is off.
- Draft, explanation, and toolbox routes call a provider and return an error when it fails.
- Summary jobs fail when AI is disabled or provider calls fail, stopping notifications.
- Mail synchronization has a local statistical spam classifier, but an optional legacy model call may be attempted for borderline results. It is not governed by the organization setting.

## Design

Use the existing organization-scoped `isAiEnabled` value as a master switch. The Experimental Features page will describe that it controls all AI-powered features. All provider-backed routes and workers will resolve settings for the authenticated or job organization, and a disabled setting will prevent external model calls even when environment variables are configured.

When AI is disabled, unavailable, or returns a provider/model error:

- Email synchronization continues. Automatic spam classification uses the local statistical classifier result for borderline messages.
- Manual spam and phishing checks use the same local classifier and return its score, risk decision, and reason. User spam feedback and training remain available.
- Label summary jobs use a deterministic digest of available subject, sender, date, and snippet data. The digest is identified as a basic fallback summary, and the worker continues to webhook notification and completion.
- Interactive draft generation, email explanation, and non-spam toolbox actions return a clear unavailable/disabled response without blocking ordinary email operations.

## Error handling and boundaries

Provider timeouts, connectivity failures, unavailable models, authentication errors, and provider error responses are treated as AI unavailability for optional background work. Fallbacks are limited to AI-dependent operations; unrelated database, search, or notification failures keep their existing error behavior. Interactive AI-only operations do not fabricate successful generated content.

AI settings remain organization-scoped. The spam-check flow will receive organization context so its enablement decision and model configuration cannot leak across organizations. No schema migration is expected because the existing setting already stores the required organization-level switch.

## Verification

Verify the settings API preserves a disabled value, the LLM client refuses calls while disabled, provider failures take the specified local/digest fallback paths, and unrelated worker failures still fail normally. Review the affected route and UI responses for clear disabled/unavailable messaging.
