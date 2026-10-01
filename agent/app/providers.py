"""LLM provider router: a Gemini key pool and a Groq key pool with sequential failover.

Heavy tasks (Agent 1, Agent 2, conflicts, report) go to Gemini first, then Groq.
Light tasks (radar, methodology) go to Groq first, then Gemini.
Each pool tries its keys in order; a key that hits a rate limit / quota is cooled down and the next key is used.
Retries are bounded (one attempt per key per pool). Key values are never logged — only their slot number.
"""
from __future__ import annotations

import json
import logging
import os
import threading
import time
from dataclasses import dataclass, field
from typing import Callable

import httpx

log = logging.getLogger("agent.providers")

HEAVY = {"understand", "place", "conflicts", "report"}
LIGHT = {"radar", "methodology"}


class RateLimited(Exception):
    def __init__(self, retry_after: float = 30.0):
        super().__init__("rate limited")
        self.retry_after = retry_after


class InvalidKey(Exception):
    pass


class ProviderError(Exception):
    pass


class AllProvidersFailed(Exception):
    def __init__(self, rate_limited: bool, retry_after: float, detail: str):
        super().__init__(detail)
        self.rate_limited = rate_limited
        self.retry_after = retry_after


# call(key, model, system, user, max_tokens) -> raw JSON text
CallFn = Callable[[str, str, str, str, int], str]


@dataclass
class KeyPool:
    name: str
    keys: list[str]
    call: CallFn
    cooldown_until: dict[int, float] = field(default_factory=dict)
    _lock: threading.Lock = field(default_factory=threading.Lock)

    def status(self) -> dict:
        now = time.time()
        with self._lock:
            cooling = [i + 1 for i in range(len(self.keys)) if self.cooldown_until.get(i, 0) > now]
        return {"keys_configured": len(self.keys), "keys_cooling_down": cooling}

    def complete(self, model: str, system: str, user: str, max_tokens: int) -> str:
        """Try each available key once, in order. Raises RateLimited if every key is limited, ProviderError otherwise."""
        if not self.keys:
            raise ProviderError(f"{self.name}: no keys configured")
        now = time.time()
        with self._lock:
            order = [i for i in range(len(self.keys)) if self.cooldown_until.get(i, 0) <= now]
            soonest = min(self.cooldown_until.values(), default=now)
        if not order:
            raise RateLimited(max(1.0, soonest - now))
        limited, last = 0, "no attempt"
        for i in order:
            try:
                out = self.call(self.keys[i], model, system, user, max_tokens)
                log.info("[AI] %s key#%d ok model=%s", self.name, i + 1, model)
                return out
            except RateLimited as e:
                limited += 1
                with self._lock:
                    self.cooldown_until[i] = time.time() + max(5.0, e.retry_after)
                log.warning("[AI] %s key#%d rate limited, cooling %.0fs -> next key", self.name, i + 1, e.retry_after)
                last = "rate limited"
            except InvalidKey:
                with self._lock:
                    self.cooldown_until[i] = time.time() + 600
                log.error("[AI] %s key#%d rejected (invalid/unauthorized) -> next key", self.name, i + 1)
                last = "invalid key"
            except (ProviderError, httpx.HTTPError) as e:
                log.warning("[AI] %s key#%d error: %s -> next key", self.name, i + 1, type(e).__name__)
                last = type(e).__name__
        if limited == len(order):
            with self._lock:
                soonest = min(self.cooldown_until.values(), default=time.time() + 30)
            raise RateLimited(max(1.0, soonest - time.time()))
        raise ProviderError(f"{self.name}: all keys failed ({last})")


def _retry_after(headers: httpx.Headers, default: float = 30.0) -> float:
    try:
        return float(headers.get("retry-after", default))
    except ValueError:
        return default


def _classify(res: httpx.Response) -> None:
    if res.status_code == 429:
        raise RateLimited(_retry_after(res.headers))
    if res.status_code in (401, 403):
        raise InvalidKey()
    if res.status_code == 400 and "API_KEY_INVALID" in res.text:
        raise InvalidKey()
    if res.status_code >= 400:
        raise ProviderError(f"http {res.status_code}")


TIMEOUT = float(os.environ.get("AI_TIMEOUT_SECONDS", "45"))


def gemini_call(key: str, model: str, system: str, user: str, max_tokens: int) -> str:
    res = httpx.post(
        f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent",
        headers={"x-goog-api-key": key, "Content-Type": "application/json"},
        json={
            "systemInstruction": {"parts": [{"text": system}]},
            "contents": [{"role": "user", "parts": [{"text": user}]}],
            "generationConfig": {"temperature": 0.2, "maxOutputTokens": max_tokens + 1500,
                                 "responseMimeType": "application/json"},
        },
        timeout=TIMEOUT,
    )
    _classify(res)
    data = res.json()
    try:
        return "".join(p.get("text", "") for p in data["candidates"][0]["content"]["parts"])
    except (KeyError, IndexError, TypeError):
        raise ProviderError("gemini: empty or blocked response")


def groq_call(key: str, model: str, system: str, user: str, max_tokens: int) -> str:
    body = {"model": model, "temperature": 0.2, "max_tokens": max_tokens + 1500,
            "response_format": {"type": "json_object"},
            "messages": [{"role": "system", "content": system}, {"role": "user", "content": user}]}
    if "gpt-oss" in model:
        body["reasoning_effort"] = "low"
    res = httpx.post("https://api.groq.com/openai/v1/chat/completions",
                     headers={"Authorization": f"Bearer {key}"}, json=body, timeout=TIMEOUT)
    _classify(res)
    try:
        return res.json()["choices"][0]["message"]["content"] or ""
    except (KeyError, IndexError, TypeError):
        raise ProviderError("groq: empty response")


def load_keys(prefix: str) -> list[str]:
    """PREFIX_1..PREFIX_4 (plus legacy PREFIX), de-duplicated, order preserved."""
    keys = [os.environ.get(f"{prefix}_{i}", "").strip() for i in range(1, 5)] + [os.environ.get(prefix, "").strip()]
    out: list[str] = []
    for k in keys:
        if k and k not in out:
            out.append(k)
    return out


class Router:
    def __init__(self, gemini: KeyPool, groq: KeyPool, models: dict[str, dict[str, str]]):
        self.pools = {"gemini": gemini, "groq": groq}
        self.models = models  # task -> {"gemini": model, "groq": model}

    def order(self, task: str) -> list[str]:
        return ["groq", "gemini"] if task in LIGHT else ["gemini", "groq"]

    def complete_json(self, task: str, system: str, user: str, max_tokens: int, validate: Callable[[dict], object]):
        """Returns (validated_object, provider, model). Invalid JSON gets one more attempt, then the next provider."""
        rate_limited_all, retry_after, errors = True, 60.0, []
        for prov in self.order(task):
            pool, model = self.pools[prov], self.models[task][prov]
            if not pool.keys or not model:
                continue
            for _ in range(2):
                try:
                    raw = pool.complete(model, system, user, max_tokens)
                except RateLimited as e:
                    retry_after = min(retry_after, e.retry_after)
                    errors.append(f"{prov}: rate limited")
                    break
                except ProviderError as e:
                    rate_limited_all = False
                    errors.append(str(e))
                    break
                try:
                    return validate(json.loads(_strip_fences(raw))), prov, model
                except Exception:
                    rate_limited_all = False
                    errors.append(f"{prov}: invalid model output")
                    log.warning("[AI] %s returned invalid JSON for %s, retrying", prov, task)
            log.warning("[AI] %s failed for %s -> fallback provider", prov, task)
        if not errors:
            raise AllProvidersFailed(False, 0, "no AI provider configured")
        raise AllProvidersFailed(rate_limited_all, retry_after, "; ".join(errors))

    def status(self) -> dict:
        return {name: p.status() for name, p in self.pools.items()}


def build_router() -> Router:
    g_default = os.environ.get("GEMINI_MODEL", "gemini-flash-latest")
    q_heavy = os.environ.get("GROQ_FALLBACK_MODEL", "openai/gpt-oss-120b")
    q_light = os.environ.get("GROQ_MODEL", "openai/gpt-oss-20b")
    models = {
        "understand": {"gemini": os.environ.get("AGENT1_MODEL", g_default), "groq": q_light},
        "place": {"gemini": os.environ.get("AGENT2_MODEL", g_default), "groq": q_heavy},
        "conflicts": {"gemini": os.environ.get("CONFLICT_MODEL", g_default), "groq": q_heavy},
        "report": {"gemini": os.environ.get("REPORT_MODEL", g_default), "groq": q_heavy},
        "radar": {"gemini": g_default, "groq": q_light},
        "methodology": {"gemini": g_default, "groq": q_light},
    }
    return Router(KeyPool("gemini", load_keys("GEMINI_API_KEY"), gemini_call),
                  KeyPool("groq", load_keys("GROQ_API_KEY"), groq_call), models)


def _strip_fences(s: str) -> str:
    s = (s or "").strip()
    if s.startswith("```"):
        s = s.split("\n", 1)[1] if "\n" in s else ""
        s = s.rsplit("```", 1)[0]
    return s
