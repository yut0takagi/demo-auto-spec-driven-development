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
        number = 900 + len(self.created_issues)
        # 給油後に list_ready_issues を再取得したとき新しい燃料が見えるよう _issues にも反映する
        self._issues.append(Issue(number=number, title=title, labels=list(labels)))
        return number


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
        proposals=("next idea",), clock=None, ideation_runner=None,
        planner=None, plan_reviewer=None, round_runner_fn=None):
    """1 反復を実行するヘルパ。

    kill_switch_reader は 3 回呼ばれる:
      1 回目 = 反復開始時, 2 回目 = ラウンド後・PR 前, 3 回目 = マージ直前。
    `disable_on_call=N` で N 回目以降を無効にし、任意のチェックポイントを検証する。
    `ideation_runner` を渡すと給油の挙動（呼び出し回数・提案内容）を差し替えられる。
    `planner`/`plan_reviewer` を渡すと PLAN フェーズを検証できる（未指定なら従来動作）。
    `round_runner_fn` を渡すと round_runner を差し替えられる（plan の受け渡し検証用）。
    """
    calls = {"n": 0}

    def kill_switch_reader():
        calls["n"] += 1
        if disable_on_call is None:
            return True
        return calls["n"] < disable_on_call

    def round_runner(**_kwargs):
        return round_outcome or approved_round()

    default_ideation = lambda **_k: (
        [{"title": t, "body": "b"} for t in proposals], 0.01
    )
    return run_iteration(
        gh=gh,
        cfg=cfg or Config.from_env({}),
        data_dir=tmp_path,
        repo_root=str(tmp_path),
        clock=clock or make_clock(),
        kill_switch_reader=kill_switch_reader,
        round_runner=round_runner_fn or round_runner,
        ideation_runner=ideation_runner or default_ideation,
        planner=planner,
        plan_reviewer=plan_reviewer,
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

    def test_low_backlog_is_refueled_with_proposed_issues(self, tmp_path):
        # ready 1 件 < low_water(2) なので反復先頭で給油し、提案が loop:ready 付きで作成される
        # （旧構造では merge 後にのみ生成していた）。
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
        # 上限のデフォルト値に依存せず gate 機構を検証するため、明示的に小さい上限を渡す。
        cfg = Config.from_env({"MAX_CHANGED_LINES": "100"})
        gh = FakeGh(changed_lines=9999)
        result = run(tmp_path, gh=gh, cfg=cfg)
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

    def test_blocked_iteration_still_refuels_low_backlog(self, tmp_path):
        # 旧: 失敗反復は follow-up を作らなかった。新設計では給油は gate 結果と独立に反復先頭で
        # 先回りするため、abandon で終わる反復でもバックログは補充される（枯れさせない意図的変更）。
        # abandon 理由は問わない（gate 不通過ならよい）。行数上限に依存しないよう adversary 却下で落とす。
        gh = FakeGh()  # ready 1 件 < low_water → 冒頭で給油
        result = run(
            tmp_path, gh=gh, proposals=("refuel idea",),
            round_outcome=approved_round(
                adversary=AdversaryVerdict(approved=False, summary="reject")
            ),
        )
        assert result.status == "abandoned"
        assert gh.created_issues == ["refuel idea"]


class TestSelfRefuel:
    """バックログが枯れないよう、反復先頭で低水位なら ideation を先回り実行する。
    ideation を merge 後だけに縛る旧構造では、ready が 0 になると二度と復活しなかった。
    """

    def test_empty_backlog_is_refueled_and_then_worked(self, tmp_path):
        # ready が空でも給油して補充し、その issue に着手して前進する（旧構造は no-work で死ぬ）。
        gh = FakeGh(issues=[])
        result = run(tmp_path, gh=gh, proposals=("fresh idea",))
        assert "fresh idea" in gh.created_issues
        assert result.status == "merged"

    def test_no_refuel_when_backlog_at_or_above_low_water(self, tmp_path):
        # ready が閾値以上なら給油しない。merge 後 ideation も廃止したので生成は 0 件。
        # 閾値のデフォルト値に依存しないよう、ちょうど low_water 件の ready を用意する。
        cfg = Config.from_env({})
        gh = FakeGh(issues=[
            Issue(number=i, title=f"t{i}", labels=["loop:ready"])
            for i in range(1, cfg.ideation_low_water + 1)
        ])
        calls = {"n": 0}

        def ideation(**_k):
            calls["n"] += 1
            return ([{"title": "x", "body": "b"}], 0.01)

        run(tmp_path, gh=gh, cfg=cfg, ideation_runner=ideation)
        assert calls["n"] == 0
        assert gh.created_issues == []

    def test_drained_backlog_attempts_refuel_then_noops_if_nothing_proposed(self, tmp_path):
        # 給油を試みても提案が 0 件なら no-work（クラッシュしない・次 cron で再挑戦）。
        gh = FakeGh(issues=[])
        calls = {"n": 0}

        def ideation(**_k):
            calls["n"] += 1
            return ([], 0.0)

        result = run(tmp_path, gh=gh, ideation_runner=ideation)
        assert calls["n"] == 1
        assert result.status == "no-work"
        assert gh.created_issues == []

    def test_refuel_dedupes_against_open_ready_titles(self, tmp_path):
        # 枯れ際に既存オープンと同名を再生成しない（重複 issue 事故の防止）。
        gh = FakeGh(issues=[Issue(number=5, title="keep me", labels=["loop:ready"])])
        proposals = [{"title": "keep me", "body": "dup"}, {"title": "new one", "body": "b"}]
        run(tmp_path, gh=gh, ideation_runner=lambda **_k: (proposals, 0.01))
        assert gh.created_issues == ["new one"]

    def test_refuel_cost_is_recorded_even_when_iteration_abandoned(self, tmp_path):
        # 冒頭給油の ideation コストは、その反復が abandon で終わっても記録から消えない。
        gh = FakeGh(issues=[])
        result = run(
            tmp_path, gh=gh,
            ideation_runner=lambda **_k: ([{"title": "fresh idea", "body": "b"}], 0.02),
            round_outcome=approved_round(e2e_passed=False),
        )
        assert result.status == "abandoned"
        record = json.loads((tmp_path / "runs" / "0001.json").read_text())
        assert record["cost"]["ideationUsd"] == 0.02


class TestNoWork:
    def test_no_ready_issue_and_no_proposals_is_a_noop(self, tmp_path):
        # 給油を試みても提案が無ければ no-work。build 系の副作用も一切起きない。
        gh = FakeGh(issues=[])
        result = run(tmp_path, gh=gh, proposals=())
        assert result.status == "no-work"
        assert gh.actions == []


class TestFairOrdering:
    """給油が新しい雑務 Issue を注ぎ続けても、先に頼まれた古い Issue が餓死しないこと。

    素朴な `ready[0]`（gh 既定＝新しい順の先頭）だと最新 Issue を毎回拾い、古い依頼
    （例: 複数ページ化 #176）が後続の給油で永久に後回しになる。反復は最古（最小番号）を
    拾うべき。abandon 時に loop:ready が剥がれる（列から抜ける）ので詰まった Issue の
    無限再選択は起きない。
    """

    def test_picks_oldest_ready_issue_even_when_listed_newest_first(self, tmp_path):
        gh = FakeGh(issues=[
            Issue(number=181, title="new filler", labels=["loop:ready"]),
            Issue(number=180, title="new filler two", labels=["loop:ready"]),
            Issue(number=176, title="user requested feature", labels=["loop:ready"]),
        ])
        # proposals=() で給油が新規 Issue を作らないようにし、順序だけを検証する。
        result = run(tmp_path, gh=gh, proposals=())
        assert result.issue_number == 176
        assert "branch:loop/176-user-requested-feature" in gh.actions

    def test_newly_refueled_issue_does_not_jump_ahead_of_existing_backlog(self, tmp_path):
        # 低水位で給油が走り新しい Issue(#901) が積まれても、既存の最古 #10 を先に拾う。
        gh = FakeGh(issues=[
            Issue(number=50, title="mid", labels=["loop:ready"]),
            Issue(number=10, title="oldest", labels=["loop:ready"]),
        ])
        result = run(tmp_path, gh=gh, proposals=("fresh idea",))
        assert result.issue_number == 10


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


class TestModelRecording:
    def test_record_reflects_escalated_builder_model(self, tmp_path):
        gh = FakeGh()
        outcome = approved_round(builder_model_used="claude-opus-4-8")
        run(tmp_path, gh=gh, round_outcome=outcome)
        record = json.loads((tmp_path / "runs" / "0001.json").read_text())
        assert record["models"]["builder"] == "claude-opus-4-8"


class TestPlanPhase:
    def test_planner_runs_before_builder_and_plan_reaches_round(self, tmp_path):
        seen = {}

        def planner(*, task, cfg, cwd):
            seen["planned_task"] = task
            return {"trivial": False, "plan_text": "## 設計\nルータ導入", "cost_usd": 0.05}

        def round_runner(**kwargs):
            seen["round_plan"] = kwargs.get("plan", "")
            return approved_round()

        gh = FakeGh(issues=[Issue(number=176, title="複数ページ化", labels=["loop:ready"])])
        result = run(tmp_path, gh=gh, proposals=(), planner=planner, round_runner_fn=round_runner)
        assert result.status == "merged"
        assert "複数ページ化" in seen["planned_task"]
        assert "ルータ導入" in seen["round_plan"]

    def test_plan_review_rejection_replans_up_to_limit(self, tmp_path):
        calls = {"plan": 0, "review": 0}

        def planner(*, task, cfg, cwd):
            calls["plan"] += 1
            return {"trivial": False, "plan_text": f"plan-v{calls['plan']}", "cost_usd": 0.01}

        def plan_reviewer(*, task, plan, cfg, cwd):
            calls["review"] += 1
            from orchestrator.models import AdversaryVerdict
            return AdversaryVerdict(approved=(calls["review"] >= 2), summary="s"), 0.01

        gh = FakeGh(issues=[Issue(number=5, title="t", labels=["loop:ready"])])
        result = run(tmp_path, gh=gh, proposals=(), planner=planner, plan_reviewer=plan_reviewer)
        assert calls["plan"] == 2        # 1回却下 → 1回再計画
        assert result.status == "merged"

    def test_trivial_plan_skips_plan_text(self, tmp_path):
        seen = {}
        def planner(*, task, cfg, cwd):
            return {"trivial": True, "plan_text": "should be ignored", "cost_usd": 0.0}
        def round_runner(**kwargs):
            seen["round_plan"] = kwargs.get("plan", "")
            return approved_round()
        gh = FakeGh(issues=[Issue(number=9, title="tiny", labels=["loop:ready"])])
        result = run(tmp_path, gh=gh, proposals=(), planner=planner, round_runner_fn=round_runner)
        assert result.status == "merged"
        assert seen["round_plan"] == ""   # trivial は plan を渡さない


class TestPlanPhaseFunction:
    def test_plan_phase_picks_oldest_and_returns_plan(self, tmp_path):
        from orchestrator.loop import plan_phase

        def planner(*, task, cfg, cwd):
            return {"trivial": False, "plan_text": "## 設計\nX", "cost_usd": 0.05}

        gh = FakeGh(issues=[
            Issue(number=9, title="new", labels=["loop:ready"]),
            Issue(number=3, title="old", labels=["loop:ready"]),
        ])
        res = plan_phase(gh=gh, cfg=Config.from_env({}), repo_root=str(tmp_path),
                         kill_switch_reader=lambda: True,
                         ideation_runner=lambda **k: ([], 0.0),
                         planner=planner, plan_reviewer=None)
        assert res.status == "ok"
        assert res.issue.number == 3           # FIFO 最古
        assert "## 設計" in res.plan_text
        assert res.branch == "loop/3-old"

    def test_plan_phase_no_work_when_empty(self, tmp_path):
        from orchestrator.loop import plan_phase
        gh = FakeGh(issues=[])
        res = plan_phase(gh=gh, cfg=Config.from_env({}), repo_root=str(tmp_path),
                         kill_switch_reader=lambda: True,
                         ideation_runner=lambda **k: ([], 0.0),
                         planner=None, plan_reviewer=None)
        assert res.status == "no-work"

    def test_plan_phase_skipped_when_kill_switch_off(self, tmp_path):
        from orchestrator.loop import plan_phase
        gh = FakeGh(issues=[Issue(number=1, title="t", labels=["loop:ready"])])
        res = plan_phase(gh=gh, cfg=Config.from_env({}), repo_root=str(tmp_path),
                         kill_switch_reader=lambda: False,
                         ideation_runner=lambda **k: ([], 0.0),
                         planner=None, plan_reviewer=None)
        assert res.status == "skipped-disabled"
