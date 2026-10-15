# System AI Preferences Design

## Goal

Add instance-wide AI and semantic-search switches that organization admins can manage from Settings. A disabled system feature is unavailable to every organization, even when its organization or personal preference remains enabled.

## Scope and behavior

- Add a singleton `SystemPreference` record with `isAiEnabled` and `semanticSearchEnabled`, both defaulting to `true` so existing behavior is preserved.
- Add a System Preferences page to Settings. It is visible to authenticated organization admins, following the product decision that any organization admin may edit instance-wide preferences.
- Add authenticated admin-only read/update endpoints. Validate updates to the two booleans and return only the editable preferences.
- Enforce the system AI switch in the shared LLM configuration resolver, so interactive AI, borderline spam classification, and automatic summaries all bypass model calls when disabled. Summary jobs produce the existing basic digest. The organization AI switch and the member's personal AI preference remain additional controls.
- When system AI is off, the organization AI settings UI hides provider/model/key/base URL/prompt controls, as it does when the organization switch is off.
- Enforce semantic search only when both the system-wide and member preference are enabled. Otherwise use lexical search with the existing access filters and pagination.
- Meilisearch's index embedder is configured on worker startup from the system preference. Changing semantic search to off resets the index's embedders setting, preventing automatic embedding requests for newly indexed documents; turning it on restores the configured embedder. Existing embeddings may remain stored, but are not used while the feature is disabled.

## Data flow

The System Preferences page reads and updates the singleton through the settings API. Server-side AI calls and search routes read the singleton directly before making optional AI/semantic requests. The settings API also updates the Meilisearch embedder setting when semantic search changes, and worker startup reconciles the index setting with the stored preference.

## Failure behavior

- A disabled or unavailable AI provider follows the existing local spam and summary fallback paths.
- A disabled or failed hybrid search retries or uses lexical search with the same query and access constraints.
- The preferences API reports persistence or Meilisearch update failures instead of showing a successful toggle that was not applied.

## Out of scope

- A distinct platform-admin identity or role. By decision, organization admins share the system preference controls.
- Per-organization defaults or override rules; system-level switches are hard gates.
- Deleting embeddings already stored in Meilisearch when semantic search is disabled.

## Review note

Meilisearch documents a reset-embedders operation that removes the index embedder configuration. The application will use the installed JavaScript SDK's `resetEmbedders()` operation and restore configuration through its existing `updateSettings()` setup path. See the [Meilisearch Reset embedders API](https://www.meilisearch.com/docs/reference/api/settings/reset-embedders).
