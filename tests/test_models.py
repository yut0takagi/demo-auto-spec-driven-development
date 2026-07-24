import json
from dataclasses import replace

from orchestrator.models import AdversaryVerdict, CostBreakdown, Issue, LoopStatus, RunRecord, VerifyResult


def make_record() -> RunRecord:
    return RunRecord(
        id="20260720T120000Z-42",
        iteration=42,
        issue=Issue(number=42, title="add x", labels=["loop:ready"]),
        branch="loop/42-add-x",
        started_at="2026-07-20T12:00:00Z",
        finished_at="2026-07-20T12:06:00Z",
        duration_sec=360,
        revise_cycles=1,
        verdict="merged",
        gate_reasons=[],
        pr_number=42,
        adversary=AdversaryVerdict(approved=True, summary="ok"),
        verify=VerifyResult(unit_passed=True, e2e_passed=True, coverage_pct=87.5),
        changed_lines=120,
        cost=CostBreakdown(builder_usd=0.12, adversary_usd=0.02, ideation_usd=0.01),
        models={"builder": "claude-sonnet-5", "adversary": "claude-haiku-4-5", "ideation": "claude-haiku-4-5"},
        next_issues=[43, 44],
    )


def test_to_json_uses_camel_case_matching_typescript_contract():
    payload = json.loads(make_record().to_json())
    assert payload["durationSec"] == 360
    assert payload["reviseCycles"] == 1
    assert payload["changedLines"] == 120
    assert payload["startedAt"] == "2026-07-20T12:00:00Z"
    assert payload["finishedAt"] == "2026-07-20T12:06:00Z"
    assert payload["nextIssues"] == [43, 44]
    assert payload["issue"]["number"] == 42
    assert payload["adversary"]["approved"] is True
    assert payload["verify"]["coveragePct"] == 87.5
    assert payload["verify"]["unitPassed"] is True
    assert payload["verify"]["e2ePassed"] is True
    assert payload["gateReasons"] == []
    assert payload["prNumber"] == 42


def test_cost_total_is_derived_not_stored():
    payload = json.loads(make_record().to_json())
    assert payload["cost"]["builderUsd"] == 0.12
    assert payload["cost"]["totalUsd"] == 0.15


def test_pr_number_serialises_as_null_when_absent():
    record = replace(make_record(), pr_number=None, verdict="failed")
    payload = json.loads(record.to_json())
    assert payload["prNumber"] is None


def test_gate_reasons_round_trip_as_a_list():
    record = replace(
        make_record(),
        verdict="needs-human",
        gate_reasons=["adversary が approve していない", "e2e(Playwright) が失敗している"],
    )
    payload = json.loads(record.to_json())
    assert payload["gateReasons"] == [
        "adversary が approve していない",
        "e2e(Playwright) が失敗している",
    ]


def test_dry_run_is_a_valid_verdict():
    record = replace(make_record(), verdict="dry-run")
    payload = json.loads(record.to_json())
    assert payload["verdict"] == "dry-run"


def test_total_usd_includes_planner():
    from orchestrator.models import CostBreakdown

    c = CostBreakdown(builder_usd=0.1, adversary_usd=0.02, ideation_usd=0.01, planner_usd=0.05)
    assert c.total_usd == 0.18
    assert c.to_dict()["plannerUsd"] == 0.05
    assert c.to_dict()["totalUsd"] == 0.18


def test_loop_status_serialises_camel_case():
    status = LoopStatus(
        state="HALTED",
        reason="breaker tripped",
        actor="breaker:consecutive-failures",
        updated_at="2026-07-20T12:00:00Z",
        resume_hint="gh variable set LOOP_ENABLED --body true",
    )
    payload = json.loads(status.to_json())
    assert payload["state"] == "HALTED"
    assert payload["updatedAt"] == "2026-07-20T12:00:00Z"
    assert payload["resumeHint"].startswith("gh variable set")
