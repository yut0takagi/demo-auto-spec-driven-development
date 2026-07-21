"""ループの設定。既定値の唯一の置き場所。"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Mapping

_TRUTHY = {"1", "true", "yes", "on"}


def _flag(env: Mapping[str, str], key: str, default: bool = False) -> bool:
    raw = env.get(key)
    if raw is None:
        return default
    return raw.strip().lower() in _TRUTHY


@dataclass(frozen=True)
class Config:
    max_revise_cycles: int = 2
    max_changed_lines: int = 400
    circuit_breaker_fails: int = 3
    daily_cost_budget_usd: float = 5.0
    per_iter_cost_budget_usd: float = 0.5
    ideation_max_issues: int = 3
    builder_model: str = "claude-sonnet-5"
    adversary_model: str = "claude-haiku-4-5"
    ideation_model: str = "claude-haiku-4-5"
    #: "native" | "h5i"
    orchestrator: str = "native"
    dry_run: bool = False
    base_branch: str = "develop"
    ready_label: str = "loop:ready"
    needs_human_label: str = "loop:needs-human"
    paused_label: str = "loop:paused"

    @classmethod
    def from_env(cls, env: Mapping[str, str]) -> "Config":
        return cls(
            max_revise_cycles=int(env.get("MAX_REVISE_CYCLES", 2)),
            max_changed_lines=int(env.get("MAX_CHANGED_LINES", 400)),
            circuit_breaker_fails=int(env.get("CIRCUIT_BREAKER_FAILS", 3)),
            daily_cost_budget_usd=float(env.get("DAILY_COST_BUDGET_USD", 5.0)),
            per_iter_cost_budget_usd=float(env.get("PER_ITER_COST_BUDGET_USD", 0.5)),
            ideation_max_issues=int(env.get("IDEATION_MAX_ISSUES", 3)),
            builder_model=env.get("BUILDER_MODEL", "claude-sonnet-5"),
            adversary_model=env.get("ADVERSARY_MODEL", "claude-haiku-4-5"),
            ideation_model=env.get("IDEATION_MODEL", "claude-haiku-4-5"),
            orchestrator=env.get("ORCHESTRATOR", "native"),
            dry_run=_flag(env, "LOOP_DRY_RUN"),
            base_branch=env.get("BASE_BRANCH", "develop"),
        )
