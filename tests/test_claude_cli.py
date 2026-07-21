import json

import pytest

from orchestrator.claude_cli import AgentError, AgentResult, run_agent
from orchestrator.shell import CommandResult, FakeRunner


def _payload(result_text: str, cost: float) -> str:
    return json.dumps({"result": result_text, "total_cost_usd": cost, "is_error": False})


def test_returns_text_and_cost():
    runner = FakeRunner([CommandResult(0, _payload("done", 0.042), "")])
    out = run_agent("do it", model="claude-sonnet-5", cwd="/repo", runner=runner)
    assert isinstance(out, AgentResult)
    assert out.text == "done"
    assert out.cost_usd == 0.042


def test_passes_model_and_print_flags():
    runner = FakeRunner([CommandResult(0, _payload("ok", 0.0), "")])
    run_agent("task", model="claude-haiku-4-5", cwd="/repo", runner=runner)
    cmd, cwd = runner.calls[0]
    assert cmd[0] == "claude"
    assert "-p" in cmd
    assert "--model" in cmd
    assert cmd[cmd.index("--model") + 1] == "claude-haiku-4-5"
    assert "--output-format" in cmd
    assert cmd[cmd.index("--output-format") + 1] == "json"
    assert cwd == "/repo"


def test_raises_on_nonzero_exit():
    runner = FakeRunner([CommandResult(1, "", "auth failed")])
    with pytest.raises(AgentError, match="auth failed"):
        run_agent("task", model="claude-sonnet-5", cwd="/repo", runner=runner)


def test_raises_on_unparseable_output():
    runner = FakeRunner([CommandResult(0, "not json", "")])
    with pytest.raises(AgentError, match="JSON"):
        run_agent("task", model="claude-sonnet-5", cwd="/repo", runner=runner)


def test_missing_cost_defaults_to_zero():
    runner = FakeRunner([CommandResult(0, json.dumps({"result": "x"}), "")])
    assert run_agent("t", model="m", cwd="/repo", runner=runner).cost_usd == 0.0
