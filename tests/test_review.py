from orchestrator.review import ADVERSARY_PROMPT_TEMPLATE, parse_adversary_review
from orchestrator.review import PLAN_REVIEW_PROMPT_TEMPLATE, review_plan


def test_parses_fenced_json_verdict():
    text = """
    ざっと見た。
    ```json
    {"approved": false, "summary": "境界値のテストが無い", "blocking_issues": ["n=0 が未検証"]}
    ```
    """
    verdict = parse_adversary_review(text)
    assert verdict.approved is False
    assert "境界値" in verdict.summary


def test_parses_bare_json():
    verdict = parse_adversary_review('{"approved": true, "summary": "問題なし"}')
    assert verdict.approved is True
    assert verdict.summary == "問題なし"


def test_unparseable_output_is_treated_as_rejection():
    verdict = parse_adversary_review("よさそうです！")
    assert verdict.approved is False
    assert "解釈できない" in verdict.summary


def test_missing_approved_key_is_treated_as_rejection():
    verdict = parse_adversary_review('{"summary": "曖昧"}')
    assert verdict.approved is False


def test_non_boolean_approved_is_treated_as_rejection():
    verdict = parse_adversary_review('{"approved": "yes", "summary": "s"}')
    assert verdict.approved is False


def test_plan_review_prompt_is_fair_and_has_placeholders():
    t = PLAN_REVIEW_PROMPT_TEMPLATE
    assert "{task}" in t and "{plan}" in t
    assert "公正" in t          # 公正レビュー基調（reject バイアスにしない）
    assert "approved" in t       # JSON 契約


def test_review_plan_parses_verdict():
    import json
    from orchestrator.config import Config
    from orchestrator.shell import CommandResult, FakeRunner
    approve = '```json\n{"approved": true, "summary": "妥当"}\n```'
    runner = FakeRunner([CommandResult(0, json.dumps({"result": approve, "total_cost_usd": 0.01}), "")])
    verdict, cost = review_plan(task="t", plan="## 設計\n...", cfg=Config.from_env({}), cwd="/repo", runner=runner)
    assert verdict.approved is True
    assert cost == 0.01
    cmd = runner.calls[0][0]
    assert cmd[cmd.index("--model") + 1] == "claude-haiku-4-5"  # adversary_model を使う


def test_prompt_template_is_fair_and_has_json_contract():
    # 「却下理由探し」ではなく公正な判定を指示する（要件を満たし壊していなければ承認）。
    # 却下は具体的な blocking 欠陥がある場合のみ。JSON 契約とプレースホルダは維持する。
    assert "公正" in ADVERSARY_PROMPT_TEMPLATE
    assert "承認" in ADVERSARY_PROMPT_TEMPLATE
    assert "blocking" in ADVERSARY_PROMPT_TEMPLATE
    assert "approved" in ADVERSARY_PROMPT_TEMPLATE
    assert "{task}" in ADVERSARY_PROMPT_TEMPLATE
    assert "{diff}" in ADVERSARY_PROMPT_TEMPLATE
