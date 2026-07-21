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
