from orchestrator.shell import CommandResult, FakeRunner


def test_fake_runner_records_commands_and_returns_queued_results():
    runner = FakeRunner([CommandResult(0, "hello", "")])
    result = runner(["echo", "hello"], cwd="/tmp")
    assert result.returncode == 0
    assert result.stdout == "hello"
    assert runner.calls == [(["echo", "hello"], "/tmp")]


def test_fake_runner_defaults_to_success_when_queue_is_empty():
    runner = FakeRunner([])
    assert runner(["anything"], cwd=".").returncode == 0


def test_command_result_ok_property():
    assert CommandResult(0, "", "").ok is True
    assert CommandResult(1, "", "boom").ok is False
