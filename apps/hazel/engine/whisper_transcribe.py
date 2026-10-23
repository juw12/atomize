"""Hazel transcription helper.

Reads a 16 kHz mono WAV and prints word-level timestamps as JSON:
    {"words": [{"text": "um", "start": 1.20, "end": 1.42}, ...]}

On failure it prints {"error": "..."} and exits non-zero, so the Node side can
degrade gracefully instead of crashing.
"""

import json
import sys


def main() -> int:
    if len(sys.argv) < 2:
        print(json.dumps({"error": "usage: whisper_transcribe.py <audio.wav> [model]"}))
        return 2

    audio = sys.argv[1]
    model_size = sys.argv[2] if len(sys.argv) > 2 else "tiny.en"

    try:
        from faster_whisper import WhisperModel
    except Exception as exc:  # noqa: BLE001 - report any import problem to Node
        print(json.dumps({"error": f"faster-whisper not installed ({exc})"}))
        return 2

    try:
        model = WhisperModel(model_size, device="cpu", compute_type="int8")
        segments, _info = model.transcribe(audio, word_timestamps=True, vad_filter=True)
        words = []
        for seg in segments:
            for w in (seg.words or []):
                words.append({"text": w.word, "start": float(w.start), "end": float(w.end)})
        print(json.dumps({"words": words}))
        return 0
    except Exception as exc:  # noqa: BLE001
        print(json.dumps({"error": f"transcription failed: {exc}"}))
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
