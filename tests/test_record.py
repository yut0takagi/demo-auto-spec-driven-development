import json

from orchestrator.models import (
    AdversaryVerdict, CostBreakdown, Issue, RunRecord, VerifyResult,
)
from orchestrator.record import load_runs, next_iteration, write_run_record, write_status


def make_record(iteration: int) -> RunRecord:
    return RunRecord(
        id=f"20260720T000000Z-{iteration}",
        iteration=iteration,
        issue=Issue(number=iteration, title="t", labels=[]),
        branch=f"loop/{iteration}-x",
        started_at="2026-07-20T00:00:00Z",
        finished_at="2026-07-20T00:05:00Z",
        duration_sec=300,
        revise_cycles=0,
        verdict="merged",
        gate_reasons=[],
        pr_number=11,
        adversary=AdversaryVerdict(approved=True, summary=""),
        verify=VerifyResult(unit_passed=True, e2e_passed=True, coverage_pct=80.0),
        changed_lines=10,
        cost=CostBreakdown(builder_usd=0.1),
        models={"builder": "b", "adversary": "a", "ideation": "i"},
    )


def test_write_run_record_creates_zero_padded_file(tmp_path):
    path = write_run_record(make_record(7), data_dir=tmp_path)
    assert path.name == "0007.json"
    assert json.loads(path.read_text())["iteration"] == 7


def test_write_run_record_creates_directory_when_missing(tmp_path):
    target = tmp_path / "nested"
    write_run_record(make_record(1), data_dir=target)
    assert (target / "runs" / "0001.json").exists()


def test_load_runs_returns_sorted_dicts(tmp_path):
    write_run_record(make_record(3), data_dir=tmp_path)
    write_run_record(make_record(1), data_dir=tmp_path)
    runs = load_runs(tmp_path)
    assert [r["iteration"] for r in runs] == [1, 3]


def test_load_runs_on_missing_dir_is_empty(tmp_path):
    assert load_runs(tmp_path / "nope") == []


def test_next_iteration_starts_at_one(tmp_path):
    assert next_iteration(tmp_path) == 1


def test_next_iteration_is_max_plus_one(tmp_path):
    write_run_record(make_record(4), data_dir=tmp_path)
    write_run_record(make_record(2), data_dir=tmp_path)
    assert next_iteration(tmp_path) == 5


def test_write_status_round_trips(tmp_path):
    write_status(
        tmp_path, state="HALTED", reason="breaker", actor="breaker:x",
        resume_hint="gh variable set LOOP_ENABLED --body true",
        now="2026-07-20T12:00:00Z",
    )
    payload = json.loads((tmp_path / "status.json").read_text())
    assert payload["state"] == "HALTED"
    assert payload["actor"] == "breaker:x"
    assert payload["updatedAt"] == "2026-07-20T12:00:00Z"
