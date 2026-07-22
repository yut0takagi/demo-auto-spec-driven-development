"""adversary の出力を構造化して取り出す。曖昧なら棄却に倒す。"""

from __future__ import annotations

import json
import re

from orchestrator.models import AdversaryVerdict

ADVERSARY_PROMPT_TEMPLATE = """\
あなたは公正だが厳格なコードレビュアーです。この変更が **元のタスクを正しく満たしているか** を評価してください。
判断は公平に: 実際の欠陥が見当たらなければ承認し、本当に問題があるときだけ棄却してください。
「粗探しのための棄却」も、品質を犠牲にした安易な承認も、どちらも避けること。

棄却すべきなのは、次のような **実際の欠陥** が存在するときだけです:
- テストが実装を検証しておらず、通すことだけが目的になっている
- 境界値・空・異常系で実際に壊れる（単に未言及なのではなく、動作が壊れている）
- 要件と実装が食い違っている（見た目は満たしても別のことをしている）
- 既存の挙動を壊している

上記のような具体的な欠陥が見当たらなければ **承認してください**。
スタイルの好みや「もっと良くできる」程度の改善余地は、棄却理由にしてはいけません。

## 元のタスク
{task}

## 変更内容(diff)
{diff}

最後に、必ず次の JSON だけをコードフェンスで囲って出力してください:
```json
{{"approved": <true|false>, "summary": "<判断理由を1〜3文>", "blocking_issues": ["<承認を妨げる実際の欠陥のみ。無ければ空配列>"]}}
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
