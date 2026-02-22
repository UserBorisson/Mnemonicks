from __future__ import annotations

import hmac
import os
from typing import Any, Dict, List, Optional

import edge_tts
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, Response
from pydantic import BaseModel, Field


def _split_csv_env(name: str) -> List[str]:
    raw = str(os.getenv(name, "") or "").strip()
    if not raw:
        return []
    out: List[str] = []
    seen = set()
    for item in raw.split(","):
        value = item.strip()
        if not value:
            continue
        key = value.lower()
        if key in seen:
            continue
        seen.add(key)
        out.append(value)
    return out


def _env_truthy(name: str, default: bool = False) -> bool:
    raw = os.getenv(name)
    if raw is None:
        return default
    value = str(raw).strip().lower()
    if value in {"1", "true", "yes", "y", "on"}:
        return True
    if value in {"0", "false", "no", "n", "off"}:
        return False
    return default


def _env_int(name: str, default: int, *, min_value: int = 1, max_value: int = 1_000_000) -> int:
    raw = os.getenv(name)
    if raw is None:
        return default
    try:
        value = int(str(raw).strip())
    except Exception:
        return default
    if value < min_value:
        return min_value
    if value > max_value:
        return max_value
    return value


def _api_key_header_name() -> str:
    return str(os.getenv("EDGE_TTS_API_KEY_HEADER", "X-API-Key") or "X-API-Key").strip() or "X-API-Key"


def _api_key_required() -> bool:
    return bool(str(os.getenv("EDGE_TTS_API_KEY", "") or "").strip())


def _cors_origins() -> List[str]:
    # Usually this service sits behind the Worker and CORS is not needed, but keep it configurable.
    defaults = []
    if _env_truthy("EDGE_TTS_ALLOW_LOCAL_ORIGINS", True):
        defaults.extend(["http://localhost:8000", "http://127.0.0.1:8000"])
    return defaults + _split_csv_env("EDGE_ALLOWED_ORIGINS")


LOCAL_ORIGIN_REGEX = r"^https?://(localhost|127\.0\.0\.1)(:\d+)?$"
EDGE_CORS_ORIGINS = _cors_origins()
EDGE_CORS_ORIGIN_REGEX = str(
    os.getenv("EDGE_ALLOWED_ORIGIN_REGEX", LOCAL_ORIGIN_REGEX) or LOCAL_ORIGIN_REGEX
).strip() or LOCAL_ORIGIN_REGEX

DEFAULT_VOICE = str(os.getenv("EDGE_TTS_DEFAULT_VOICE", "en-US-EmmaMultilingualNeural") or "").strip() or "en-US-EmmaMultilingualNeural"


app = FastAPI(title="Mnemonicks Edge TTS API", version="2.0.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=EDGE_CORS_ORIGINS,
    allow_origin_regex=EDGE_CORS_ORIGIN_REGEX,
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)


class TTSIn(BaseModel):
    text: str = Field(..., min_length=1)
    voice: str = DEFAULT_VOICE


@app.middleware("http")
async def require_api_key(request: Request, call_next):
    # Allow unauthenticated health checks if configured.
    if request.method == "OPTIONS":
        return await call_next(request)
    if request.url.path in {"/health", "/"} and _env_truthy("EDGE_TTS_HEALTH_PUBLIC", True):
        return await call_next(request)
    expected = str(os.getenv("EDGE_TTS_API_KEY", "") or "").strip()
    if not expected:
        return await call_next(request)
    header_name = _api_key_header_name().lower()
    received = request.headers.get(header_name) or request.headers.get(_api_key_header_name())
    if not received or not hmac.compare_digest(str(received), expected):
        return JSONResponse({"error": "unauthorized"}, status_code=401)
    return await call_next(request)


@app.get("/")
def root() -> Dict[str, Any]:
    return {
        "ok": True,
        "service": "edge_tts",
        "version": app.version,
        "endpoints": ["/health", "/api/voices", "/api/tts"],
    }


@app.get("/health")
def health() -> Dict[str, Any]:
    return {
        "ok": True,
        "service": "edge_tts",
        "tts_endpoint_ready": True,
        "api_key_required": _api_key_required(),
    }


@app.get("/api/voices")
async def voices() -> JSONResponse:
    try:
        raw = await edge_tts.list_voices()
        payload = [
            {
                "ShortName": item.get("ShortName"),
                "Locale": item.get("Locale"),
                "Gender": item.get("Gender"),
                "FriendlyName": item.get("FriendlyName"),
            }
            for item in raw
            if item.get("ShortName")
        ]
        return JSONResponse(payload)
    except Exception as exc:
        return JSONResponse({"error": f"voices failed: {exc}"}, status_code=500)


async def _synth_mp3_buffer(text: str, voice: Optional[str]) -> bytes:
    # Buffer full audio to avoid partial chunk/stream issues when clients abort.
    tts = edge_tts.Communicate(text, voice=voice or DEFAULT_VOICE)
    buf = bytearray()
    async for chunk in tts.stream():
        if chunk.get("type") == "audio" and chunk.get("data"):
            buf.extend(chunk["data"])
    return bytes(buf)


@app.post("/api/tts")
async def tts(payload: TTSIn) -> Response:
    text = (payload.text or "").strip()
    if not text:
        return JSONResponse({"error": "empty text"}, status_code=400)

    max_chars = _env_int("EDGE_TTS_MAX_CHARS", 5000, min_value=50, max_value=100_000)
    if len(text) > max_chars:
        return JSONResponse({"error": f"text too long (max {max_chars})"}, status_code=400)

    try:
        data = await _synth_mp3_buffer(text, payload.voice)
        if not data:
            return Response(content=b"", media_type="audio/mpeg", headers={"X-TTS-Error": "no-audio"})
        return Response(content=data, media_type="audio/mpeg")
    except Exception as exc:
        print(f"TTS failed: {exc}", flush=True)
        return Response(content=b"", media_type="audio/mpeg", headers={"X-TTS-Error": str(exc)})
