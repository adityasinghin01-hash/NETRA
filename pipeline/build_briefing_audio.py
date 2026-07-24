"""Pre-render human-quality briefing audio (Microsoft neural voices via edge-tts) for
every district × language × gender, so the app plays a real-person voice offline — no
runtime TTS, no API key, Catalyst-safe (bundled static files). Reproducible.

Voices: en-IN Neerja (F) / Prabhat (M) · kn-IN Sapna (F) / Gagan (M).
Output: frontend/public/audio/brief-<district-slug>-<lang>-<gender>.mp3
Run: python3 -m pipeline.build_briefing_audio    (needs: pip install edge-tts)
"""
import asyncio
import json
import re
from pathlib import Path

import edge_tts

PUB = Path("frontend/public")
OUT = PUB / "audio"
VOICES = {
    ("en", "f"): "en-IN-NeerjaNeural", ("en", "m"): "en-IN-PrabhatNeural",
    ("kn", "f"): "kn-IN-SapnaNeural", ("kn", "m"): "kn-IN-GaganNeural",
}


def slug(s: str) -> str:
    return re.sub(r"(^-|-$)", "", re.sub(r"[^a-z0-9]+", "-", s.lower()))


async def gen(text: str, voice: str, path: Path):
    if path.exists() and path.stat().st_size > 1000:
        return "skip"
    await edge_tts.Communicate(text, voice).save(str(path))
    return "ok"


async def main():
    OUT.mkdir(parents=True, exist_ok=True)
    briefs = json.loads((PUB / "briefings.json").read_text())
    tasks, made, skipped = [], 0, 0
    for district, b in briefs.items():
        for lang in ("en", "kn"):
            text = (b.get(lang) or "").strip()
            if not text:
                continue
            for gender in ("f", "m"):
                path = OUT / f"brief-{slug(district)}-{lang}-{gender}.mp3"
                tasks.append((gen(text, VOICES[(lang, gender)], path), path))
    # run in small batches to be gentle on the endpoint
    for i in range(0, len(tasks), 6):
        batch = tasks[i:i + 6]
        results = await asyncio.gather(*[t for t, _ in batch], return_exceptions=True)
        for (res, (_, path)) in zip(results, batch):
            if isinstance(res, Exception):
                print(f"  FAIL {path.name}: {res}")
            elif res == "ok":
                made += 1
            else:
                skipped += 1
    print(f"briefing audio: {made} generated, {skipped} already present → {OUT}")


if __name__ == "__main__":
    asyncio.run(main())
