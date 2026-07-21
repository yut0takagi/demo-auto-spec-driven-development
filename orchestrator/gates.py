"""ループの安全判断。すべて純関数 — I/O を持ち込まないこと。"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Iterable, Mapping, Sequence

#: ボットが変更してはならないパス接頭辞。
#: ループが自分の脳と安全装置を書き換えるのを防ぐ（spec §6）。
PROTECTED_PREFIXES: tuple[str, ...] = (
    ".github/workflows/",
    "orchestrator/",
    ".loop/",
    "tests/",
)

_TRUTHY = {"1", "true", "yes", "on"}

#: ブレーカが「失敗」とみなす verdict。
#: paused / dry-run は人間が止めた・マージしない設定での完走であり失敗ではないので数えない。
#: no-work / skipped-disabled はそもそも記録されないため対象外。
BREAKER_FAILURE_VERDICTS: frozenset[str] = frozenset({"failed", "needs-human"})


@dataclass(frozen=True)
class GateResult:
    passed: bool
    reasons: tuple[str, ...]


@dataclass(frozen=True)
class KillSwitch:
    enabled: bool
    reason: str
    actor: str


def protected_violations(changed_files: Iterable[str]) -> list[str]:
    """保護パスに触れているファイルを返す。空なら違反なし。"""
    return [f for f in changed_files if f.startswith(PROTECTED_PREFIXES)]


def evaluate_gate(
    *,
    verify_passed: bool,
    e2e_passed: bool,
    adversary_approved: bool,
    changed_lines: int,
    changed_files: Sequence[str],
    max_changed_lines: int,
) -> GateResult:
    """develop への自動マージ可否。失敗理由はすべて集めて返す。"""
    reasons: list[str] = []

    if not verify_passed:
        reasons.append("verify(lint/typecheck/unit/build) が失敗している")
    if not e2e_passed:
        reasons.append("e2e(Playwright) が失敗している")
    if not adversary_approved:
        reasons.append("adversary が approve していない")
    if changed_lines > max_changed_lines:
        reasons.append(
            f"変更行数 {changed_lines} が上限 {max_changed_lines} を超えている"
        )
    for path in protected_violations(changed_files):
        reasons.append(f"保護パスを変更している: {path}")

    return GateResult(passed=not reasons, reasons=tuple(reasons))


def read_kill_switch(
    *, env: Mapping[str, str], control: Mapping[str, Any]
) -> KillSwitch:
    """env と制御ファイルの両方を見る。どちらかが無効化していれば無効（fail-safe）。"""
    env_raw = env.get("LOOP_ENABLED")
    env_disabled = env_raw is not None and env_raw.strip().lower() not in _TRUTHY
    control_disabled = control.get("enabled") is False

    if control_disabled:
        return KillSwitch(
            enabled=False,
            reason=str(control.get("reason", "制御ファイルで無効化されている")),
            actor=str(control.get("actor", "human:control-file")),
        )
    if env_disabled:
        return KillSwitch(
            enabled=False,
            reason="LOOP_ENABLED が false に設定されている",
            actor="human:env",
        )
    return KillSwitch(enabled=True, reason="有効", actor="system")


def should_trip_breaker(recent_verdicts: Sequence[str], *, k: int) -> bool:
    """直近 k 件がすべて実障害（failed / needs-human）ならブレーカを落とす。

    merged はもちろん、paused / dry-run のような意図的な非マージも連続を途切れさせる。
    「連続失敗」の意図に沿い、止められただけ・確認だけの反復では発火させない。
    """
    if len(recent_verdicts) < k:
        return False
    window = recent_verdicts[-k:]
    return all(v in BREAKER_FAILURE_VERDICTS for v in window)


def spent_today_usd(runs: Iterable[Mapping[str, Any]], *, today: str) -> float:
    """today (YYYY-MM-DD) に完了した run のコスト合計。"""
    total = 0.0
    for run in runs:
        finished = str(run.get("finishedAt", ""))
        if finished.startswith(today):
            total += float(run.get("cost", {}).get("totalUsd", 0.0))
    return round(total, 6)
