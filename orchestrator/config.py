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
    # gate（verify/e2e/adversary）を満たすまで builder に再試行させる上限。
    # 満たせなければ人間に振らず abandoned で見送る。
    max_revise_cycles: int = 3
    #: 1 反復の変更行数の上限。人間ゲート(develop→main)と verify/e2e が本来の品質 backstop なので
    #: 実質撤廃し、暴走（builder が異常な量を吐く事故）だけを止める天井として大きめの値を残す。
    max_changed_lines: int = 200000
    circuit_breaker_fails: int = 3
    daily_cost_budget_usd: float = 5.0
    per_iter_cost_budget_usd: float = 0.5
    ideation_max_issues: int = 3
    #: ready がこの件数未満なら反復先頭で ideation を先回り実行して補充する（枯れ防止）。
    #: 大きいほど常時のバックログ在庫が厚くなる（見やすさ・ideation 失敗耐性が上がる）。
    ideation_low_water: int = 6
    #: planner（自律 spec+plan）が使うモデル。
    planner_model: str = "claude-sonnet-5"
    #: revise が escalate_after_cycles に達したら builder を切り替える上位モデル。
    builder_escalation_model: str = "claude-opus-4-8"
    #: revise サイクルがこの回数に達したら builder モデルを昇格する。
    escalate_after_cycles: int = 2
    #: plan-review 却下からの再計画の上限。
    max_plan_cycles: int = 2
    builder_model: str = "claude-sonnet-5"
    adversary_model: str = "claude-haiku-4-5"
    ideation_model: str = "claude-haiku-4-5"
    #: "native" | "h5i"
    orchestrator: str = "native"
    dry_run: bool = False
    #: full-iteration に planner/plan_reviewer フックを本配線するかどうか。既定 OFF（live loop.yml は未設定のため無効のまま）。
    planning_enabled: bool = False
    base_branch: str = "develop"
    ready_label: str = "loop:ready"
    #: 旧経路の名残。現行ループは needs-human を発行しない（[[abandoned_label]] を使う）。
    needs_human_label: str = "loop:needs-human"
    #: gate を再試行しても満たせなかった issue に付けて自動クローズするラベル。
    abandoned_label: str = "loop:abandoned"
    paused_label: str = "loop:paused"

    @classmethod
    def from_env(cls, env: Mapping[str, str]) -> "Config":
        return cls(
            max_revise_cycles=int(env.get("MAX_REVISE_CYCLES", 3)),
            max_changed_lines=int(env.get("MAX_CHANGED_LINES", 200000)),
            circuit_breaker_fails=int(env.get("CIRCUIT_BREAKER_FAILS", 3)),
            daily_cost_budget_usd=float(env.get("DAILY_COST_BUDGET_USD", 5.0)),
            per_iter_cost_budget_usd=float(env.get("PER_ITER_COST_BUDGET_USD", 0.5)),
            ideation_max_issues=int(env.get("IDEATION_MAX_ISSUES", 3)),
            ideation_low_water=int(env.get("IDEATION_LOW_WATER", 6)),
            planner_model=env.get("PLANNER_MODEL", "claude-sonnet-5"),
            builder_escalation_model=env.get("BUILDER_ESCALATION_MODEL", "claude-opus-4-8"),
            escalate_after_cycles=int(env.get("ESCALATE_AFTER_CYCLES", 2)),
            max_plan_cycles=int(env.get("MAX_PLAN_CYCLES", 2)),
            builder_model=env.get("BUILDER_MODEL", "claude-sonnet-5"),
            adversary_model=env.get("ADVERSARY_MODEL", "claude-haiku-4-5"),
            ideation_model=env.get("IDEATION_MODEL", "claude-haiku-4-5"),
            orchestrator=env.get("ORCHESTRATOR", "native"),
            dry_run=_flag(env, "LOOP_DRY_RUN"),
            planning_enabled=_flag(env, "LOOP_PLANNING"),
            base_branch=env.get("BASE_BRANCH", "develop"),
        )
