"""外側ループ。1 回の呼び出し = 1 反復。

停止チェックポイントは 3 箇所（spec §7）:
  1. 反復開始時          — 何もせず終了
  2. ラウンド後・PR 前   — ブランチだけ残して終了
  3. マージ直前          — PR を開いたまま loop:paused を付け、
                           verdict="paused" の記録を書いて終了
"""

from __future__ import annotations

import re
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path
from typing import Any, Callable, Protocol

from orchestrator.config import Config
from orchestrator.gates import evaluate_gate
from orchestrator.models import (
    AdversaryVerdict, CostBreakdown, Issue, RunRecord, VerifyResult,
)
from orchestrator.record import next_iteration, write_run_record

_SLUG = re.compile(r"[^a-z0-9]+")


class GhLike(Protocol):
    def list_ready_issues(self, label: str) -> list[Issue]: ...
    def changed_files(self, base: str) -> list[str]: ...
    def changed_lines(self, base: str) -> int: ...
    def diff(self, base: str, max_chars: int = ...) -> str: ...
    def create_branch(self, name: str, base: str) -> None: ...
    def commit_all(self, message: str) -> bool: ...
    def push_branch(self, name: str) -> None: ...
    def open_pr(self, *, title: str, body: str, base: str, head: str) -> int: ...
    def comment_pr(self, number: int, body: str) -> None: ...
    def merge_pr(self, number: int) -> None: ...
    def add_label(self, number: int, label: str) -> None: ...
    def remove_label(self, number: int, label: str) -> None: ...
    def create_issue(self, *, title: str, body: str, labels: list[str]) -> int: ...


@dataclass(frozen=True)
class IterationResult:
    status: str
    iteration: int
    issue_number: int | None = None
    pr_number: int | None = None
    reasons: tuple[str, ...] = ()


def slugify(title: str) -> str:
    return _SLUG.sub("-", title.lower()).strip("-")[:40] or "task"


def _seconds_between(start_iso: str, end_iso: str) -> int:
    """ISO8601（`...Z`）の2時刻の差を秒で返す。負値にはしない。"""
    start = datetime.fromisoformat(start_iso.replace("Z", "+00:00"))
    end = datetime.fromisoformat(end_iso.replace("Z", "+00:00"))
    return max(0, round((end - start).total_seconds()))


def _retire_from_queue(gh: GhLike, issue_number: int, terminal_label: str, cfg: Config) -> None:
    """Issue を自動処理キューから外す: loop:ready を剥がし terminal ラベルを付ける。

    これをしないと ready のまま残り、次反復で `ready[0]` が同じ issue を拾い直す。
    その issue が既に PR 用ブランチを push 済みだと、再作成したブランチの push が
    non-fast-forward で失敗し、builder に課金した末にクラッシュしてループが前進しなくなる
    （#14 / #15 で実際に発生）。terminal ラベル = needs-human / paused。
    """
    gh.remove_label(issue_number, cfg.ready_label)
    gh.add_label(issue_number, terminal_label)


def run_iteration(
    *,
    gh: GhLike,
    cfg: Config,
    data_dir: Path,
    repo_root: str,
    clock: Callable[[], str],
    kill_switch_reader: Callable[[], bool],
    round_runner: Callable[..., Any],
    ideation_runner: Callable[..., tuple[list[dict], float]],
) -> IterationResult:
    """1 反復を実行する。`clock` は ISO8601 文字列を返す呼び出し可能オブジェクト。
    テストでは固定シーケンスを注入し、`duration_sec` を決定的にする
    （旧稿は `started_at == finished_at == now` で `duration_sec` が常に 0 だった）。
    """
    started_at = clock()
    iteration = next_iteration(Path(data_dir))

    # --- 停止チェックポイント 1 ---
    if not kill_switch_reader():
        return IterationResult(status="skipped-disabled", iteration=iteration)

    ready = gh.list_ready_issues(cfg.ready_label)
    if not ready:
        return IterationResult(status="no-work", iteration=iteration)

    issue = ready[0]
    branch = f"loop/{issue.number}-{slugify(issue.title)}"
    gh.create_branch(branch, cfg.base_branch)

    outcome = round_runner(
        task=f"{issue.title}\n\n(issue #{issue.number})",
        diff_provider=lambda: gh.diff(cfg.base_branch),
        cwd=repo_root,
        cfg=cfg,
    )

    # --- 停止チェックポイント 2 ---
    if not kill_switch_reader():
        return IterationResult(
            status="paused-before-pr", iteration=iteration, issue_number=issue.number
        )

    # builder の作業を1コミットにする。これをやらないとブランチが空になり、
    # gate は commit 済み diff を見るため changed_lines が常に0・保護パス検出も空になって
    # 判定が形骸化し、空の PR を作ろうとして失敗する（dry-run で判明したバグ）。
    if not gh.commit_all(f"loop: {issue.title} (#{issue.number})"):
        _retire_from_queue(gh, issue.number, cfg.needs_human_label, cfg)
        reasons = ("builder が変更を生成しなかった",)
        _record(
            data_dir, iteration, issue, branch, outcome, 0,
            verdict="needs-human", started_at=started_at, finished_at=clock(),
            cfg=cfg, ideation_cost=0.0, next_issues=[],
            gate_reasons=list(reasons), pr_number=None,
        )
        return IterationResult(
            status="needs-human", iteration=iteration,
            issue_number=issue.number, reasons=reasons,
        )

    changed_files = gh.changed_files(cfg.base_branch)
    changed_lines = gh.changed_lines(cfg.base_branch)
    gate = evaluate_gate(
        verify_passed=outcome.verify_passed,
        e2e_passed=outcome.e2e_passed,
        adversary_approved=outcome.adversary.approved,
        changed_lines=changed_lines,
        changed_files=changed_files,
        max_changed_lines=cfg.max_changed_lines,
    )

    gh.push_branch(branch)
    pr = gh.open_pr(
        title=f"{issue.title} (#{issue.number})",
        body=_pr_body(issue, outcome, gate.reasons),
        base=cfg.base_branch,
        head=branch,
    )
    gh.comment_pr(pr, _review_comment(outcome.adversary))

    # --- 停止チェックポイント 3（マージ直前） ---
    # レビュー指摘: 以前はここで記録を書かずに return していたため、実際に
    # builder+adversary の 1 ラウンド分の課金が発生したのに痕跡が残らなかった。
    if not kill_switch_reader():
        _retire_from_queue(gh, issue.number, cfg.paused_label, cfg)
        _record(
            data_dir, iteration, issue, branch, outcome, changed_lines,
            verdict="paused", started_at=started_at, finished_at=clock(),
            cfg=cfg, ideation_cost=0.0, next_issues=[],
            gate_reasons=gate.reasons, pr_number=pr,
        )
        return IterationResult(
            status="paused", iteration=iteration,
            issue_number=issue.number, pr_number=pr,
        )

    if not gate.passed:
        _retire_from_queue(gh, issue.number, cfg.needs_human_label, cfg)
        _record(
            data_dir, iteration, issue, branch, outcome, changed_lines,
            verdict="needs-human", started_at=started_at, finished_at=clock(),
            cfg=cfg, ideation_cost=0.0, next_issues=[],
            gate_reasons=gate.reasons, pr_number=pr,
        )
        return IterationResult(
            status="needs-human", iteration=iteration,
            issue_number=issue.number, pr_number=pr, reasons=gate.reasons,
        )

    if cfg.dry_run:
        # レビュー指摘: 以前は dry-run も verdict="paused" として記録しており、
        # 「人間が止めた」のか「最初からマージしない設定だった」のか区別できなかった。
        _record(
            data_dir, iteration, issue, branch, outcome, changed_lines,
            verdict="dry-run", started_at=started_at, finished_at=clock(),
            cfg=cfg, ideation_cost=0.0, next_issues=[],
            gate_reasons=gate.reasons, pr_number=pr,
        )
        return IterationResult(
            status="dry-run", iteration=iteration,
            issue_number=issue.number, pr_number=pr,
        )

    gh.merge_pr(pr)

    proposals, ideation_cost = ideation_runner(
        context=f"iteration {iteration} で「{issue.title}」を完了した", cfg=cfg, cwd=repo_root
    )
    next_issues = [
        gh.create_issue(title=p["title"], body=p["body"], labels=[cfg.ready_label])
        for p in proposals
    ]

    _record(
        data_dir, iteration, issue, branch, outcome, changed_lines,
        verdict="merged", started_at=started_at, finished_at=clock(),
        cfg=cfg, ideation_cost=ideation_cost, next_issues=next_issues,
        gate_reasons=gate.reasons, pr_number=pr,
    )
    return IterationResult(
        status="merged", iteration=iteration,
        issue_number=issue.number, pr_number=pr,
    )


def _record(
    data_dir, iteration, issue, branch, outcome, changed_lines,
    *, verdict, started_at, finished_at, cfg, ideation_cost, next_issues,
    gate_reasons, pr_number,
) -> None:
    write_run_record(
        RunRecord(
            id=f"{started_at.replace('-', '').replace(':', '')}-{issue.number}",
            iteration=iteration,
            issue=issue,
            branch=branch,
            started_at=started_at,
            finished_at=finished_at,
            duration_sec=_seconds_between(started_at, finished_at),
            revise_cycles=outcome.revise_cycles,
            verdict=verdict,
            gate_reasons=list(gate_reasons),
            pr_number=pr_number,
            adversary=outcome.adversary,
            verify=VerifyResult(
                unit_passed=outcome.verify_passed,
                e2e_passed=outcome.e2e_passed,
            ),
            changed_lines=changed_lines,
            cost=CostBreakdown(
                builder_usd=outcome.builder_cost_usd,
                adversary_usd=outcome.adversary_cost_usd,
                ideation_usd=ideation_cost,
            ),
            models={
                "builder": cfg.builder_model,
                "adversary": cfg.adversary_model,
                "ideation": cfg.ideation_model,
            },
            next_issues=next_issues,
        ),
        data_dir=Path(data_dir),
    )


def _pr_body(issue: Issue, outcome, reasons: tuple[str, ...]) -> str:
    lines = [
        f"Closes #{issue.number}",
        "",
        f"- adversary: {'approved' if outcome.adversary.approved else 'rejected'}",
        f"- revise cycles: {outcome.revise_cycles}",
        f"- verify: {'pass' if outcome.verify_passed else 'FAIL'}",
        f"- e2e: {'pass' if outcome.e2e_passed else 'FAIL'}",
    ]
    if reasons:
        lines += ["", "### ゲート不通過の理由", *[f"- {r}" for r in reasons]]
    return "\n".join(lines)


def _review_comment(verdict: AdversaryVerdict) -> str:
    head = "✅ approved" if verdict.approved else "❌ rejected"
    return f"### 敵対レビュー: {head}\n\n{verdict.summary}"
