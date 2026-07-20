from orchestrator.gates import (
    PROTECTED_PREFIXES,
    KillSwitch,
    evaluate_gate,
    protected_violations,
    read_kill_switch,
    should_trip_breaker,
    spent_today_usd,
)


class TestProtectedPaths:
    def test_dashboard_and_data_are_allowed(self):
        assert protected_violations(["dashboard/src/app/page.tsx", "data/runs/2.json"]) == []

    def test_workflows_and_orchestrator_are_blocked(self):
        violations = protected_violations(
            [".github/workflows/loop.yml", "orchestrator/loop.py", "dashboard/x.ts"]
        )
        assert violations == [".github/workflows/loop.yml", "orchestrator/loop.py"]

    def test_control_file_is_blocked(self):
        assert protected_violations([".loop/control.json"]) == [".loop/control.json"]

    def test_prefixes_are_documented(self):
        assert ".github/workflows/" in PROTECTED_PREFIXES
        assert "orchestrator/" in PROTECTED_PREFIXES


class TestEvaluateGate:
    def _kwargs(self, **overrides):
        base = dict(
            verify_passed=True,
            e2e_passed=True,
            adversary_approved=True,
            changed_lines=100,
            changed_files=["dashboard/src/app/page.tsx"],
            max_changed_lines=400,
        )
        base.update(overrides)
        return base

    def test_all_conditions_met_passes(self):
        result = evaluate_gate(**self._kwargs())
        assert result.passed is True
        assert result.reasons == ()

    def test_failing_verify_blocks(self):
        result = evaluate_gate(**self._kwargs(verify_passed=False))
        assert result.passed is False
        assert any("verify" in r for r in result.reasons)

    def test_failing_e2e_blocks(self):
        result = evaluate_gate(**self._kwargs(e2e_passed=False))
        assert result.passed is False
        assert any("e2e" in r for r in result.reasons)

    def test_adversary_rejection_blocks(self):
        result = evaluate_gate(**self._kwargs(adversary_approved=False))
        assert result.passed is False
        assert any("adversary" in r for r in result.reasons)

    def test_too_many_changed_lines_blocks(self):
        result = evaluate_gate(**self._kwargs(changed_lines=401))
        assert result.passed is False
        assert any("400" in r for r in result.reasons)

    def test_exactly_at_limit_passes(self):
        assert evaluate_gate(**self._kwargs(changed_lines=400)).passed is True

    def test_protected_path_blocks(self):
        result = evaluate_gate(**self._kwargs(changed_files=["orchestrator/gates.py"]))
        assert result.passed is False
        assert any("orchestrator/gates.py" in r for r in result.reasons)

    def test_all_failures_are_reported_together(self):
        result = evaluate_gate(
            **self._kwargs(
                verify_passed=False,
                adversary_approved=False,
                changed_lines=999,
                changed_files=["orchestrator/x.py"],
            )
        )
        assert result.passed is False
        assert len(result.reasons) == 4


class TestKillSwitch:
    def test_enabled_when_nothing_disables_it(self):
        ks = read_kill_switch(env={}, control={})
        assert ks.enabled is True

    def test_env_false_disables(self):
        ks = read_kill_switch(env={"LOOP_ENABLED": "false"}, control={})
        assert ks.enabled is False
        assert ks.actor == "human:env"

    def test_control_file_false_disables(self):
        ks = read_kill_switch(
            env={}, control={"enabled": False, "reason": "手動停止", "actor": "human:yut0takagi"}
        )
        assert ks.enabled is False
        assert ks.reason == "手動停止"
        assert ks.actor == "human:yut0takagi"

    def test_either_source_disabling_wins_fail_safe(self):
        ks = read_kill_switch(env={"LOOP_ENABLED": "true"}, control={"enabled": False})
        assert ks.enabled is False


class TestBreaker:
    def test_trips_after_k_consecutive_non_merges(self):
        assert should_trip_breaker(["failed", "failed", "failed"], k=3) is True

    def test_does_not_trip_when_a_merge_is_within_window(self):
        assert should_trip_breaker(["failed", "merged", "failed"], k=3) is False

    def test_uses_only_the_most_recent_k(self):
        # 古い成功は無視され、直近3件がすべて失敗なので発火する
        assert should_trip_breaker(["merged", "failed", "failed", "failed"], k=3) is True

    def test_does_not_trip_before_k_runs_exist(self):
        assert should_trip_breaker(["failed", "failed"], k=3) is False


class TestBudget:
    def test_sums_only_todays_runs(self):
        runs = [
            {"finishedAt": "2026-07-20T01:00:00Z", "cost": {"totalUsd": 0.2}},
            {"finishedAt": "2026-07-20T23:00:00Z", "cost": {"totalUsd": 0.3}},
            {"finishedAt": "2026-07-19T23:00:00Z", "cost": {"totalUsd": 9.0}},
        ]
        assert spent_today_usd(runs, today="2026-07-20") == 0.5

    def test_returns_zero_when_no_runs_today(self):
        assert spent_today_usd([], today="2026-07-20") == 0.0
