from pathlib import Path

from orchestrator.handoff import Handoff, read_handoff, write_handoff


def test_round_trip_preserves_all_fields(tmp_path):
    h = Handoff(
        status="ok", issue_number=176, issue_title="複数ページ化",
        branch="loop/176-multi", trivial=False, plan="## 設計\n...",
        verify_passed=True, e2e_passed=True, adversary_approved=True,
        adversary_summary="ok", revise_cycles=1,
        builder_model_used="claude-opus-4-8", builder_cost_usd=0.3,
        adversary_cost_usd=0.02, planner_cost_usd=0.05, changed_lines=420,
        changed_files=["dashboard/src/app/page.tsx"], ideation_cost_usd=0.0,
        next_issues=[901],
    )
    p = tmp_path / "handoff" / "iteration.json"
    write_handoff(p, h)
    assert read_handoff(p) == h


def test_write_creates_parent_dirs(tmp_path):
    p = tmp_path / "a" / "b" / "iteration.json"
    write_handoff(p, Handoff(status="no-work"))
    assert p.is_file()
    assert read_handoff(p).status == "no-work"
