# Changelog

## Unreleased

## 1.0.26 - 2026-09-05

- Keep each history result tied to its own prompt, model, size, and download/share metadata.
- Use independent, keyboard-accessible dialogs for image/video previews, full prompts, sharing, and queue errors.
- Give prompt-only previews a full reading area and keep copy/use actions visible while scrolling.
- Align download, share, and close controls at the top right on desktop and mobile; remove the empty video side column.
- Preserve video type and generation settings when sharing to the inspiration library.
- Add browser coverage for nested dialogs, per-result metadata, mobile geometry, prompt use, and native video controls.

## 1.0.14 - 2026-08-16

- Made the assistant route visibly independent from individual provider editors;
  the library now chooses a saved provider first and then its assistant model.
- Added an administrator-triggered GitHub Release VPS updater with a protected
  update request, pre-upgrade data backup, tag/version checks, and rollback to
  the previous deployed commit. No timer or silent background upgrade is enabled.

## 1.0.13 - 2026-08-16

- Split the history service into a one-package runtime manifest so VPS, Docker,
  and service zip installs no longer include frontend or desktop build tools.
- Updated Vite, PostCSS, nanoid, Babel, and Undici within their compatible major
  versions; full, production-only, and service-runtime audits now report zero
  known vulnerabilities.
- Moved Vite and its React plugin to development dependencies and added deploy
  contracts that reject service dependency drift or mismatched release versions.
- Made cancellation smoke tests deterministic and aligned dispatched-job checks
  with the existing unknown-result and billing-reconciliation contract.
- Updated the Vite configuration to the ESM-native directory API and removed
  recovery-test requirements for route explanation text already covered by
  request-level route tests.

## 1.0.12 - 2026-08-16

- Moved prompt-assistant selection out of provider profiles and into one
  provider-library route that selects an assistant provider and model.
- Added a two-step first-run guide that saves a URL, session-only key, and image
  model before directly submitting the user's first image generation.
- Tightened provider, login, and single-generation copy while adding softer
  panel motion, rounded controls, and responsive first-run layouts.
- Fixed prompt optimization after a successful non-streaming response and kept
  queue fingerprint construction behind the generation boundary.
- Added browser regressions for assistant routing, first-run generation, secret
  storage, provider deletion fallback, and mobile overflow.

## 1.0.11 - 2026-08-16

- Removed the blank footer below the idle single-generation workspace by making
  both columns fill the available viewport height.
- Split provider settings into mutually exclusive library and editor views, with
  a dedicated back action for new and existing provider drafts.
- Made manual credentials and account binding mutually exclusive, and now render
  model fields and defaults from the selected provider type.
- Added desktop layout, provider workflow, and standalone authentication-mode
  browser regressions.

## 1.0.10 - 2026-08-16

- Compacted the single-generation control column so the form and status panels
  fill the available width without an unused vertical gutter.
- Aligned the provider and model fields, removed redundant helper text, and made
  status metrics expand to fill their final row.
- Added visual regression checks for panel alignment, batch-count persistence,
  and independent four-image generation jobs.

## 1.0.9 - 2026-08-16

- Added a redesigned standalone login and account-recovery flow with one-time
  admin reset codes and a shorter 8-character minimum password policy.
- Changed image batch generation to fan out into independent queue jobs so each
  image has its own status, billing, history record, and server-side dedupe key.
- Polished the single-flow control column and prompt scrollbar so the left rail
  no longer reserves a large visible track or native arrow controls.
- Added frontend and executor regression coverage for password recovery and
  independent batch requests.

## 1.0.8 - 2026-08-16

- Made the saved provider library list-first in the standalone settings panel.
- Added a server-side credit recharge foundation with configurable shop links,
  one-time CDK redemption, and auditable credit transactions.
- Added the first standalone admin controls for recharge policy and CDK inventory.
- Added server-side Sub2API/NewAPI account binding with encrypted provider keys and
  a saved connection selector for generation.
- Reduced the default standalone password minimum to 8 characters without
  changing PBKDF2 hashing or login rate limits.

## 1.0.7 - 2026-08-01

- Forwarded the original `X-Client-Request-ID` through xAI-compatible video creation, polling, and protected content download requests.
- Added an affinity-sensitive regression test that rejects polling or content requests when the client request ID changes or is missing.
- Extended the bounded transient video-poll window to 450 failures by default (about thirty minutes at the default interval), covering provider-pool long tails that return temporary `404` responses while a task is still being scheduled.

## 1.0.6 - 2026-08-01

- Added bounded retries for transient `404`, rate-limit, and upstream `5xx` responses while polling asynchronous xAI-compatible video tasks.
- Added a regression test covering an account-pool miss followed by temporary unavailability and successful completion.

## 1.0.5 - 2026-08-01

- Detected PNG, JPEG, and WebP from returned image bytes before persisting xAI-compatible base64 results.
- Added a standalone regression test for JPEG bytes returned while the requested output format is PNG.

## 1.0.4 - 2026-08-01

- Requested `b64_json` output for xAI-compatible image generation so standalone history can persist image bytes without fetching temporary provider CDN URLs.
- Added browser and service regression checks for the durable xAI image response path.

## 1.0.3 - 2026-08-01

- Added an `xai-compatible` provider adapter for Grok Imagine-style image and asynchronous video routes.
- Normalized `request_id`, `status: done`, nested `video.url`, protected video content downloads, and HTTP-relative media URLs.
- Kept xAI image request bodies minimal by omitting unsupported `size` and `quality` fields.
- Enabled standalone video jobs through the persistent service queue and added model selection from saved provider settings.
- Added Git-sync configuration for `STUDIO_PROVIDER_TYPE` and `STUDIO_PROVIDER_BASE_URL`, plus Go dispatch coverage and browser/service smoke tests.

## 1.0.2 - 2026-07-28

- Added standalone self-registration so users can create Image Agent Studio accounts without admin-created credentials.
- Added `STUDIO_AUTH_REGISTRATION_MODE=open|disabled`, defaulting to open for independent multi-user deployments.
- Updated the standalone login page with a compact login/register flow and clean UTF-8 Chinese copy.
- Added service and frontend smoke coverage for registration, duplicate-account rejection, disabled registration, and session creation after signup.
- Passed the registration mode through Docker Compose and environment/config contract checks.

- Added a VPS Git sync deployment path so production can pull the repository, build locally, update static/service files, and verify protected data instead of relying on manual zip uploads.
- Documented the production data split between repository-managed code and `/var/lib/image-sub2api-studio` persistent history/library assets.
- Simplified the creation composer into a Codex-like bottom conversation, moved image parameters below the input, moved reference images into a right-side panel, and made generation progress easier to scan.
- Refined the bottom composer into a lighter two-line parameter dock to prevent controls from overlapping on narrower desktop viewports.
- Moved the session/route badge into the composer header, restored the left-side Inspiration Library entry, exposed upstream model-sync status for custom gateways, centered canvas nodes when reopening sessions, and aligned History Gallery actions.
- Added an independent collapsed state for the bottom parameter dock so the canvas/composer can gain vertical space while keeping a one-line parameter summary visible.
- Polished the parameter dock interaction with clearer hover/focus states, touch-friendly horizontal scrolling, scroll cues, and stable control sizing to reduce overlap risk.

## 0.8.1 - 2026-06-01

- Expanded the English UI pass across the canvas node controls, reference panel, bottom creation conversation, and parameter rail.
- Fixed current-session recovery for old cached `blob:` URLs by falling back to the persisted `/studio-api/history/.../assets/...` URL before rendering.
- Added browser verification for language switching and persisted asset recovery.

## 0.8.0 - 2026-05-30

- Added `SECURITY.md` to clarify supported scope, out-of-scope responsibilities, key handling, stored data, production hardening, and known limits.
- Added `RELEASE_NOTES.md` with the 0.8 persistence upgrade, deployment impact, verification checklist, and license/security notes.
- Clarified README review boundaries: the open-source package excludes real keys, the private production gallery, the production home page, and Sub2API backend implementation.
- Tightened license wording so the MIT license applies to project code, while community prompt templates and third-party content keep their own attribution and licensing requirements.
- Added Chinese/English UI switching in the lower-left account area and refreshed README screenshots.

- Redesigned the studio around an infinite canvas plus a bottom creation conversation.
- Added visible canvas lineage for #1 -> #2 / #3 continuation flows.
- Grouped the left project list and history gallery by creation session instead of splitting every generated image into a separate project.
- Improved the prompt assistant so the latest user direction wins, especially for derive, local edit, rewrite, remove, and replace instructions.
- Added pending-review states for timeout, manual stop, and interrupted generation, with clearer quota warnings when the upstream request may still be processing.
- Preserved streamed preview images on the canvas before final completion, reducing image loss after refresh or frontend interruption.
- Refined the bottom conversation UI, compact assistant action, parameter rail behavior, and project cards.
- Updated README screenshots, release story, deployment notes, and VPS update wording for the 0.8 release.

## 0.6.0 - 2026-05-28

- Added `/studio-api/session` for authenticated current-session persistence.
- The active canvas, selected node, prompt context, generation status, parameters, and recent result URLs can restore after refresh.
- Session image data URLs are converted into private user-scoped service assets instead of staying only in browser storage.
- The frontend fetches the remote session after login and debounces server-side session snapshots while editing or generating.

## 0.5.0 - 2026-05-28

- Stabilized image generation around direct image-model endpoints; current releases use `/v1/images/generations` for text-to-image, while `/v1/responses` is kept only for explicit compatibility testing.
- Routed reference-image editing and Mask redraw through `/v1/images/edits`.
- Added an infinite-canvas creation area where results remain in the current session and previous images can be selected for continuation.
- Masked user keys in the UI.
- Added the local development proxy `VITE_DEV_SUB2API_PROXY_TARGET` for real upstream testing.
- Reworked image/video workspaces, template library, inspiration plaza, history records, deployment docs, acknowledgements, and asset-library protection notes.
