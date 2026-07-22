"""次の改善 issue を生成する。ループが枯れないようにする心臓部。"""

from __future__ import annotations

import json
import re
from dataclasses import dataclass

from orchestrator.claude_cli import run_agent
from orchestrator.config import Config
from orchestrator.shell import Runner, real_runner

IDEATION_PROMPT_TEMPLATE = """\
あなたはこのリポジトリのプロダクトオーナーです。
「ループ自身の稼働を可視化する自己観測ダッシュボード」を改善する次の作業を提案してください。

## 現在の状況
{context}

## 提案の条件
- 1 件あたり 3000 行以内の変更で完了できる粒度にする
- `dashboard/` 配下だけで完結する（CI やオーケストレータは対象外）
- 「テストで正しさを機械判定できる」ものを優先する
- 既存機能の焼き直しではなく、観測性を実際に高めるものにする

最大 {max_issues} 件、次の JSON 配列だけをコードフェンスで囲って出力してください:
```json
[{{"title": "<簡潔な題名>", "body": "<背景と受け入れ条件>"}}]
```
"""

_FENCED = re.compile(r"```(?:json)?\s*(\[.*?\])\s*```", re.DOTALL)
_BARE = re.compile(r"(\[.*\])", re.DOTALL)


@dataclass(frozen=True)
class IssueProposal:
    title: str
    body: str


@dataclass(frozen=True)
class IdeationResult:
    proposals: list[IssueProposal]
    cost_usd: float


def parse_issue_proposals(text: str) -> list[IssueProposal]:
    for pattern in (_FENCED, _BARE):
        match = pattern.search(text)
        if not match:
            continue
        try:
            parsed = json.loads(match.group(1))
        except json.JSONDecodeError:
            continue
        if not isinstance(parsed, list):
            continue
        return [
            IssueProposal(title=str(item["title"]), body=str(item.get("body", "")))
            for item in parsed
            if isinstance(item, dict) and item.get("title")
        ]
    return []


def propose_next_issues(
    *,
    context: str,
    cfg: Config,
    cwd: str,
    runner: Runner = real_runner,
) -> IdeationResult:
    out = run_agent(
        IDEATION_PROMPT_TEMPLATE.format(
            context=context, max_issues=cfg.ideation_max_issues
        ),
        model=cfg.ideation_model,
        cwd=cwd,
        runner=runner,
    )
    proposals = parse_issue_proposals(out.text)[: cfg.ideation_max_issues]
    return IdeationResult(proposals=proposals, cost_usd=out.cost_usd)
