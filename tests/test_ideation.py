import json

from orchestrator.config import Config
from orchestrator.ideation import parse_issue_proposals, propose_next_issues
from orchestrator.shell import CommandResult, FakeRunner


def agent_out(text: str, cost: float = 0.01) -> CommandResult:
    return CommandResult(0, json.dumps({"result": text, "total_cost_usd": cost}), "")


def test_parses_proposal_list():
    text = """```json
    [{"title": "カバレッジを90%に", "body": "lib/ の分岐が未検証"},
     {"title": "コスト推移に移動平均", "body": "ノイズが多い"}]
    ```"""
    proposals = parse_issue_proposals(text)
    assert [p.title for p in proposals] == ["カバレッジを90%に", "コスト推移に移動平均"]


def test_unparseable_output_yields_no_proposals():
    assert parse_issue_proposals("いい案が思いつきません") == []


def test_entries_missing_title_are_skipped():
    proposals = parse_issue_proposals('[{"body": "no title"}, {"title": "ok", "body": "b"}]')
    assert [p.title for p in proposals] == ["ok"]


def test_propose_respects_max_issues():
    text = json.dumps([{"title": f"t{i}", "body": "b"} for i in range(10)])
    runner = FakeRunner([agent_out(text)])
    result = propose_next_issues(
        context="ctx", cfg=Config.from_env({"IDEATION_MAX_ISSUES": "2"}),
        cwd="/repo", runner=runner,
    )
    assert len(result.proposals) == 2
    assert result.cost_usd == 0.01


def test_propose_uses_ideation_model():
    runner = FakeRunner([agent_out("[]")])
    propose_next_issues(context="c", cfg=Config.from_env({}), cwd="/repo", runner=runner)
    cmd = runner.calls[0][0]
    assert cmd[cmd.index("--model") + 1] == "claude-haiku-4-5"
