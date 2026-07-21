import pytest

from orchestrator.config import Config
from orchestrator.h5i_round import build_turn_prompt, select_round_runner
from orchestrator.round import run_native_round


def test_selects_native_by_default():
    assert select_round_runner(Config.from_env({})) is run_native_round


def test_selects_h5i_when_configured():
    runner = select_round_runner(Config.from_env({"ORCHESTRATOR": "h5i"}))
    assert runner is not run_native_round
    assert runner.__name__ == "run_h5i_round"


def test_unknown_orchestrator_falls_back_to_native():
    assert select_round_runner(Config.from_env({"ORCHESTRATOR": "bogus"})) is run_native_round


def test_turn_prompt_includes_task_and_role():
    prompt = build_turn_prompt(role="builder", task="add chart", materials="")
    assert "add chart" in prompt
    assert "builder" in prompt.lower()


def test_turn_prompt_includes_materials_when_present():
    prompt = build_turn_prompt(role="adversary", task="t", materials="diff --git a/x")
    assert "diff --git a/x" in prompt
