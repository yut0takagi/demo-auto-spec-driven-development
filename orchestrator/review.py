"""adversary の出力を構造化して取り出す。曖昧なら棄却に倒す。"""

from __future__ import annotations

import json
import re

from orchestrator import prompts
from orchestrator.claude_cli import run_agent
from orchestrator.models import AdversaryVerdict
from orchestrator.shell import real_runner

_FENCED = re.compile(r"```(?:json)?\s*(\{.*?\})\s*```", re.DOTALL)
_BARE = re.compile(r"(\{.*\})", re.DOTALL)

_REJECT_UNPARSEABLE = "adversary の出力を解釈できないため棄却として扱う"


def parse_adversary_review(text: str) -> AdversaryVerdict:
    payload = _extract_json(text)
    if payload is None:
        return AdversaryVerdict(approved=False, summary=_REJECT_UNPARSEABLE)

    approved = payload.get("approved")
    if not isinstance(approved, bool):
        return AdversaryVerdict(
            approved=False,
            summary=f"approved が真偽値でないため棄却: {payload.get('summary', '')}".strip(),
        )

    summary = str(payload.get("summary", "")).strip()
    blocking = payload.get("blocking_issues") or []
    if isinstance(blocking, list) and blocking:
        summary = f"{summary} / 指摘: " + "; ".join(str(b) for b in blocking)

    return AdversaryVerdict(approved=approved, summary=summary)


def _extract_json(text: str) -> dict | None:
    for pattern in (_FENCED, _BARE):
        match = pattern.search(text)
        if not match:
            continue
        try:
            parsed = json.loads(match.group(1))
        except json.JSONDecodeError:
            continue
        if isinstance(parsed, dict):
            return parsed
    return None


def review_plan(*, task, plan, cfg, cwd, runner=real_runner):
    """PLAN を adversary_model で審査し (AdversaryVerdict, cost) を返す。"""
    out = run_agent(
        prompts.render("plan_review", task=task, plan=plan),
        model=cfg.adversary_model, cwd=cwd, runner=runner,
    )
    return parse_adversary_review(out.text), out.cost_usd
