"""
AVA · Local Edge-TTS server for AGY VENOM
Runs on localhost · serves MP3 audio voiced by Ava Multilingual Neural.

Setup (one-time):
    pip install edge-tts aiohttp

Run (every session · or set up as Windows service):
    python ava-server.py

AGY VENOM fetches:
    http://localhost:7723/?text=hello+world

Returns:
    Content-Type: audio/mpeg
    body: MP3 stream
"""

import asyncio
import sys
from aiohttp import web
import edge_tts

VOICE_DEFAULT = "en-US-AvaMultilingualNeural"
PORT = 7723

async def handle_say(request: web.Request) -> web.StreamResponse:
    text = request.query.get("text") or request.query.get("q")
    if not text:
        if request.method == "POST":
            data = await request.json()
            text = data.get("text") or data.get("q")
    if not text:
        return web.Response(status=400, text="Missing text parameter")

    text = text[:5000]
    voice = request.query.get("voice") or VOICE_DEFAULT
    rate = request.query.get("rate") or "+5%"
    pitch = request.query.get("pitch") or "+0Hz"

    try:
        communicate = edge_tts.Communicate(text, voice, rate=rate, pitch=pitch)
        chunks = []
        async for chunk in communicate.stream():
            if chunk["type"] == "audio":
                chunks.append(chunk["data"])
        mp3 = b"".join(chunks)
        if len(mp3) < 200:
            return web.Response(status=502, text="Ava returned empty audio")
        return web.Response(
            body=mp3,
            content_type="audio/mpeg",
            headers={
                "Access-Control-Allow-Origin": "*",
                "Cache-Control": "public, max-age=3600",
            },
        )
    except Exception as e:
        return web.Response(status=502, text=f"Ava synthesis failed: {e}")


async def handle_options(_: web.Request) -> web.Response:
    return web.Response(
        status=204,
        headers={
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
            "Access-Control-Allow-Headers": "Content-Type",
        },
    )


async def handle_health(_: web.Request) -> web.Response:
    return web.Response(
        text="ok",
        headers={"Access-Control-Allow-Origin": "*"},
    )


def main():
    app = web.Application()
    app.router.add_get("/", handle_say)
    app.router.add_post("/", handle_say)
    app.router.add_get("/say", handle_say)
    app.router.add_get("/health", handle_health)
    app.router.add_options("/{tail:.*}", handle_options)
    print(f"[ava-server] listening on http://localhost:{PORT}")
    print(f"[ava-server] voice: {VOICE_DEFAULT}")
    print(f"[ava-server] test: http://localhost:{PORT}/?text=hello+from+ava")
    web.run_app(app, host="127.0.0.1", port=PORT, print=None)


if __name__ == "__main__":
    main()
