"""adversary の出力を構造化して取り出す。曖昧なら棄却に倒す。"""

from __future__ import annotations

import json
import re

from orchestrator.models import AdversaryVerdict

ADVERSARY_PROMPT_TEMPLATE = """\
あなたは敵対的コードレビュアーです。目的は **この変更を棄却する正当な理由を見つけること** です。
安易に承認してはいけません。承認してよいのは、真剣に穴を探した上で本当に問題が無いときだけです。

特に次を疑ってください:
- テストが実装を実質的に検証しておらず、通ることだけを目的にしていないか
- 境界値・空・異常系が未検証のまま残っていないか
- 要件を満たしたように見えて、実際には別のことをしていないか
- 既存の挙動を壊していないか

## 元のタスク
{task}

## 変更内容(diff)
{diff}

最後に、必ず次の JSON だけをコードフェンスで囲って出力してください:
```json
{{"approved": <true|false>, "summary": "<判断理由を1〜3文>", "blocking_issues": ["<具体的な指摘>"]}}
```
"""

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
