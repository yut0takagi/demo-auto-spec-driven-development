"""`python -m orchestrator` で 1 反復を実行する。"""

from __future__ import annotations

import json
import os
import sys
from datetime import datetime, timezone
from pathlib import Path

from orchestrator.breaker import BreakerAction, check_breakers, preflight_budget_halt
from orchestrator.config import Config
from orchestrator.gates import read_kill_switch
from orchestrator.github_ops import GitHubOps
from orchestrator.ideation import propose_next_issues
from orchestrator.loop import run_iteration
from orchestrator.models import AdversaryVerdict, CostBreakdown, Issue, RunRecord, VerifyResult
from orchestrator.record import load_runs, next_iteration, write_run_record, write_status
from orchestrator.h5i_round import select_round_runner


def _read_control(repo_root: Path) -> dict:
    path = repo_root / ".loop" / "control.json"
    if not path.is_file():
        return {}
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except json.JSONDecodeError:
        return {"enabled": False, "reason": "control.json が壊れている", "actor": "system"}


def _utc_now() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def main() -> int:
    repo_root = Path(os.environ.get("REPO_ROOT", ".")).resolve()
    data_dir = repo_root / "data"
    cfg = Config.from_env(os.environ)

    def kill_switch_reader() -> bool:
        return read_kill_switch(env=os.environ, control=_read_control(repo_root)).enabled

    gh = GitHubOps(cwd=str(repo_root))

    # 予算 teeth（pre-flight）: 反復を「実走する前」に本日のコストが予算超過なら、高価な
    # builder を起動せずに halt する。実走後の check_breakers だけだと連続運転で新起動ごとに
    # 1 周ぶんオーバーシュートして日次予算がザルになるため。halt issue は post-hoc の breaker が
    # 初回に立てるので、ここでは status 更新のみ（起動ごとの halt issue スパムを避ける）。
    _pf_now = _utc_now()
    preflight = preflight_budget_halt(load_runs(data_dir), cfg=cfg, today=_pf_now[:10])
    if preflight.should_halt:
        write_status(
            data_dir, state="HALTED", reason=preflight.reason, actor=preflight.actor,
            resume_hint="翌日になるか、予算(DAILY_COST_BUDGET_USD)を引き上げると再開する",
            now=_pf_now,
        )
        print(json.dumps({"status": "halted", "reason": preflight.reason}, ensure_ascii=False))
        return 0

    # 無人実行の最終防波堤: 反復のどこで例外が飛んでも、必ず verdict="failed" の
    # 記録を残してから異常終了する。これが無いと、課金は発生したのにダッシュ
    # ボードには何も表示されない「消えた反復」が起きる。
    try:
        result = run_iteration(
            gh=gh,
            cfg=cfg,
            data_dir=data_dir,
            repo_root=str(repo_root),
            clock=_utc_now,
            kill_switch_reader=kill_switch_reader,
            round_runner=select_round_runner(cfg),
            ideation_runner=_ideate,
        )
    except Exception as exc:  # noqa: BLE001 — 無人実行では握りつぶさず記録して非ゼロ終了する
        _record_crash(data_dir, cfg, exc)
        print(json.dumps({"status": "failed", "error": repr(exc)}, ensure_ascii=False))
        return 1

    # サーキットブレーカ: 連続失敗・予算超過なら loop:halted issue を立てて HALTED で終了。
    # 判定は gates.py の純関数、副作用（issue 作成・status 書き込み）はここで行う。
    now = _utc_now()
    # no-work / skipped-disabled / paused-before-pr は反復を実走しておらず失敗でもないので
    # ブレーカ評価の対象外。idle tick で loop:halted issue が誤生成されるのを防ぐ。
    _non_operational = {"no-work", "skipped-disabled", "paused-before-pr"}
    breaker = (
        BreakerAction(should_halt=False)
        if result.status in _non_operational
        else check_breakers(load_runs(data_dir), cfg=cfg, today=now[:10])
    )
    if breaker.should_halt:
        gh.create_issue(
            title=f"🛑 ループを自動停止しました: {breaker.actor}",
            body=(
                f"{breaker.reason}\n\n"
                "再開するには原因を確認したうえで:\n"
                "```bash\ngh variable set LOOP_ENABLED --body true\n```"
            ),
            labels=["loop:halted"],
        )
        write_status(
            data_dir, state="HALTED", reason=breaker.reason, actor=breaker.actor,
            resume_hint="原因を確認後 gh variable set LOOP_ENABLED --body true",
            now=now,
        )
        print(json.dumps({"status": "halted", "reason": breaker.reason}, ensure_ascii=False))
        return 0

    switch = read_kill_switch(env=os.environ, control=_read_control(repo_root))
    write_status(
        data_dir,
        state="RUNNING" if switch.enabled else "PAUSED",
        reason=switch.reason if not switch.enabled else f"直近の反復: {result.status}",
        actor=switch.actor,
        resume_hint="gh variable set LOOP_ENABLED --body true && gh workflow enable loop.yml",
        now=_utc_now(),
    )

    print(json.dumps(result.__dict__, ensure_ascii=False, default=list))
    return 0


def _record_crash(data_dir: Path, cfg: Config, exc: Exception) -> None:
    """例外で異常終了した反復の痕跡を残す。issue はこの時点では特定できないため不明値で埋める。"""
    now = _utc_now()
    write_run_record(
        RunRecord(
            id=f"{now.replace('-', '').replace(':', '')}-0",
            iteration=next_iteration(data_dir),
            issue=Issue(number=0, title="(不明: 例外発生時点で issue を特定できなかった)", labels=[]),
            branch="unknown",
            started_at=now,
            finished_at=now,
            duration_sec=0,
            revise_cycles=0,
            verdict="failed",
            gate_reasons=[f"反復が例外で異常終了した: {exc!r}"],
            pr_number=None,
            adversary=AdversaryVerdict(approved=False, summary="例外により審査に到達しなかった"),
            verify=VerifyResult(unit_passed=False, e2e_passed=False, coverage_pct=0.0),
            changed_lines=0,
            cost=CostBreakdown(),
            models={
                "builder": cfg.builder_model,
                "adversary": cfg.adversary_model,
                "ideation": cfg.ideation_model,
            },
            next_issues=[],
        ),
        data_dir=data_dir,
    )


def _ideate(*, context: str, cfg: Config, cwd: str) -> tuple[list[dict], float]:
    """loop.py が `ideation_runner(context=, cfg=, cwd=)` で呼ぶ形に合わせる。"""
    outcome = propose_next_issues(context=context, cfg=cfg, cwd=cwd)
    return ([{"title": p.title, "body": p.body} for p in outcome.proposals], outcome.cost_usd)


if __name__ == "__main__":
    sys.exit(main())
