import json

from orchestrator.config import Config
from orchestrator.round import RoundOutcome, run_native_round
from orchestrator.shell import CommandResult, FakeRunner


def agent_out(text: str, cost: float = 0.01) -> CommandResult:
    return CommandResult(0, json.dumps({"result": text, "total_cost_usd": cost}), "")


APPROVE = '```json\n{"approved": true, "summary": "ok"}\n```'
REJECT = '```json\n{"approved": false, "summary": "テストが薄い"}\n```'


def test_approved_on_first_review_runs_no_revise():
    runner = FakeRunner([
        agent_out("implemented", 0.10),   # builder.work
        agent_out(APPROVE, 0.01),         # adversary.review
        CommandResult(0, "", ""),         # npm run verify
        CommandResult(0, "", ""),         # npm run test:e2e
    ])
    outcome = run_native_round(
        task="add x", diff_provider=lambda: "diff", cwd="/repo",
        cfg=Config.from_env({}), runner=runner,
    )
    assert isinstance(outcome, RoundOutcome)
    assert outcome.adversary.approved is True
    assert outcome.revise_cycles == 0
    assert outcome.verify_passed is True
    assert outcome.e2e_passed is True
    assert outcome.builder_cost_usd == 0.10
    assert outcome.adversary_cost_usd == 0.01


def test_rejection_triggers_revise_then_re_review():
    runner = FakeRunner([
        agent_out("v1", 0.10),      # work
        agent_out(REJECT, 0.01),    # review 1 -> reject
        agent_out("v2", 0.08),      # revise
        agent_out(APPROVE, 0.01),   # review 2 -> approve
        CommandResult(0, "", ""),   # verify
        CommandResult(0, "", ""),   # e2e
    ])
    outcome = run_native_round(
        task="add x", diff_provider=lambda: "diff", cwd="/repo",
        cfg=Config.from_env({}), runner=runner,
    )
    assert outcome.revise_cycles == 1
    assert outcome.adversary.approved is True
    assert outcome.builder_cost_usd == 0.18


def test_stops_after_max_revise_cycles_still_rejected():
    runner = FakeRunner([
        agent_out("v1"), agent_out(REJECT),
        agent_out("v2"), agent_out(REJECT),
        agent_out("v3"), agent_out(REJECT),
        CommandResult(0, "", ""),  # verify
        CommandResult(0, "", ""),  # e2e
    ])
    outcome = run_native_round(
        task="t", diff_provider=lambda: "d", cwd="/repo",
        cfg=Config.from_env({"MAX_REVISE_CYCLES": "2"}), runner=runner,
    )
    assert outcome.revise_cycles == 2
    assert outcome.adversary.approved is False


def test_failing_verify_is_reported():
    runner = FakeRunner([
        agent_out("v1"), agent_out(APPROVE),
        CommandResult(1, "", "tsc error"),  # verify fails
        CommandResult(0, "", ""),           # e2e
    ])
    outcome = run_native_round(
        task="t", diff_provider=lambda: "d", cwd="/repo",
        cfg=Config.from_env({}), runner=runner,
    )
    assert outcome.verify_passed is False


def test_builder_prompt_contains_the_task():
    runner = FakeRunner([
        agent_out("v1"), agent_out(APPROVE),
        CommandResult(0, "", ""), CommandResult(0, "", ""),
    ])
    run_native_round(
        task="カバレッジを上げる", diff_provider=lambda: "d", cwd="/repo",
        cfg=Config.from_env({}), runner=runner,
    )
    builder_cmd = runner.calls[0][0]
    assert "カバレッジを上げる" in builder_cmd[2]


def test_uses_configured_models_for_each_role():
    runner = FakeRunner([
        agent_out("v1"), agent_out(APPROVE),
        CommandResult(0, "", ""), CommandResult(0, "", ""),
    ])
    run_native_round(
        task="t", diff_provider=lambda: "d", cwd="/repo",
        cfg=Config.from_env({}), runner=runner,
    )
    builder_cmd, adversary_cmd = runner.calls[0][0], runner.calls[1][0]
    assert builder_cmd[builder_cmd.index("--model") + 1] == "claude-sonnet-5"
    assert adversary_cmd[adversary_cmd.index("--model") + 1] == "claude-haiku-4-5"
