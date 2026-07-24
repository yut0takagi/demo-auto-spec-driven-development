"""adversary の出力を構造化して取り出す。曖昧なら棄却に倒す。"""

from __future__ import annotations

import json
import re

from orchestrator.claude_cli import run_agent
from orchestrator.models import AdversaryVerdict
from orchestrator.shell import real_runner

ADVERSARY_PROMPT_TEMPLATE = """\
あなたはこの変更を判定する**公正なシニアレビュアー**です。目的は「却下理由を探すこと」ではなく、
**この変更をマージしてよいかを公正に判断すること**です。要件を満たし、既存の挙動を壊さず、
テストが実際に振る舞いを検証しているなら、迷わず **承認** してください。

**却下してよいのは、次のような具体的で実害のある欠陥を名指しできるときだけ**です:
- 元のタスクの要件を満たしていない（見かけ上満たして実際は別のことをしている）
- 既存の挙動を壊している / 明確な correctness・security バグがある
- テストが実装を実質的に検証していない（通すだけの空テスト・トートロジー）

**次を理由に却下してはいけません**（無人で回り続けるループを不必要に止めないため）:
- スタイル・命名・軽微な好み、「もっと良くできる」程度の改善余地
- タスク範囲外の追加要望、あれば良い程度の nice-to-have、将来的な懸念

具体的な blocking 欠陥を1つも名指しできないなら、それは **承認** すべき変更です。
なお verify（単体）と e2e は別途ハードゲートで検査済みなので、あなたは「動くか」ではなく
「タスクを正しく満たし壊していないか」に集中してください。

## 元のタスク
{task}

## 変更内容(diff)
{diff}

最後に、必ず次の JSON だけをコードフェンスで囲って出力してください:
```json
{{"approved": <true|false>, "summary": "<判断理由を1〜3文>", "blocking_issues": ["<具体的な指摘（承認なら空配列）>"]}}
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


PLAN_REVIEW_PROMPT_TEMPLATE = """\
あなたは公正なシニアレビュアーです。以下のタスクに対する「実装計画(PLAN)」を、コードを書く前に審査してください。

## タスク
{task}

## 実装計画(PLAN)
{plan}

## 判断基準
- 計画がタスクの受入条件を満たし、方針の筋が通っていれば approve する。
- 却下は「具体的で実害のある設計欠陥」（受入条件を満たせない・明らかな手戻り）に限る。
- 些末な好みや、実装で吸収できる細部では却下しない。

次の JSON だけを出力すること:
```json
{{"approved": <true/false>, "summary": "<承認理由 or blocking な欠陥>"}}
```
"""


def review_plan(*, task, plan, cfg, cwd, runner=real_runner):
    """PLAN を adversary_model で審査し (AdversaryVerdict, cost) を返す。"""
    out = run_agent(
        PLAN_REVIEW_PROMPT_TEMPLATE.format(task=task, plan=plan),
        model=cfg.adversary_model, cwd=cwd, runner=runner,
    )
    return parse_adversary_review(out.text), out.cost_usd
