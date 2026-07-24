"""敵対ラウンド。native 経路（h5i 経路は別途）。

retry-to-comply: verify / e2e / adversary のいずれかが不通過なら、その失敗を builder に
戻して修正させ、3つ全部が緑になるまで再試行する。上限（max_revise_cycles）で打ち切り、
その時点の outcome を返す（人間には振らない。見送り判断は loop.py 側で行う）。
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Callable

from orchestrator import prompts
from orchestrator.claude_cli import run_agent
from orchestrator.config import Config
from orchestrator.models import AdversaryVerdict
from orchestrator.review import parse_adversary_review
from orchestrator.shell import CommandResult, Runner, real_runner

_UNREVIEWED = "verify/e2e が未通過のためレビュー未実施"


def _builder_model(cycles: int, cfg: Config, plan: str) -> str:
    """revise が escalate_after_cycles に達したら上位モデルへ昇格する。
    ただし plan フェーズが有効（plan 非空）なときだけ昇格する。plan 無し（現行ライブ経路）は
    従来どおり builder_model のまま — 無人ループのモデル/コストを不用意に変えない。"""
    if plan and cycles >= cfg.escalate_after_cycles:
        return cfg.builder_escalation_model
    return cfg.builder_model


def _builder_prompt(task: str, plan: str) -> str:
    block = f"\n## 実装計画（これに沿って進める）\n{plan}\n" if plan else "\n"
    return prompts.render("builder", task=task, plan_block=block)


@dataclass(frozen=True)
class RoundOutcome:
    adversary: AdversaryVerdict
    revise_cycles: int
    verify_passed: bool
    e2e_passed: bool
    builder_cost_usd: float
    adversary_cost_usd: float
    builder_model_used: str = ""


def _tail(result: CommandResult | None, limit: int = 2000) -> str:
    """コマンド出力の末尾を返す（builder への feedback 用。長すぎるとトークンを浪費する）。"""
    if result is None:
        return "(未実行)"
    text = (result.stdout or "") + (result.stderr or "")
    text = text.strip()
    return text[-limit:] if text else "(出力なし)"


def _compose_feedback(
    *,
    verify_ok: bool,
    verify_res: CommandResult,
    e2e_ok: bool,
    e2e_res: CommandResult | None,
    verdict: AdversaryVerdict,
) -> str:
    """不通過だった gate だけを builder に伝える feedback を組む。"""
    parts: list[str] = []
    if not verify_ok:
        parts.append(
            "### `npm run verify`（lint/typecheck/unit/build）が失敗\n```\n"
            + _tail(verify_res)
            + "\n```"
        )
    elif not e2e_ok:
        parts.append(
            "### `npm run test:e2e` が失敗\n```\n" + _tail(e2e_res) + "\n```"
        )
    elif not verdict.approved:
        parts.append("### 敵対レビューでの指摘\n" + verdict.summary)
    return "\n\n".join(parts) if parts else "(不明な不通過)"


def run_native_round(
    *,
    task: str,
    diff_provider: Callable[[], str],
    cwd: str,
    cfg: Config,
    runner: Runner = real_runner,
    plan: str = "",
) -> RoundOutcome:
    dashboard = f"{cwd}/dashboard"
    builder_cost = 0.0
    adversary_cost = 0.0

    model_used = _builder_model(0, cfg, plan)
    work = run_agent(
        _builder_prompt(task, plan),
        model=model_used, cwd=cwd, runner=runner,
    )
    builder_cost += work.cost_usd

    verdict = AdversaryVerdict(approved=False, summary=_UNREVIEWED)
    verify_ok = False
    e2e_ok = False
    cycles = 0

    while True:
        # verify → e2e → adversary の順で段階的に検査する。verify が赤なら e2e は
        # 回さない（壊れたビルドで dev サーバが起動せず e2e が無駄に待つのを避ける）。
        verify_res = runner(["npm", "run", "verify"], cwd=dashboard)
        verify_ok = verify_res.ok
        e2e_res: CommandResult | None = None
        e2e_ok = False
        if verify_ok:
            e2e_res = runner(["npm", "run", "test:e2e"], cwd=dashboard)
            e2e_ok = e2e_res.ok

        if verify_ok and e2e_ok:
            review_out = run_agent(
                prompts.render("adversary", task=task, diff=diff_provider()),
                model=cfg.adversary_model, cwd=cwd, runner=runner,
            )
            adversary_cost += review_out.cost_usd
            verdict = parse_adversary_review(review_out.text)
        else:
            verdict = AdversaryVerdict(approved=False, summary=_UNREVIEWED)

        if (verify_ok and e2e_ok and verdict.approved) or cycles >= cfg.max_revise_cycles:
            break

        cycles += 1
        feedback = _compose_feedback(
            verify_ok=verify_ok, verify_res=verify_res,
            e2e_ok=e2e_ok, e2e_res=e2e_res, verdict=verdict,
        )
        model_used = _builder_model(cycles, cfg, plan)
        revise = run_agent(
            prompts.render("revise", task=task, feedback=feedback),
            model=model_used, cwd=cwd, runner=runner,
        )
        builder_cost += revise.cost_usd

    return RoundOutcome(
        adversary=verdict,
        revise_cycles=cycles,
        verify_passed=verify_ok,
        e2e_passed=e2e_ok,
        builder_cost_usd=round(builder_cost, 6),
        adversary_cost_usd=round(adversary_cost, 6),
        builder_model_used=model_used,
    )
