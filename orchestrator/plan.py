"""planner: issue から設計+手順+受入条件を自律生成する（人間 Q&A なし）。

superpowers の brainstorming（設計分解）と writing-plans（手順化・受入条件）を
ヘッドレス自律版に翻案。小さい issue は trivial として即返し、計画をスキップさせる。
"""

from __future__ import annotations

import json
import re
from dataclasses import dataclass

from orchestrator.claude_cli import run_agent
from orchestrator.config import Config
from orchestrator.shell import Runner, real_runner

PLANNER_PROMPT_TEMPLATE = """\
あなたはこのリポジトリの実装計画者です。次のタスクを実装するための計画を立ててください。
人間には質問できません（無人運用）。与えられた情報だけで自律的に判断すること。

## タスク
{task}

## 進め方
- まず「これは小さく、計画不要か」を判定する。設定変更・単一パネル追加など数十行で終わるものは trivial。
- trivial でなければ、設計方針・ファイル単位のタスク分解・**機械検証可能な受入条件**を書く。
- 変更は `dashboard/` と `data/` 内で完結する前提で計画する。

次の JSON だけをコードフェンスで囲って出力すること:
```json
{{"trivial": <true/false>, "design": "<設計方針>", "tasks": ["<手順1>", "..."], "acceptance": ["<検証可能な受入条件>", "..."]}}
```
"""

_FENCED = re.compile(r"```(?:json)?\s*(\{.*?\})\s*```", re.DOTALL)
_BARE = re.compile(r"(\{.*\})", re.DOTALL)


@dataclass(frozen=True)
class PlanResult:
    trivial: bool
    plan_text: str
    cost_usd: float


def _render(design: str, tasks: list, acceptance: list) -> str:
    lines = ["## 設計方針", design, "", "## 手順"]
    lines += [f"- {t}" for t in tasks]
    lines += ["", "## 受入条件（検証可能）"]
    lines += [f"- {a}" for a in acceptance]
    return "\n".join(lines)


def parse_plan(text: str, *, cost: float) -> PlanResult:
    for pattern in (_FENCED, _BARE):
        match = pattern.search(text)
        if not match:
            continue
        try:
            data = json.loads(match.group(1))
        except json.JSONDecodeError:
            continue
        if not isinstance(data, dict):
            continue
        trivial = data.get("trivial") is True
        plan_text = _render(
            str(data.get("design", "")),
            list(data.get("tasks", [])),
            list(data.get("acceptance", [])),
        )
        return PlanResult(trivial=trivial, plan_text=plan_text, cost_usd=cost)
    # パース不能でも build を止めない: 非 trivial 扱いで生テキストを計画に載せる。
    return PlanResult(trivial=False, plan_text=text.strip(), cost_usd=cost)


def propose_plan(
    *, task: str, cfg: Config, cwd: str, runner: Runner = real_runner
) -> PlanResult:
    out = run_agent(
        PLANNER_PROMPT_TEMPLATE.format(task=task),
        model=cfg.planner_model, cwd=cwd, runner=runner,
    )
    return parse_plan(out.text, cost=out.cost_usd)
