import sys

import orchestrator.__main__ as m


def test_no_args_dispatches_full_iteration(monkeypatch):
    called = {}
    monkeypatch.setattr(m, "_run_full_iteration", lambda: called.update(full=True) or 0)
    monkeypatch.setattr(sys, "argv", ["orchestrator"])
    assert m.main() == 0
    assert called.get("full") is True


def test_plan_subcommand_dispatches_plan_phase(monkeypatch):
    called = {}
    monkeypatch.setattr(m, "_run_plan_phase", lambda: called.update(plan=True) or 0)
    monkeypatch.setattr(sys, "argv", ["orchestrator", "plan"])
    assert m.main() == 0
    assert called.get("plan") is True


def test_build_subcommand_dispatches_build_phase(monkeypatch):
    called = {}
    monkeypatch.setattr(m, "_run_build_phase", lambda: called.update(build=True) or 0)
    monkeypatch.setattr(sys, "argv", ["orchestrator", "build"])
    assert m.main() == 0
    assert called.get("build") is True


def test_gate_subcommand_dispatches_gate_phase(monkeypatch):
    called = {}
    monkeypatch.setattr(m, "_run_gate_phase", lambda: called.update(gate=True) or 0)
    monkeypatch.setattr(sys, "argv", ["orchestrator", "gate"])
    assert m.main() == 0
    assert called.get("gate") is True


def test_unknown_subcommand_returns_nonzero(monkeypatch):
    monkeypatch.setattr(sys, "argv", ["orchestrator", "bogus"])
    assert m.main() != 0
