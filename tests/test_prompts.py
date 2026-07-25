"""orchestrator/prompts のローダ（render/load）の振る舞いを固定する。"""

import pytest

from orchestrator import prompts

ALL_PROMPTS = [
    "planner",
    "plan_review",
    "adversary",
    "builder",
    "revise",
    "ideation",
    "h5i_turn",
]


@pytest.mark.parametrize("name", ALL_PROMPTS)
def test_every_prompt_loads_nonempty(name):
    assert prompts.load(name).strip() != ""


def test_render_substitutes_placeholder():
    out = prompts.render("adversary", task="TASK-X", diff="DIFF-Y")
    assert "TASK-X" in out
    assert "DIFF-Y" in out
    # 置換後にプレースホルダの二重波括弧が残っていないこと
    assert "{{" not in out and "}}" not in out


def test_render_keeps_json_single_braces():
    # JSON 例の素の { } は置換対象ではなくそのまま残る（str.format のエスケープ不要）。
    out = prompts.render("adversary", task="t", diff="d")
    assert '{"approved"' in out


def test_render_missing_value_raises_keyerror():
    # diff を渡さない → {{diff}} を解決できず KeyError。
    with pytest.raises(KeyError):
        prompts.render("adversary", task="t")


def test_render_unknown_prompt_raises_filenotfound():
    with pytest.raises(FileNotFoundError):
        prompts.render("does_not_exist", task="t")
