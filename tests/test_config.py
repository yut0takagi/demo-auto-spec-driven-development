from orchestrator.config import Config


def test_defaults_match_spec():
    cfg = Config.from_env({})
    # gate を満たすまでの再試行上限。retry-to-comply 化に伴い 2→3 に引き上げた。
    assert cfg.max_revise_cycles == 3
    assert cfg.max_changed_lines == 200000
    assert cfg.circuit_breaker_fails == 3
    assert cfg.daily_cost_budget_usd == 5.0
    assert cfg.per_iter_cost_budget_usd == 0.5
    assert cfg.ideation_max_issues == 3
    assert cfg.builder_model == "claude-sonnet-5"
    assert cfg.adversary_model == "claude-haiku-4-5"
    assert cfg.ideation_model == "claude-haiku-4-5"
    assert cfg.orchestrator == "native"
    assert cfg.dry_run is False


def test_env_overrides_are_typed():
    cfg = Config.from_env(
        {
            "MAX_REVISE_CYCLES": "5",
            "DAILY_COST_BUDGET_USD": "12.5",
            "BUILDER_MODEL": "claude-haiku-4-5",
            "ORCHESTRATOR": "h5i",
            "LOOP_DRY_RUN": "1",
        }
    )
    assert cfg.max_revise_cycles == 5
    assert cfg.daily_cost_budget_usd == 12.5
    assert cfg.builder_model == "claude-haiku-4-5"
    assert cfg.orchestrator == "h5i"
    assert cfg.dry_run is True


def test_dry_run_accepts_common_truthy_spellings():
    for value in ("1", "true", "TRUE", "yes"):
        assert Config.from_env({"LOOP_DRY_RUN": value}).dry_run is True
    for value in ("0", "false", "", "no"):
        assert Config.from_env({"LOOP_DRY_RUN": value}).dry_run is False
