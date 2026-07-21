"""subprocess の唯一の境界。テストでは FakeRunner に差し替える。"""

from __future__ import annotations

import subprocess
from dataclasses import dataclass, field
from typing import Protocol, Sequence


@dataclass(frozen=True)
class CommandResult:
    returncode: int
    stdout: str
    stderr: str

    @property
    def ok(self) -> bool:
        return self.returncode == 0


class Runner(Protocol):
    def __call__(
        self, cmd: Sequence[str], *, cwd: str, timeout: int = 3600
    ) -> CommandResult: ...


def real_runner(
    cmd: Sequence[str], *, cwd: str, timeout: int = 3600
) -> CommandResult:
    proc = subprocess.run(
        list(cmd),
        cwd=cwd,
        capture_output=True,
        text=True,
        timeout=timeout,
        check=False,
    )
    return CommandResult(proc.returncode, proc.stdout, proc.stderr)


@dataclass
class FakeRunner:
    """テスト用。キューから結果を返し、呼び出しを記録する。"""

    results: list[CommandResult] = field(default_factory=list)
    calls: list[tuple[list[str], str]] = field(default_factory=list)

    def __call__(
        self, cmd: Sequence[str], *, cwd: str, timeout: int = 3600
    ) -> CommandResult:
        self.calls.append((list(cmd), cwd))
        if self.results:
            return self.results.pop(0)
        return CommandResult(0, "", "")
