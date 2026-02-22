# Mnemonicks API Contract (v1 scaffold)

This Worker API is the server-side control plane for auth, entitlements, tier enforcement, and future cloud deck/review sync.

## Goals

- Keep secrets and billing logic off the client
- Enforce plan limits server-side
- Provide one API surface (`/api/*`) for all plans
- Return entitlements to the UI (display only), but enforce again on every write/read route

## Auth model (scaffold)

- Production target: session cookie or JWT (Auth provider / custom auth)
- Current scaffold:
  - `Authorization: Bearer demo_free | demo_pro | demo_premium`
  - Optional dev headers: `x-dev-user-id`, `x-dev-plan` (disable in production)

## Plans

- `free`
- `pro`
- `premium`

## Entitlements (example)

- `cloud_import`
- `cloud_sync`
- `advanced_generators`
- `analytics_plus`
- `priority_tts`

## Core endpoints (v1)

### `GET /api/health`

Health probe / version info.

Response:

```json
{
  "ok": true,
  "service": "mnemonicks-api",
  "version": "v1-scaffold"
}
```

### `GET /api/auth/session`

Returns current user/session and server-computed entitlements.

Response:

```json
{
  "ok": true,
  "user": { "id": "u_demo_pro", "plan": "pro" },
  "entitlements": {
    "plan": "pro",
    "features": {
      "cloud_import": true,
      "cloud_sync": true,
      "advanced_generators": false
    },
    "limits": {
      "maxDecks": 200,
      "maxImportCardsPerRequest": 10000,
      "dailyReviewEventIngest": 50000
    }
  }
}
```

### `GET /api/entitlements`

Alias for UI bootstrap when only plan/capabilities are needed.

### `GET /api/decks`

Lists decks visible to the current user.

Behavior (scaffold):

- Reads static deck list from `decks/manifest.json` (assets)
- Returns placeholders for future cloud-user decks

Future:

- Merge static decks + cloud decks (R2/D1)
- Filter by org/team/user ownership and plan

### `POST /api/decks/import`

Imports a deck to cloud storage (server-side feature-gated).

Request:

```json
{
  "name": "Neuro Anatomy",
  "cards": [{ "id": "1", "front": "A", "back": "B" }],
  "overwrite": false
}
```

Rules:

- Requires auth
- Requires `cloud_import`
- Enforce per-plan max cards / deck count
- Validate schema server-side

Current scaffold:

- Validates payload + entitlement checks
- Returns `501 not_implemented` unless persistence bindings are added

### `POST /api/reviews/events`

Ingest review events for analytics/sync.

Request:

```json
{
  "events": [
    {
      "deckId": "decks/Demo.json",
      "cardId": "abc",
      "rating": 3,
      "reviewedAt": "2026-02-22T08:00:00Z",
      "elapsedMs": 4200
    }
  ]
}
```

Rules:

- Requires auth
- Enforce plan rate/volume limits
- Batch validation and partial rejection reporting

Current scaffold:

- Validates and returns accepted count only (no persistence yet)

### `POST /api/webhooks/stripe`

Stripe webhook receiver.

Future:

- Verify signature
- Update subscription status / entitlements in D1
- Emit audit log

Current scaffold:

- Returns `501 not_implemented`

## Suggested bindings (future)

- `D1` (`DB`): users, subscriptions, entitlements, deck metadata, usage counters
- `R2` (`DECKS_BUCKET`): deck JSON blobs, media
- `KV` (optional): hot cache / sessions

## Notes

- Do not route users to separate “premium APIs” from the client.
- Use one API and server-side entitlement checks.
- Frontend can use entitlements only for UI hints; server remains the source of truth.

