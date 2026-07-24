import json

from orchestrator.config import Config
from orchestrator.round import RoundOutcome, run_native_round
from orchestrator.shell import CommandResult, FakeRunner


def agent_out(text: str, cost: float = 0.01) -> CommandResult:
    return CommandResult(0, json.dumps({"result": text, "total_cost_usd": cost}), "")


OK = CommandResult(0, "", "")
APPROVE = '```json\n{"approved": true, "summary": "ok"}\n```'
REJECT = '```json\n{"approved": false, "summary": "テストが薄い"}\n```'


def _round(runner, env=None):
    return run_native_round(
        task="add x", diff_provider=lambda: "diff", cwd="/repo",
        cfg=Config.from_env(env or {}), runner=runner,
    )


def test_all_green_on_first_pass_runs_no_revise():
    # builder → verify → e2e → adversary(approve) の順で、一発緑なら revise しない。
    runner = FakeRunner([
        agent_out("implemented", 0.10),   # builder.work
        OK,                               # npm run verify
        OK,                               # npm run test:e2e
        agent_out(APPROVE, 0.01),         # adversary.review
    ])
    outcome = _round(runner)
    assert isinstance(outcome, RoundOutcome)
    assert outcome.adversary.approved is True
    assert outcome.revise_cycles == 0
    assert outcome.verify_passed is True
    assert outcome.e2e_passed is True
    assert outcome.builder_cost_usd == 0.10
    assert outcome.adversary_cost_usd == 0.01


def test_adversary_rejection_triggers_revise_then_approve():
    runner = FakeRunner([
        agent_out("v1", 0.10),      # builder
        OK, OK,                     # verify, e2e
        agent_out(REJECT, 0.01),    # review 1 -> reject
        agent_out("v2", 0.08),      # revise
        OK, OK,                     # verify, e2e
        agent_out(APPROVE, 0.01),   # review 2 -> approve
    ])
    outcome = _round(runner)
    assert outcome.revise_cycles == 1
    assert outcome.adversary.approved is True
    assert outcome.builder_cost_usd == 0.18


def test_failing_verify_feeds_back_and_revises_until_green():
    # 新挙動: verify の失敗も builder に戻して再試行する（旧実装は末尾で測るだけだった）。
    # verify が赤のサイクルでは e2e も adversary も回さない。
    runner = FakeRunner([
        agent_out("v1"),                        # builder
        CommandResult(1, "", "tsc: error"),     # verify 失敗（e2e はスキップ）
        agent_out("v2"),                        # revise
        OK, OK,                                 # verify, e2e 緑
        agent_out(APPROVE),                     # adversary approve
    ])
    outcome = _round(runner)
    assert outcome.revise_cycles == 1
    assert outcome.verify_passed is True
    assert outcome.e2e_passed is True
    assert outcome.adversary.approved is True


def test_failing_e2e_feeds_back_and_revises_until_green():
    # 新挙動: e2e の失敗も builder に戻す。verify 緑 → e2e 失敗 → adversary はスキップ。
    runner = FakeRunner([
        agent_out("v1"),                        # builder
        OK,                                     # verify 緑
        CommandResult(1, "", "e2e failed"),     # e2e 失敗（adversary はスキップ）
        agent_out("v2"),                        # revise
        OK, OK,                                 # verify, e2e 緑
        agent_out(APPROVE),                     # adversary approve
    ])
    outcome = _round(runner)
    assert outcome.revise_cycles == 1
    assert outcome.e2e_passed is True
    assert outcome.adversary.approved is True


def test_stops_after_max_cycles_when_verify_never_passes():
    # verify が緑にならないまま上限に達したら、諦めて verify_passed=False で返す。
    runner = FakeRunner([
        agent_out("v1"),                    # builder
        CommandResult(1, "", "err"),        # cycle0 verify 失敗
        agent_out("r1"),                    # revise
        CommandResult(1, "", "err"),        # cycle1 verify 失敗
        agent_out("r2"),                    # revise
        CommandResult(1, "", "err"),        # cycle2 verify 失敗 -> 上限で break
    ])
    outcome = _round(runner, env={"MAX_REVISE_CYCLES": "2"})
    assert outcome.revise_cycles == 2
    assert outcome.verify_passed is False
    assert outcome.adversary.approved is False


def test_stops_after_max_cycles_when_adversary_never_approves():
    runner = FakeRunner([
        agent_out("v1"), OK, OK, agent_out(REJECT),   # cycle0
        agent_out("r1"), OK, OK, agent_out(REJECT),   # cycle1
        agent_out("r2"), OK, OK, agent_out(REJECT),   # cycle2 -> 上限で break
    ])
    outcome = _round(runner, env={"MAX_REVISE_CYCLES": "2"})
    assert outcome.revise_cycles == 2
    assert outcome.adversary.approved is False
    assert outcome.verify_passed is True
    assert outcome.e2e_passed is True


def test_builder_prompt_contains_the_task():
    runner = FakeRunner([agent_out("v1"), OK, OK, agent_out(APPROVE)])
    run_native_round(
        task="カバレッジを上げる", diff_provider=lambda: "d", cwd="/repo",
        cfg=Config.from_env({}), runner=runner,
    )
    builder_cmd = runner.calls[0][0]
    assert "カバレッジを上げる" in builder_cmd[2]


def test_uses_configured_models_for_each_role():
    # builder=calls[0], adversary=calls[3]（間に verify/e2e の shell 呼び出しが入る）。
    runner = FakeRunner([agent_out("v1"), OK, OK, agent_out(APPROVE)])
    run_native_round(
        task="t", diff_provider=lambda: "d", cwd="/repo",
        cfg=Config.from_env({}), runner=runner,
    )
    builder_cmd, adversary_cmd = runner.calls[0][0], runner.calls[3][0]
    assert builder_cmd[builder_cmd.index("--model") + 1] == "claude-sonnet-5"
    assert adversary_cmd[adversary_cmd.index("--model") + 1] == "claude-haiku-4-5"


def test_escalates_builder_model_after_threshold():
    # ESCALATE_AFTER_CYCLES=1: cycle0 の builder は base、revise(cycle1) は昇格モデルを使う。
    runner = FakeRunner([
        agent_out("v1"),                     # builder cycle0 (base)
        CommandResult(1, "", "err"),         # verify 失敗
        agent_out("r1"),                     # revise cycle1 (escalated)
        OK, OK, agent_out(APPROVE),          # verify, e2e, approve
    ])
    outcome = run_native_round(
        task="t", diff_provider=lambda: "d", cwd="/repo",
        cfg=Config.from_env({"ESCALATE_AFTER_CYCLES": "1"}), runner=runner,
        plan="## 設計\nルータ導入",
    )
    work_cmd = runner.calls[0][0]
    revise_cmd = runner.calls[2][0]
    assert work_cmd[work_cmd.index("--model") + 1] == "claude-sonnet-5"
    assert revise_cmd[revise_cmd.index("--model") + 1] == "claude-opus-4-8"
    assert outcome.builder_model_used == "claude-opus-4-8"


def test_no_escalation_without_plan_even_after_threshold():
    # plan 無し（ライブ経路）: 何サイクル revise しても base モデルのまま（昇格しない）。
    runner = FakeRunner([
        agent_out("v1"), CommandResult(1, "", "e"),   # cycle0 verify fail
        agent_out("r1"), CommandResult(1, "", "e"),   # cycle1 verify fail
        agent_out("r2"), OK, OK, agent_out(APPROVE),  # cycle2 green
    ])
    outcome = run_native_round(
        task="t", diff_provider=lambda: "d", cwd="/repo",
        cfg=Config.from_env({"ESCALATE_AFTER_CYCLES": "1"}), runner=runner,  # no plan=
    )
    # cycle2 >= threshold(1) だが plan 無しなので昇格しない
    revise2_cmd = runner.calls[4][0]  # r2 の builder 呼び出し
    assert revise2_cmd[revise2_cmd.index("--model") + 1] == "claude-sonnet-5"
    assert outcome.builder_model_used == "claude-sonnet-5"


def test_no_escalation_when_green_early_keeps_base_model():
    runner = FakeRunner([agent_out("v1"), OK, OK, agent_out(APPROVE)])
    outcome = run_native_round(
        task="t", diff_provider=lambda: "d", cwd="/repo",
        cfg=Config.from_env({}), runner=runner,
    )
    assert outcome.builder_model_used == "claude-sonnet-5"


def test_plan_is_injected_into_builder_prompt():
    runner = FakeRunner([agent_out("v1"), OK, OK, agent_out(APPROVE)])
    run_native_round(
        task="t", diff_provider=lambda: "d", cwd="/repo",
        cfg=Config.from_env({}), runner=runner, plan="## 設計方針\nルータ導入",
    )
    builder_cmd = runner.calls[0][0]
    assert "ルータ導入" in builder_cmd[2]
