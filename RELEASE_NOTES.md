# Release Notes

## 1.0.28

This release makes inspiration publishing explicit and strengthens data durability.

- Saves remain private by default. Confirmed public shares are visible across signed-in accounts, support per-user voting and author withdrawal, and never expose account identifiers.
- Public media owns an independent copy. New remote links are converted to uploads when readable, with replacement uploads for expired links. Deleting old history preserves media used by existing private shares.
- Main prompt fields preserve up to 100,000 JavaScript characters and reject larger inputs explicitly instead of truncating them at 12,000.
- Task deduplication includes reference content, masks, provider settings, and video parameters; the service computes its own SHA-256 fingerprint instead of trusting the browser.
- Backup restores use a staged journal and whole-operation rollback after failures or process interruption. Personal restores do not republish global shares.
- Requests check cancellation before dispatch, avoiding a pre-aborted multipart upload crash.
- Minimal development dependency updates address the reported xmldom and fast-uri audit findings.

Verification coverage includes cross-account publication/access/withdrawal, concurrent voting,
prompt boundaries, media lifetime, input-aware deduplication, mobile sharing controls, and
restore failure/process-exit injection at all 11 file-switch positions. The file backend
still requires a single writer. Restore is not an fsync/power-loss transaction; existing
private shares are not automatically published. Real paid generation and Go compilation
are outside this release's verification.

## 1.0.27

This release hardens persistence, shared media, backup validation, and preview dialogs.

- Per-user in-process locks prevent concurrent history, session, job, and community writes from overwriting acknowledged changes.
- Multiline prompts preserve their internal formatting, and saved/shared results retain image and video generation parameters, including zero reference counts.
- New shares own copies of local result media, so deleting the source history does not break those shares.
- Video sessions persist MP4/WebM assets correctly, with validated byte-range reads.
- Backup payloads and asset paths are validated before existing data changes; restores are blocked while generation jobs are active.
- Authenticated image/video sharing previews release temporary blob URLs on close, with consistent English and Chinese parameter labels.
- Prompt lightbox styles are simplified, and the local regression suite now includes data integrity, backup, and modal hardening checks.

Verification: the complete `check:local` suite passed before the release-only version bump,
including all 10 data-integrity tests and browser regressions with local/mock data.
The file backend still requires a single writer process; prompts remain limited to 12,000
characters. Existing shares are not migrated, and backup restoration is not a crash-atomic
transaction. Real paid upstream generation and Go compilation/tests were not run.

## 1.0.26

This release fixes preview readability and keeps shared creations tied to their original generation settings.

- History previews and shares now use the selected result's prompt and parameters.
- Full prompts and queue errors open in independent dialogs with internal scrolling and copy actions.
- Pure text previews no longer reserve space for a missing image.
- Image/video download, share, and close controls share a compact top-right toolbar.
- Nested dialogs handle Escape and keyboard focus without closing the underlying preview.
- Video sharing retains its media type, duration, and frame rate in the inspiration library.

Verification: production build, source/i18n/UI checks, Studio modal flows, history lightbox/session/windowing,
community prompt flow, inspiration prompt/reference flow, composer layout, and standalone service smoke checks.

## 1.0.14

This release makes assistant routing explicit in the provider library and adds
a manual GitHub Release upgrade action to the administrator console.

### What Changed

- The provider library displays an independent assistant configuration.
- The assistant provider is selected from saved providers, and its model comes
  from that provider's synced response models or manual model entry.
- Provider editors never persist assistant model fields.
- Administrators can click "检查并更新" in the backend. The authenticated
  service queues a fixed request, and a root-owned systemd path/service checks
  the latest stable GitHub Release only for that request.
- The updater backs up data, deploys the exact tag, runs the existing checks,
  and rolls back to the previous commit on failure. No timer or silent update
  is installed.

### Verification

- `npm run smoke:provider:security`
- `npm run check:i18n`
- `npm run check:source`
- `npm run check:studio-build`
- `npm run check:release`

## 1.0.13

This patch reduces the production service install to its actual runtime
dependency and clears the dependency audit findings reported during deployment.

### What Changed

- Git-sync, Docker history images, and service zip packages now install from a
  dedicated runtime manifest containing only Undici.
- Frontend build tools remain available for builds but no longer enter
  production-only installs.
- Compatible security updates cover Vite, PostCSS, nanoid, Babel, and Undici.
- Deployment contracts verify the runtime dependency allow-list and keep the
  service manifest version aligned with the application release.
- Cancellation regressions now distinguish queued refunds from dispatched jobs
  that require billing reconciliation.

### Verification

- `npm audit --registry=https://registry.npmjs.org`
- `npm audit --omit=dev --registry=https://registry.npmjs.org`
- `npm audit --omit=dev --prefix deploy/service-runtime --registry=https://registry.npmjs.org`
- `npm run check:local`
- `npm run package:release`

## 1.0.12

This patch separates prompt-assistant routing from generation providers and
adds a direct first-image onboarding flow.

### What Changed

- Provider profiles now store only their connection and generation models.
  The provider library owns one independent assistant provider/model route.
- Prompt optimization and assistant chat use that selected assistant route,
  even when image generation uses another provider.
- New users can enter a provider URL, session-only key, image model, and first
  prompt in a compact two-step guide that submits the first generation directly.
- Provider and login surfaces use less explanatory copy, smoother panel motion,
  and responsive rounded controls inspired by the DSH desktop treatment.
- Fixed the prompt optimizer's successful-response return path and reset the
  assistant model safely when its provider is deleted.

### Verification

- `npm run smoke:provider:security`
- `npm run smoke:standalone:frontend`
- `npm run check:boundaries`
- `npm run check:css`
- `npm run check:ui`
- `npm run check:standalone-auth`
- `npm run check:storage-security`
- `npm run build`

## 1.0.11

This patch removes the remaining idle workspace gap and turns provider setup into
a focused, type-aware flow.

### What Changed

- The result panel now reaches the bottom of the single-generation workspace,
  while the idle status panel remains content-sized.
- Opening a new or existing provider replaces the provider library instead of
  stacking an editor below it.
- Manual API credentials and Sub2API/NewAPI account binding are explicit,
  mutually exclusive choices.
- Provider model fields and defaults follow the selected provider type, so
  image-only providers do not show video settings.

### Verification

- `npm run smoke:image:route`
- `npm run smoke:provider:security`
- `npm run smoke:standalone:frontend`
- `npm run check:i18n`
- `npm run build`

## 1.0.10

This patch tightens the single-generation workspace and removes the empty areas
that made the control column look fragmented.

### What Changed

- The form and status panels now occupy the full control-column width with no
  unused gutter beside them.
- Provider and model controls share the same top alignment, while redundant
  explanatory copy has been removed.
- Timing metrics flex across the complete status row instead of leaving empty
  cells, and the batch selector remains at the requested count while jobs run
  independently.

### Verification

- `npm run smoke:image:route`
- `npm run check:generation-executor`
- `npm run check:ui`
- `npm run check:css`
- `npm run build`

## 1.0.9

This release completes the standalone account recovery surface and makes image
batch generation a set of independent queue jobs.

### What Changed

- Added a redesigned login page with login, registration, and password recovery
  modes. Admin-generated reset codes are single-use, expiring, hashed in the
  database, and revoke previous sessions after a successful reset.
- A batch of four images now creates four independent image tasks with their
  own queue state, server job, billing reservation, history record, and dedupe
  fingerprint. The result panel still aggregates the batch for review.
- Removed the persistent left-column scrollbar gutter and unified the outer
  control and prompt scrollbars into compact, arrow-free tracks.

### Verification

- `npm run check:generation-executor`
- `npm run check:standalone-auth`
- `npm run smoke:standalone:frontend`
- `STUDIO_JOB_CONCURRENCY=1 npm run smoke:standalone:service`
- `npm run build`

## 1.0.8

This release publishes the provider-library correction and starts the standalone
account operations layer.

### What Changed

- The standalone provider settings open on the saved provider library.
- Admins can configure credit charging, registration rewards, generation costs,
  the CDK shop URL, and one-time credit codes.
- Users can redeem a CDK from the signed-in workstation; redemptions are
  recorded in the server-side credit ledger and cannot be reused.
- Users can bind Sub2API or NewAPI accounts; the service resolves and encrypts
  the provider key, while generation only receives a saved connection ID.
- The default password minimum is 8 characters. PBKDF2-SHA256, session expiry,
  and login throttling remain unchanged.

### Verification

- `npm run check:standalone:billing`
- `npm run check:standalone:providers`
- `npm run check:standalone:auth`
- `npm run build`

## 1.0.7

This hotfix keeps asynchronous xAI/Grok video requests on the same upstream
worker from creation through persistence.

### What Changed

- Video creation, polling, and protected content downloads now carry the same
  `X-Client-Request-ID`.
- Provider pools that use this header for task affinity now receive consistent
  affinity metadata across the full asynchronous lifecycle.
- The transient poll budget is now configurable and defaults to 450 failures,
  approximately thirty minutes at the default interval, so delayed provider
  scheduling is not reported as an early failure.
- The standalone service smoke test rejects a changed or missing affinity ID
  and covers more than 150 temporary misses while retaining the
  `404 -> 503 -> done` retry sequence.

### Verification

- `npm run check:xai`
- `npm run smoke:standalone:service`
- `node --check scripts/image-agent-studio-history-service.mjs`
- `npm run build:studio`
- Real Studio video creation, polling, protected MP4 download, and persisted
  asset playback on the standalone VPS

## 1.0.6

This hotfix prevents transient provider-pool misses from failing asynchronous
video jobs immediately.

### What Changed

- Video polling retries bounded HTTP `404`, `429`, and temporary `5xx`
  responses before marking a job failed.
- Permanent authorization and request errors still fail immediately.
- The standalone service smoke test now covers `404 -> 503 -> done` polling.

### Verification

- Real video creation returned a `request_id`.
- Polling reached `status: done`.
- The protected content route returned HTTP `206`, `video/mp4`, and an MP4
  `ftyp` signature.
- `npm run smoke:standalone:service`

## 1.0.5

This hotfix preserves the real image format returned by xAI/Grok providers.

### What Changed

- The standalone service now detects PNG, JPEG, and WebP from image bytes
  before selecting the persisted file extension and response MIME type.
- A provider can return JPEG bytes even when the generic workstation setting
  says PNG without creating a mislabeled asset.
- The standalone service smoke test now covers this exact mismatch.

### Verification

- `npm run smoke:standalone:service`
- Real VPS job returning JPEG bytes through a base64 image response
- Persisted asset MIME and file signature comparison

## 1.0.4

This hotfix makes xAI/Grok image results durable on standalone servers.

### What Changed

- `xai-compatible` image requests now include
  `response_format: b64_json`.
- The standalone service persists returned image bytes directly instead of
  depending on a temporary `imgen.x.ai` URL.
- The generic OpenAI-compatible, NewAPI, and Sub2API request bodies are
  unchanged.
- Browser and service contract tests now require the durable base64 response
  path.

### Why

Real VPS verification showed that image generation completed successfully,
but the provider CDN rejected data-center downloads with HTTP 403. Requesting
base64 output removes that external download from the persistence path.

### Verification

- `npm run check:xai`
- `npm run smoke:xai:route`
- `npm run smoke:standalone:service`
- Real `grok-imagine-image` request returning base64 image bytes
- `npm run build:studio`

## 1.0.3

This release adds a provider-specific xAI/Grok compatibility path while keeping
the workstation core independent from any gateway brand. It covers both direct
image generation and asynchronous video jobs, including the response shapes
used by the tested Grok Imagine endpoint.

### What Changed

- Added the `xai-compatible` provider preset and model detection for
  `grok-imagine-image` and `grok-imagine-video-*`.
- Image requests use `POST /v1/images/generations` with only `model`, `prompt`,
  and `n`; unsupported generic `size` and `quality` fields are omitted.
- Video requests use `POST /v1/videos/generations`, poll
  `GET /v1/videos/{request_id}`, and download protected content from
  `GET /v1/videos/{request_id}/content`.
- Standalone deployments can persist and execute video jobs through the same
  service queue as image jobs.
- Git-sync and Docker contracts now expose `STUDIO_PROVIDER_TYPE` alongside
  `STUDIO_PROVIDER_BASE_URL`; provider secrets remain server-side.
- Added route, service, model-sync, and Go dispatch regression coverage.

### Verification

- `npm run check:xai`
- `npm run smoke:xai:route`
- `npm run smoke:standalone:service`
- `npm run check:env`
- `npm run check:service-config`
- `npm run build`
- `npm run build:studio`

### Deployment Note

The release does not contain a provider key. For a standalone server, set
`STUDIO_PROVIDER_TYPE=xai-compatible`, `STUDIO_PROVIDER_BASE_URL` to the
provider's `/v1` endpoint, and `STUDIO_PROVIDER_API_KEY` in a protected server
environment file before restarting the service.

## 1.0.2

This release turns standalone deployment into a real multi-user setup: users can create their own Image Agent Studio accounts, while the deployment owner keeps provider credentials on the server.

### What Changed

- Added public standalone registration through `POST /studio-api/auth/register`.
- Registration is open by default with `STUDIO_AUTH_REGISTRATION_MODE=open`.
- Deployments can set `STUDIO_AUTH_REGISTRATION_MODE=disabled` for invite-only or private operation.
- The standalone login page now supports both login and account creation.
- Successful registration immediately creates a session, so new users can enter the workstation without an admin-created account.
- Docker Compose and environment contracts now pass the registration mode into the history service.
- Standalone smoke tests now cover public registration, duplicate-user rejection, disabled registration, frontend registration, frontend login, and server-owned provider routing.

### Verification

- `npm run check:standalone-auth`
- `npm run smoke:standalone:service`
- `npm run smoke:standalone:frontend`
- `npm run check:service-config`
- `npm run check:env`
- `npm run check:deploy`
- `npm run check:docker`
- `npm run build:studio`

## 1.0.1

This release completes the public rename to **Image Agent Studio** and removes old release-package naming from the publishing flow.

### What Changed

- README and README.zh-CN now describe the project as a standalone image agent workstation, with provider-neutral wording for official OpenAI-style APIs, custom OpenAI-compatible gateways, Sub2API, NewAPI, and future adapters.
- The package name is now `image-agent-studio`.
- New standalone deployments now default to `/opt/image-agent-studio-repo`, `/var/www/image-agent-studio`, `/opt/image-agent-studio`, `/var/lib/image-agent-studio`, and `image-agent-studio-history`.
- Legacy VPS deployments can still pass explicit paths such as `/var/www/ohlaoo-studio`, `/opt/image-sub2api-studio`, `/var/lib/image-sub2api-studio`, and `image-sub2api-studio-history`.
- The service package now includes standard `image-agent-studio` systemd and Nginx files plus Git-sync install, upgrade, backup, restore, and self-check helpers.
- Docker images now use `image-agent-studio-web:local` and `image-agent-studio-history:local`.
- The health endpoint reports `service: "image-agent-studio-history"` while keeping a legacy service hint for older monitoring.
- Backup exports now use `image-agent-studio-backup-*.json`; restore still accepts older `ai-image-workbench.user-backup` files.
- Release packages now use only:
  - `image-agent-studio-core-update-*.zip`
  - `image-agent-studio-service-update-*.zip`
- The old package wrapper entry was removed.
- The release checker now fails if legacy `image-sub2api-studio-*` or `ai-image-workbench-*` update packages appear in `release/`.

### Verification

- `npm run check:deploy`
- `npm run check:release`
- `npm run check:html`
- `npm run check:docs`

## 1.0.0

This release marks Image Agent Studio as a standalone self-hosted image creation workstation, with Sub2API kept as one compatible gateway path rather than the project identity.

The 1.0.0 line focuses on a stable creation loop: prompt conversation, reference images, direct image-generation routes, recoverable generation jobs, persistent history, large-canvas performance, Docker/VPS deployment, and a clearer provider abstraction for official APIs, OpenAI-compatible gateways, NewAPI-style gateways, Sub2API, and future model/video adapters.

### What Changed

- Public package name changed to `image-agent-studio`.
- Front-end configuration now prefers generic gateway variables:
  - `VITE_AI_GATEWAY_BASE_URL`
  - `VITE_AI_GATEWAY_MODEL_BASE_URL`
  - `VITE_AI_IMAGE_ROUTE`
  - `VITE_AI_RESPONSES_MODEL`
  - `VITE_AI_GATEWAY_LOGIN_URL`
- Docker and Nginx proxy configuration now prefer `AI_GATEWAY_UPSTREAM`.
- The history/session service now prefers `AI_GATEWAY_BASE_URL`.
- Existing `VITE_SUB2API_*`, `SUB2API_UPSTREAM`, and `SUB2API_BASE_URL` variables remain as compatibility aliases.
- Docker Compose defaults to `STUDIO_AUTH_MODE=local`, so the workbench can persist sessions/history without depending on an upstream account system.
- Gateway-authenticated deployments can still use `STUDIO_AUTH_MODE=gateway`.
- Provider settings now separate credential source (`apiKeySource`) from provider family (`providerId`), so existing gateway accounts, manual OpenAI-compatible APIs, and future NewAPI-style adapters have a clearer path.
- `src/studio/providers/registry.js` now stores route, auth, capability, parameter, and default-model metadata for provider families.
- Server-side generation jobs now persist provider metadata and normalize orphaned active jobs to `unknown` after a service restart or lost runner, instead of leaving them looking actively queued forever.
- Browser-side history now uses IndexedDB as an expanded local cache with localStorage as a fallback, reducing the chance that larger local histories disappear or overload localStorage.
- The history gallery now renders local session cards in batches, reducing the initial DOM and image-node pressure when a user has many saved sessions.
- The video inspiration gallery now renders cards in batches as well, keeping larger idea libraries lighter in the browser.
- Image template category/search results now render cards in batches too, so large prompt libraries avoid mounting every card at once.
- JSON persistence reads now tolerate UTF-8 BOMs, which makes Windows-authored backups and manual VPS recovery files safer to load.
- Large-canvas performance mode virtualizes offscreen image/video nodes and reduces SVG line animation load.
- Manual provider API keys are session-only in the browser. Provider configuration can persist, but raw manually entered API keys are migrated out of `localStorage` and kept only in `sessionStorage` for the current browser session.
- The local release gate now includes documentation encoding checks, so broken README or docs mojibake is caught before publishing.
- The large legacy composer and polish styles were split into focused CSS modules, reducing the chance that future UI work changes unrelated panels by accident.

### Compatibility Notes

- Existing `image-sub2api-studio-*` package names, service paths, systemd service names, and data directories remain supported so old VPS installs can upgrade without losing history or protected library assets.
- New deployments should prefer the `image-agent-studio-*` package names and generic `AI_GATEWAY_*` / `VITE_AI_*` environment names.
- `/v1/responses` image generation is treated as an explicit compatibility path only. The default image path is `/v1/images/generations`, and reference or Mask edits use `/v1/images/edits`.

## 0.8.1

This is a small repair release after the first 0.8 deployment.

- The language switch now covers the visible canvas controls, reference panel, bottom creation conversation, and parameter rail instead of only the outer shell.
- Current-session recovery now handles old cached `blob:` image URLs by falling back to the persisted `/studio-api/history/.../assets/...` URL, then resolving it through the authenticated asset fetch path.
- The release was verified with a browser language-switch smoke test and a persisted-asset recovery test.

## 0.8.0

`0.8.0` turned the early single-page image tool into a more complete gateway-backed creation workstation.

The main change is architectural: authenticated image generation can now be submitted as a server-side job through `/studio-api/generation-jobs`. The browser no longer needs to keep the original generation request alive for the result to be recoverable.

## Highlights

- Text-to-image uses `/v1/images/generations` by default.
- Reference image and Mask flows use `/v1/images/edits`.
- Prompt optimization uses `/v1/chat/completions` and is separate from image generation.
- Generated images are persisted by the studio service and can be restored after refresh.
- The infinite canvas keeps visual lineage between generated images.
- History is grouped by creation session instead of splitting every image into a separate project.
- User API keys are masked in the UI.
- Chinese/English UI switching now lives in the lower-left account area next to the theme/account controls.
- Docker Compose deployment is included for a complete runnable shape.

## Persistence Upgrade

The optional Node service now owns more than history records:

- `/studio-api/session` saves the current canvas and active session state.
- `/studio-api/history` stores session history and generated result URLs.
- `/studio-api/generation-jobs` creates, polls, and cancels server-side generation jobs.
- Generated result images are saved under the authenticated user's private asset directory.

The service does not persist the runtime API key used for generation jobs.

## Upgrade Notes

Traditional VPS deployment should upload both packages:

- `image-agent-studio-core-update-*.zip` to the Nginx static root.
- `image-agent-studio-service-update-*.zip` to `/opt/image-sub2api-studio`.

After the service package is updated:

```bash
cd /opt/image-sub2api-studio
sudo npm ci --omit=dev
sudo cp deploy/image-sub2api-studio-history.service /etc/systemd/system/image-sub2api-studio-history.service
sudo systemctl daemon-reload
sudo systemctl restart image-sub2api-studio-history
curl http://127.0.0.1:8787/studio-api/health
```

For Docker deployment:

```bash
cp .env.example .env
docker compose up --build -d
```

Do not run `docker compose down -v` unless you intend to delete history, jobs, and generated assets.

## Verification Checklist

- Final readiness audit:
  - `npm run audit:readiness`
  - This reruns the local gate, rebuilds and checks the release package pair from the current worktree, and requires the Docker runtime smoke. If Docker is not running, readiness remains unproven.
- Local no-paid-generation gate:
  - `npm run check:local`
  - This covers build, provider route dispatch, deploy config, Docker Compose parsed config, docs encoding, service persistence/cancel/restart behavior, browser history-session recovery, IndexedDB-backed local history recovery, manual provider key storage safety, history-gallery batch rendering, video-inspiration batch rendering, and image-template batch rendering.
- Docker runtime smoke when Docker is available:
  - `npm run smoke:docker`
  - This builds and starts the Compose stack, checks `/studio/`, `/studio-api/health`, and JS/CSS content types, then removes the temporary test stack.
- `npm run build:studio` completes.
- `/studio/` returns the built `studio.html`.
- `/studio/studio-assets/*.js` returns `application/javascript`, not `text/html`.
- `/studio/studio-assets/*.css` returns `text/css`, not `text/html`.
- `/studio-api/health` returns `{"ok":true}`.
- A normal image request appears in gateway logs as `/v1/images/generations`.
- A reference image or Mask request appears as `/v1/images/edits`.
- A prompt assistant request appears as `/v1/chat/completions`.
- Refreshing during or after generation does not remove persisted results from the current canvas/history gallery.

## Security and License Notes

- Source code is MIT licensed.
- Community prompt template content follows `CC BY 4.0` where applicable.
- The open-source package does not include the production home page, real API keys, or the full private image library.
- See [SECURITY.md](SECURITY.md) for deployment and data-boundary notes.
- See [Acknowledgements and Reference Boundaries](docs/ACKNOWLEDGEMENTS.md) for prompt and asset-source boundaries.

## Known Limits

- Stopping the browser wait does not guarantee upstream cancellation once the upstream gateway has accepted the request.
- If the service restarts while a job is already in flight, the job can become `unknown`; check gateway logs and the history gallery before retrying.
- Any prompt or asset returned to a browser can be inspected by that user. Use authenticated library APIs for private materials.
