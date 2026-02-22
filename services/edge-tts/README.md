# Edge TTS Container (TTS-only)

This is a trimmed version of your local `edge.py` server that keeps only:

- `GET /api/voices`
- `POST /api/tts`
- `GET /health`

It is intended to be hosted as a **Cloudflare Container** (or any Docker host) and used as the upstream for your Worker API.

## Why this exists

- Keep your Worker `/api/tts` and `/api/voices` on your public domain
- Keep `edge-tts` execution in a containerized Python service
- Avoid exposing your local machine (`127.0.0.1:8001`) to the internet

## Local run (Docker)

```bash
cd services/edge-tts
docker build -t mnemonicks-edge-tts .
docker run --rm -p 8080:8080 mnemonicks-edge-tts
```

Test:

```bash
curl http://127.0.0.1:8080/health
curl http://127.0.0.1:8080/api/voices
curl -X POST http://127.0.0.1:8080/api/tts \
  -H "Content-Type: application/json" \
  --data "{\"text\":\"Hello from Mnemonicks\",\"voice\":\"en-US-AriaNeural\"}" \
  --output out.mp3
```

## Optional API key protection

Set:

- `EDGE_TTS_API_KEY=your-secret`
- `EDGE_TTS_API_KEY_HEADER=X-API-Key` (default)

Then configure your Worker:

- `TTS_UPSTREAM_API_KEY` = same secret
- `TTS_UPSTREAM_API_KEY_HEADER` = `X-API-Key`

## Worker integration (your current Worker proxy)

In Cloudflare Worker variables/secrets:

- `TTS_UPSTREAM_BASE_URL=https://<your-edge-tts-container-domain>`
- `TTS_UPSTREAM_VOICES_PATH=/api/voices` (optional, default matches)
- `TTS_UPSTREAM_TTS_PATH=/api/tts` (optional, default matches)
- `TTS_REQUIRE_AUTH=false` (for testing; turn on later if needed)

Your frontend already calls the Worker (`/api/tts`, `/api/voices`), so no frontend changes are needed after the Worker is configured.

## Cloudflare Container notes (high level)

Deploy this folder as a containerized service on Cloudflare Containers, then use the public container hostname as `TTS_UPSTREAM_BASE_URL`.

If you deploy elsewhere first (VPS, Render, Fly.io, Railway), the same Worker configuration works.

## Environment variables (service)

- `PORT` (default `8080`)
- `EDGE_TTS_DEFAULT_VOICE` (default `en-US-EmmaMultilingualNeural`)
- `EDGE_TTS_MAX_CHARS` (default `5000`)
- `EDGE_TTS_API_KEY` (optional)
- `EDGE_TTS_API_KEY_HEADER` (optional, default `X-API-Key`)
- `EDGE_TTS_HEALTH_PUBLIC` (default `true`)
- `EDGE_ALLOWED_ORIGINS` (optional CSV)
- `EDGE_ALLOWED_ORIGIN_REGEX` (optional)
- `EDGE_TTS_ALLOW_LOCAL_ORIGINS` (default `true`)
