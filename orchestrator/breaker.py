"""サーキットブレーカの適用。判定そのものは gates.py の純関数に委ねる。"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Mapping, Sequence

from orchestrator.config import Config
from orchestrator.gates import should_trip_breaker, spent_today_usd


@dataclass(frozen=True)
class BreakerAction:
    should_halt: bool
    reason: str = ""
    actor: str = ""


def check_breakers(
    runs: Sequence[Mapping], *, cfg: Config, today: str
) -> BreakerAction:
    verdicts = [str(r.get("verdict", "")) for r in runs]
    if should_trip_breaker(verdicts, k=cfg.circuit_breaker_fails):
        return BreakerAction(
            should_halt=True,
            reason=f"直近 {cfg.circuit_breaker_fails} 反復が連続でマージに至らなかった",
            actor="breaker:consecutive-failures",
        )

    spent = spent_today_usd(runs, today=today)
    if spent > cfg.daily_cost_budget_usd:
        return BreakerAction(
            should_halt=True,
            reason=f"本日のコスト ${spent:.2f} が予算 ${cfg.daily_cost_budget_usd:.2f} を超過した",
            actor="breaker:daily-budget",
        )

    return BreakerAction(should_halt=False)


def preflight_budget_halt(
    runs: Sequence[Mapping], *, cfg: Config, today: str
) -> BreakerAction:
    """反復を「実走する前」に本日のコストが予算超過かを判定する（予算 teeth）。

    実走後の check_breakers だけだと、連続運転では新起動ごとに 1 周ぶん（~$6.5）
    オーバーシュートしてから halt するため、日次予算がザルになる。高価な処理を始める前に
    予算超過を検知して止める。連続失敗は「今回の結果」次第で pre-flight では判断材料に
    しない（次の反復が成功する余地を残す）ので、ここでは予算のみを見る。
    """
    spent = spent_today_usd(runs, today=today)
    if spent > cfg.daily_cost_budget_usd:
        return BreakerAction(
            should_halt=True,
            reason=f"本日のコスト ${spent:.2f} が予算 ${cfg.daily_cost_budget_usd:.2f} を超過（pre-flight）",
            actor="breaker:daily-budget",
        )
    return BreakerAction(should_halt=False)
