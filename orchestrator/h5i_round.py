"""h5i-python を launcher="client" で駆動する敵対ラウンド。

on_turn コールバックの中で Claude CLI にシェルアウトするため tmux を必要とせず、
GitHub 管理ランナー上でそのまま動作する。
"""

from __future__ import annotations

import asyncio
from typing import Callable

from orchestrator import prompts
from orchestrator.claude_cli import run_agent
from orchestrator.config import Config
from orchestrator.review import parse_adversary_review
from orchestrator.round import RoundOutcome, run_native_round
from orchestrator.shell import Runner, real_runner


def build_turn_prompt(*, role: str, task: str, materials: str) -> str:
    materials_section = f"\n## 参考資料\n{materials}\n" if materials else ""
    return prompts.render(
        "h5i_turn", role=role, task=task, materials_section=materials_section
    )


def run_h5i_round(
    *,
    task: str,
    diff_provider: Callable[[], str],
    cwd: str,
    cfg: Config,
    runner: Runner = real_runner,
    plan: str = "",  # native と同じシグネチャに揃える。h5i 経路は現状 plan を使わない。
) -> RoundOutcome:
    return asyncio.run(
        _run_h5i_round_async(
            task=task, diff_provider=diff_provider, cwd=cwd, cfg=cfg, runner=runner
        )
    )


async def _run_h5i_round_async(
    *,
    task: str,
    diff_provider: Callable[[], str],
    cwd: str,
    cfg: Config,
    runner: Runner,
) -> RoundOutcome:
    from h5i.orchestra import Conductor  # 遅延 import: native 経路では不要

    costs = {"builder": 0.0, "adversary": 0.0}

    async def on_turn(ctx):
        """h5i が各シートのターンを要求したときに呼ばれる。"""
        role = ctx.agent_id
        model = cfg.builder_model if role == "builder" else cfg.adversary_model
        prompt = build_turn_prompt(
            role=role, task=ctx.prompt or task, materials=diff_provider()
        )
        result = await asyncio.to_thread(
            run_agent, prompt, model=model, cwd=cwd, runner=runner
        )
        costs[role if role in costs else "builder"] += result.cost_usd
        return result.text

    async with Conductor(
        repo=cwd, run=f"loop-{abs(hash(task)) % 10**8}",
        launcher="client", on_turn=on_turn,
    ) as c:
        builder = await c.hire("builder", runtime="claude", model=cfg.builder_model)
        adversary = await c.hire("adversary", runtime="claude", model=cfg.adversary_model)

        artifact = await builder.work(prompts.render("builder", task=task, plan_block="\n"))
        await c.freeze()

        review = await adversary.review(artifact)
        verdict = parse_adversary_review(getattr(review, "body", "") or "")

        cycles = 0
        while not verdict.approved and cycles < cfg.max_revise_cycles:
            cycles += 1
            artifact = await builder.revise(artifact, review)
            review = await adversary.review(artifact)
            verdict = parse_adversary_review(getattr(review, "body", "") or "")

        verification = await c.verify(artifact, ["npm", "run", "verify"])
        e2e = await c.verify(artifact, ["npm", "run", "test:e2e"])
        await c.judge()

    return RoundOutcome(
        adversary=verdict,
        revise_cycles=cycles,
        verify_passed=bool(getattr(verification, "tests_passed", False)),
        e2e_passed=bool(getattr(e2e, "tests_passed", False)),
        builder_cost_usd=round(costs["builder"], 6),
        adversary_cost_usd=round(costs["adversary"], 6),
    )


def select_round_runner(cfg: Config) -> Callable[..., RoundOutcome]:
    """設定に応じてラウンド実装を選ぶ。未知の値は安全側で native に倒す。"""
    if cfg.orchestrator == "h5i":
        return run_h5i_round
    return run_native_round
