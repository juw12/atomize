"""
Lightweight guardrails for the D agent: input screening + output sanitization.

Dependency-free (stdlib only) and easy to extend. This is a *demo* guardrail —
real production guardrails (NeMo Guardrails, Guardrails AI, Llama Guard) are
heavier and model-based.
"""
from __future__ import annotations

import re

MAX_INPUT_CHARS = 4000

# Prompt-injection / jailbreak heuristics.
_INJECTION_PATTERNS = [
    r"ignore (?:all|the|your|any) (?:previous|prior|above) instructions?",
    r"disregard (?:all|the|your|any) (?:previous|prior|above)",
    r"reveal (?:your )?(?:system )?prompt",
    r"print (?:your )?(?:system )?prompt",
    r"you are now (?:dan|do anything now)",
    r"developer mode enabled",
    r"repeat (?:the|your) (?:system )?(?:prompt|instructions) verbatim",
]
_INJECTION_RE = re.compile("|".join(_INJECTION_PATTERNS), re.IGNORECASE)

# PII patterns for output redaction.
_EMAIL_RE = re.compile(r"[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}")
_CC_RE = re.compile(r"(?<!\d)(?:\d[ -]?){13,16}(?!\d)")
_PHONE_RE = re.compile(r"(?<!\d)(?:\+\d{1,3}[\s-]?)?\(?\d{3}\)?[\s.-]?\d{3,4}[\s.-]?\d{4}(?!\d)")


def check_input(text: str) -> tuple[bool, str]:
    """Return (allowed, reason). Blocks prompt-injection and over-long input."""
    if not text or not text.strip():
        return False, "Empty input."
    if len(text) > MAX_INPUT_CHARS:
        return False, f"Input too long ({len(text)} > {MAX_INPUT_CHARS} chars)."
    if _INJECTION_RE.search(text):
        return False, "Blocked: possible prompt-injection / jailbreak attempt."
    return True, ""


def sanitize_output(text: str) -> str:
    """Redact obvious PII (emails, card-like numbers, phone numbers) from output."""
    out = _EMAIL_RE.sub("[email redacted]", text)
    out = _CC_RE.sub("[number redacted]", out)
    out = _PHONE_RE.sub("[phone redacted]", out)
    return out
