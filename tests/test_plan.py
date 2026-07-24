import json

from orchestrator.config import Config
from orchestrator.plan import PlanResult, parse_plan, propose_plan
from orchestrator.shell import CommandResult, FakeRunner


FULL = (
    "```json\n"
    + json.dumps({
        "trivial": False,
        "design": "ルータを導入しページを分割する",
        "tasks": ["ルータ骨組み", "パネル移設"],
        "acceptance": ["/a /b が表示される", "既存テスト緑"],
    }, ensure_ascii=False)
    + "\n```"
)
TRIVIAL = '```json\n{"trivial": true, "design": "", "tasks": [], "acceptance": []}\n```'


def test_parse_full_plan_is_not_trivial_and_renders_sections():
    res = parse_plan(FULL, cost=0.05)
    assert isinstance(res, PlanResult)
    assert res.trivial is False
    assert "ルータを導入" in res.plan_text
    assert "パネル移設" in res.plan_text
    assert "/a /b が表示される" in res.plan_text
    assert res.cost_usd == 0.05


def test_parse_trivial_plan():
    res = parse_plan(TRIVIAL, cost=0.01)
    assert res.trivial is True


def test_parse_malformed_falls_back_to_nontrivial_raw_text():
    # 壊れた出力でも build を止めない: trivial=False で生テキストを plan に載せる。
    res = parse_plan("これは JSON ではない散文の計画", cost=0.0)
    assert res.trivial is False
    assert "散文の計画" in res.plan_text


def _agent(text, cost=0.05):
    return CommandResult(0, json.dumps({"result": text, "total_cost_usd": cost}), "")


def test_propose_plan_calls_planner_model():
    runner = FakeRunner([_agent(FULL)])
    res = propose_plan(task="複数ページ化", cfg=Config.from_env({}), cwd="/repo", runner=runner)
    cmd = runner.calls[0][0]
    assert cmd[cmd.index("--model") + 1] == "claude-sonnet-5"
    assert res.trivial is False
    assert "複数ページ化" in cmd[2]  # プロンプトにタスクが入っている


def test_string_false_is_not_treated_as_trivial():
    # モデルが JSON boolean でなく文字列 "false" を返しても trivial にしない（bool("false")==True 罠）。
    res = parse_plan('```json\n{"trivial": "false", "design": "d", "tasks": [], "acceptance": []}\n```', cost=0.0)
    assert res.trivial is False


def test_only_real_json_true_is_trivial():
    res = parse_plan('```json\n{"trivial": true, "design": "", "tasks": [], "acceptance": []}\n```', cost=0.0)
    assert res.trivial is True


def test_plan_dict_adapter_shapes_planresult():
    from orchestrator.plan import plan_dict_from_result, PlanResult
    d = plan_dict_from_result(PlanResult(trivial=False, plan_text="P", cost_usd=0.05))
    assert d == {"trivial": False, "plan_text": "P", "cost_usd": 0.05}
