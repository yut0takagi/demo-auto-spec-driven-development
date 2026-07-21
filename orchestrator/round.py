"""敵対ラウンド。native 経路（h5i 経路は Plan 3 で追加）。"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Callable

from orchestrator.claude_cli import run_agent
from orchestrator.config import Config
from orchestrator.models import AdversaryVerdict
from orchestrator.review import ADVERSARY_PROMPT_TEMPLATE, parse_adversary_review
from orchestrator.shell import Runner, real_runner

BUILDER_PROMPT_TEMPLATE = """\
あなたは実装担当です。次のタスクをこのリポジトリに実装してください。

## タスク
{task}

## 必ず守ること
- 変更は `dashboard/` と `data/` の中だけに限る。`.github/`, `orchestrator/`, `tests/` は絶対に変更しない
- 実装だけでなく、その振る舞いを**実質的に検証する**テストを書く（通すためだけのテストは禁止）
- `cd dashboard && npm run verify` が緑になること
- 変更は最小限に保つ（400 行以内）
"""

REVISE_PROMPT_TEMPLATE = """\
あなたの実装は敵対的レビューで棄却されました。指摘に対応して修正してください。

## 元のタスク
{task}

## レビューでの指摘
{review}

## 必ず守ること
- 指摘された点に実際に対応する（見せかけの修正は禁止）
- `cd dashboard && npm run verify` が緑になること
- `.github/`, `orchestrator/`, `tests/` は変更しない
"""


@dataclass(frozen=True)
class RoundOutcome:
    adversary: AdversaryVerdict
    revise_cycles: int
    verify_passed: bool
    e2e_passed: bool
    builder_cost_usd: float
    adversary_cost_usd: float


def run_native_round(
    *,
    task: str,
    diff_provider: Callable[[], str],
    cwd: str,
    cfg: Config,
    runner: Runner = real_runner,
) -> RoundOutcome:
    builder_cost = 0.0
    adversary_cost = 0.0

    work = run_agent(
        BUILDER_PROMPT_TEMPLATE.format(task=task),
        model=cfg.builder_model, cwd=cwd, runner=runner,
    )
    builder_cost += work.cost_usd

    review_out = run_agent(
        ADVERSARY_PROMPT_TEMPLATE.format(task=task, diff=diff_provider()),
        model=cfg.adversary_model, cwd=cwd, runner=runner,
    )
    adversary_cost += review_out.cost_usd
    verdict = parse_adversary_review(review_out.text)

    cycles = 0
    while not verdict.approved and cycles < cfg.max_revise_cycles:
        cycles += 1
        revise = run_agent(
            REVISE_PROMPT_TEMPLATE.format(task=task, review=verdict.summary),
            model=cfg.builder_model, cwd=cwd, runner=runner,
        )
        builder_cost += revise.cost_usd

        review_out = run_agent(
            ADVERSARY_PROMPT_TEMPLATE.format(task=task, diff=diff_provider()),
            model=cfg.adversary_model, cwd=cwd, runner=runner,
        )
        adversary_cost += review_out.cost_usd
        verdict = parse_adversary_review(review_out.text)

    verify_passed = runner(["npm", "run", "verify"], cwd=f"{cwd}/dashboard").ok
    e2e_passed = runner(["npm", "run", "test:e2e"], cwd=f"{cwd}/dashboard").ok

    return RoundOutcome(
        adversary=verdict,
        revise_cycles=cycles,
        verify_passed=verify_passed,
        e2e_passed=e2e_passed,
        builder_cost_usd=round(builder_cost, 6),
        adversary_cost_usd=round(adversary_cost, 6),
    )
