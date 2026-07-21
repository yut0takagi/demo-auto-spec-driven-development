from orchestrator.breaker import BreakerAction, check_breakers
from orchestrator.config import Config


def runs(*specs):
    """(verdict, cost, finishedAt) のタプル列から run dict を作る。"""
    return [
        {"verdict": v, "cost": {"totalUsd": c}, "finishedAt": f}
        for v, c, f in specs
    ]


def test_no_trip_on_healthy_history():
    action = check_breakers(
        runs(("merged", 0.1, "2026-07-20T01:00:00Z")),
        cfg=Config.from_env({}),
        today="2026-07-20",
    )
    assert action.should_halt is False
    assert action.reason == ""


def test_consecutive_failures_trip_the_breaker():
    action = check_breakers(
        runs(
            ("failed", 0.1, "2026-07-20T01:00:00Z"),
            ("needs-human", 0.1, "2026-07-20T02:00:00Z"),
            ("failed", 0.1, "2026-07-20T03:00:00Z"),
        ),
        cfg=Config.from_env({}),
        today="2026-07-20",
    )
    assert action.should_halt is True
    assert action.actor == "breaker:consecutive-failures"
    assert "3" in action.reason


def test_daily_budget_overrun_trips_the_breaker():
    action = check_breakers(
        runs(("merged", 3.0, "2026-07-20T01:00:00Z"), ("merged", 2.5, "2026-07-20T02:00:00Z")),
        cfg=Config.from_env({}),
        today="2026-07-20",
    )
    assert action.should_halt is True
    assert action.actor == "breaker:daily-budget"


def test_yesterdays_spend_does_not_trip_today():
    action = check_breakers(
        runs(("merged", 99.0, "2026-07-19T01:00:00Z")),
        cfg=Config.from_env({}),
        today="2026-07-20",
    )
    assert action.should_halt is False


def test_failure_breaker_takes_precedence_over_budget():
    action = check_breakers(
        runs(
            ("failed", 9.0, "2026-07-20T01:00:00Z"),
            ("failed", 9.0, "2026-07-20T02:00:00Z"),
            ("failed", 9.0, "2026-07-20T03:00:00Z"),
        ),
        cfg=Config.from_env({}),
        today="2026-07-20",
    )
    assert action.actor == "breaker:consecutive-failures"
