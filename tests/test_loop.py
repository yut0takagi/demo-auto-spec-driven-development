import json
from pathlib import Path

import pytest

from orchestrator.config import Config
from orchestrator.loop import IterationResult, run_iteration
from orchestrator.models import AdversaryVerdict, Issue
from orchestrator.round import RoundOutcome


class FakeGh:
    """GitHubOps の代役。呼ばれた操作を記録する。"""

    def __init__(self, issues=None, changed_files=None, changed_lines=100, committed=True):
        self._issues = issues if issues is not None else [
            Issue(number=42, title="add chart", labels=["loop:ready"])
        ]
        self._changed_files = changed_files or ["dashboard/src/app/page.tsx"]
        self._changed_lines = changed_lines
        self._committed = committed
        self.actions: list[str] = []
        self.created_issues: list[str] = []

    def list_ready_issues(self, label): return list(self._issues)
    def changed_files(self, base): return list(self._changed_files)
    def changed_lines(self, base): return self._changed_lines
    def diff(self, base, max_chars=60_000): return "diff"
    def create_branch(self, name, base): self.actions.append(f"branch:{name}")
    def commit_all(self, message): self.actions.append("commit"); return self._committed
    def push_branch(self, name): self.actions.append(f"push:{name}")
    def open_pr(self, *, title, body, base, head):
        self.actions.append("open_pr")
        return 123
    def comment_pr(self, number, body): self.actions.append(f"comment:{number}")
    def merge_pr(self, number): self.actions.append(f"merge:{number}")
    def add_label(self, number, label): self.actions.append(f"label:{label}")
    def remove_label(self, number, label): self.actions.append(f"unlabel:{label}")
    def close_issue(self, number, comment): self.actions.append(f"close:{number}")
    def create_issue(self, *, title, body, labels):
        self.created_issues.append(title)
        return 900 + len(self.created_issues)


def approved_round(**overrides) -> RoundOutcome:
    base = dict(
        adversary=AdversaryVerdict(approved=True, summary="ok"),
        revise_cycles=0, verify_passed=True, e2e_passed=True,
        builder_cost_usd=0.1, adversary_cost_usd=0.01,
    )
    base.update(overrides)
    return RoundOutcome(**base)


def make_clock(*timestamps: str):
    """固定シーケンスを返す `clock`。尽きたら最後の値を返し続ける（duration_sec を決定的にする）。"""
    values = list(timestamps) or ["2026-07-20T12:00:00Z", "2026-07-20T12:05:00Z"]

    def _clock() -> str:
        if len(values) > 1:
            return values.pop(0)
        return values[0]

    return _clock


def run(tmp_path, *, gh, disable_on_call=None, round_outcome=None, cfg=None,
        proposals=("next idea",), clock=None):
    """1 反復を実行するヘルパ。

    kill_switch_reader は 3 回呼ばれる:
      1 回目 = 反復開始時, 2 回目 = ラウンド後・PR 前, 3 回目 = マージ直前。
    `disable_on_call=N` で N 回目以降を無効にし、任意のチェックポイントを検証する。
    """
    calls = {"n": 0}

    def kill_switch_reader():
        calls["n"] += 1
        if disable_on_call is None:
            return True
        return calls["n"] < disable_on_call

    def round_runner(**_kwargs):
        return round_outcome or approved_round()

    return run_iteration(
        gh=gh,
        cfg=cfg or Config.from_env({}),
        data_dir=tmp_path,
        repo_root=str(tmp_path),
        clock=clock or make_clock(),
        kill_switch_reader=kill_switch_reader,
        round_runner=round_runner,
        ideation_runner=lambda **_k: ([{"title": t, "body": "b"} for t in proposals], 0.01),
    )


class TestCheckpoint1:
    def test_disabled_at_start_does_nothing(self, tmp_path):
        gh = FakeGh()
        result = run(tmp_path, gh=gh, disable_on_call=1)
        assert result.status == "skipped-disabled"
        assert gh.actions == []
        assert not (tmp_path / "runs").exists()


class TestCheckpoint2:
    def test_disabled_after_round_leaves_branch_but_opens_no_pr(self, tmp_path):
        gh = FakeGh()
        result = run(tmp_path, gh=gh, disable_on_call=2)
        assert result.status == "paused-before-pr"
        assert "branch:loop/42-add-chart" in gh.actions
        assert "open_pr" not in gh.actions
        assert not any(a.startswith("merge:") for a in gh.actions)


class TestCheckpoint3:
    def test_disabled_before_merge_opens_pr_but_never_merges(self, tmp_path):
        gh = FakeGh()
        result = run(tmp_path, gh=gh, disable_on_call=3)
        assert result.status == "paused"
        assert "open_pr" in gh.actions
        assert not any(a.startswith("merge:") for a in gh.actions)
        assert "label:loop:paused" in gh.actions

    def test_paused_retires_issue_from_ready_queue(self, tmp_path):
        # paused も PR を開いたまま終わるので、ready を残すと次反復で拾い直して
        # push 衝突する。needs-human と同じく自動処理キューから外すこと。
        gh = FakeGh()
        run(tmp_path, gh=gh, disable_on_call=3)
        assert "unlabel:loop:ready" in gh.actions

    def test_disabled_before_merge_writes_a_paused_record(self, tmp_path):
        # レビュー指摘: 以前はこのチェックポイントで記録を書かずに終了しており、
        # 実際に課金されたラウンドの痕跡が消えていた。
        gh = FakeGh()
        run(tmp_path, gh=gh, disable_on_call=3)
        record = json.loads((tmp_path / "runs" / "0001.json").read_text())
        assert record["verdict"] == "paused"
        assert record["prNumber"] == 123
        assert record["gateReasons"] == []


class TestHappyPath:
    def test_gate_passing_merges_and_records(self, tmp_path):
        gh = FakeGh()
        result = run(tmp_path, gh=gh)
        assert result.status == "merged"
        assert "merge:123" in gh.actions
        record = json.loads((tmp_path / "runs" / "0001.json").read_text())
        assert record["verdict"] == "merged"

    def test_merge_closes_the_source_issue(self, tmp_path):
        # "Closes #N" は default ブランチ以外のマージでは効かないため、明示的にクローズする。
        # 閉じないとマージ済み issue が loop:ready のまま残り再拾いされる。
        gh = FakeGh()
        run(tmp_path, gh=gh)
        assert "close:42" in gh.actions

    def test_gate_passing_records_details(self, tmp_path):
        gh = FakeGh()
        run(tmp_path, gh=gh)
        record = json.loads((tmp_path / "runs" / "0001.json").read_text())
        assert record["verdict"] == "merged"
        assert record["iteration"] == 1
        assert record["issue"]["number"] == 42
        assert record["prNumber"] == 123
        assert record["gateReasons"] == []

    def test_creates_follow_up_issues_after_merge(self, tmp_path):
        gh = FakeGh()
        run(tmp_path, gh=gh, proposals=("idea A", "idea B"))
        assert gh.created_issues == ["idea A", "idea B"]

    def test_iteration_number_increments_across_runs(self, tmp_path):
        run(tmp_path, gh=FakeGh())
        second = run(tmp_path, gh=FakeGh())
        assert second.iteration == 2


class TestGateFailures:
    """gate 不通過は人間に振らず abandoned（自動見送り）になる。needs-human は出さない。"""

    def test_adversary_rejection_abandons_without_merge(self, tmp_path):
        gh = FakeGh()
        result = run(
            tmp_path, gh=gh,
            round_outcome=approved_round(
                adversary=AdversaryVerdict(approved=False, summary="薄い")
            ),
        )
        assert result.status == "abandoned"
        assert not any(a.startswith("merge:") for a in gh.actions)
        assert "label:loop:abandoned" in gh.actions
        assert "close:42" in gh.actions

    def test_gate_failure_never_pushes_or_opens_a_pr(self, tmp_path):
        # abandoned は push も PR もしない（needs-human 時代のような宙ぶらりんの PR を残さない）。
        gh = FakeGh()
        run(tmp_path, gh=gh, round_outcome=approved_round(e2e_passed=False))
        assert "open_pr" not in gh.actions
        assert not any(a.startswith("push:") for a in gh.actions)

    def test_abandon_retires_issue_from_ready_queue(self, tmp_path):
        # 毒饅頭バグの回帰（#14 / #15）: gate 不通過で loop:ready を外さないと、次反復で
        # ready[0] が同じ issue を拾い直す。ready を剥がして issue をクローズする。
        gh = FakeGh()
        result = run(
            tmp_path, gh=gh,
            round_outcome=approved_round(
                adversary=AdversaryVerdict(approved=False, summary="薄い")
            ),
        )
        assert result.status == "abandoned"
        assert "unlabel:loop:ready" in gh.actions
        assert "close:42" in gh.actions

    def test_protected_path_change_is_abandoned(self, tmp_path):
        gh = FakeGh(changed_files=["orchestrator/loop.py"])
        result = run(tmp_path, gh=gh)
        assert result.status == "abandoned"
        assert not any(a.startswith("merge:") for a in gh.actions)
        assert "open_pr" not in gh.actions

    def test_oversized_diff_is_abandoned(self, tmp_path):
        gh = FakeGh(changed_lines=999)
        result = run(tmp_path, gh=gh)
        assert result.status == "abandoned"

    def test_failed_verify_is_abandoned(self, tmp_path):
        gh = FakeGh()
        result = run(tmp_path, gh=gh, round_outcome=approved_round(verify_passed=False))
        assert result.status == "abandoned"

    def test_abandoned_iteration_records_verdict_and_reasons(self, tmp_path):
        gh = FakeGh()
        run(tmp_path, gh=gh, round_outcome=approved_round(e2e_passed=False))
        record = json.loads((tmp_path / "runs" / "0001.json").read_text())
        assert record["verdict"] == "abandoned"
        assert record["prNumber"] is None
        assert record["gateReasons"]  # 不通過理由が記録されている

    def test_blocked_iteration_does_not_create_follow_up_issues(self, tmp_path):
        gh = FakeGh(changed_lines=999)
        run(tmp_path, gh=gh)
        assert gh.created_issues == []


class TestNoWork:
    def test_no_ready_issue_is_a_noop(self, tmp_path):
        gh = FakeGh(issues=[])
        result = run(tmp_path, gh=gh)
        assert result.status == "no-work"
        assert gh.actions == []


class TestDryRun:
    def test_dry_run_never_merges(self, tmp_path):
        gh = FakeGh()
        result = run(tmp_path, gh=gh, cfg=Config.from_env({"LOOP_DRY_RUN": "1"}))
        assert result.status == "dry-run"
        assert not any(a.startswith("merge:") for a in gh.actions)

    def test_dry_run_records_verdict_dry_run(self, tmp_path):
        # レビュー指摘: 以前は dry-run も verdict="paused" として記録され、
        # 「人間が止めた」のか「設定でマージしない」のか区別できなかった。
        gh = FakeGh()
        run(tmp_path, gh=gh, cfg=Config.from_env({"LOOP_DRY_RUN": "1"}))
        record = json.loads((tmp_path / "runs" / "0001.json").read_text())
        assert record["verdict"] == "dry-run"
        assert record["prNumber"] == 123


class TestDuration:
    def test_duration_sec_is_derived_from_clock_reads(self, tmp_path):
        # レビュー指摘: duration_sec が 0 固定（started_at == finished_at）だったのを、
        # 実際の開始・終了時刻から計算するように変更した。
        gh = FakeGh()
        clock = make_clock("2026-07-20T12:00:00Z", "2026-07-20T12:07:30Z")
        run(tmp_path, gh=gh, clock=clock)
        record = json.loads((tmp_path / "runs" / "0001.json").read_text())
        assert record["startedAt"] == "2026-07-20T12:00:00Z"
        assert record["finishedAt"] == "2026-07-20T12:07:30Z"
        assert record["durationSec"] == 450


class TestNoChanges:
    def test_builder_produced_nothing_is_abandoned_without_pr(self, tmp_path):
        # builder の変更が commit されず空ブランチになったら、PR を作らず自動見送りする
        # （人間には振らない）。
        gh = FakeGh(committed=False)
        result = run(tmp_path, gh=gh)
        assert result.status == "abandoned"
        assert "commit" in gh.actions
        assert "open_pr" not in gh.actions
        assert not any(a.startswith("merge:") for a in gh.actions)
        assert "label:loop:abandoned" in gh.actions
        assert "close:42" in gh.actions
        record = json.loads((tmp_path / "runs" / "0001.json").read_text())
        assert record["verdict"] == "abandoned"
        assert record["prNumber"] is None
        assert "変更を生成しなかった" in record["gateReasons"][0]
        # builder が何も生成しなくても ready を外す（再拾いで無駄な課金を繰り返さない）
        assert "unlabel:loop:ready" in gh.actions

    def test_committed_changes_proceed_to_pr(self, tmp_path):
        gh = FakeGh(committed=True)
        result = run(tmp_path, gh=gh)
        assert result.status == "merged"
        assert "commit" in gh.actions
        assert "open_pr" in gh.actions
