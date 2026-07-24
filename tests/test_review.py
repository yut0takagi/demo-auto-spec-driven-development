from orchestrator.review import ADVERSARY_PROMPT_TEMPLATE, parse_adversary_review


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


def test_prompt_template_is_fair_and_has_json_contract():
    # 「却下理由探し」ではなく公正な判定を指示する（要件を満たし壊していなければ承認）。
    # 却下は具体的な blocking 欠陥がある場合のみ。JSON 契約とプレースホルダは維持する。
    assert "公正" in ADVERSARY_PROMPT_TEMPLATE
    assert "承認" in ADVERSARY_PROMPT_TEMPLATE
    assert "blocking" in ADVERSARY_PROMPT_TEMPLATE
    assert "approved" in ADVERSARY_PROMPT_TEMPLATE
    assert "{task}" in ADVERSARY_PROMPT_TEMPLATE
    assert "{diff}" in ADVERSARY_PROMPT_TEMPLATE
