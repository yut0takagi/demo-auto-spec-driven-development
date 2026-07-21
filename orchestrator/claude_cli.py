"""Claude Code CLI (`claude -p`) の呼び出しとコスト抽出。"""

from __future__ import annotations

import json
from dataclasses import dataclass

from orchestrator.shell import Runner, real_runner


class AgentError(RuntimeError):
    """エージェント実行が失敗した。"""


@dataclass(frozen=True)
class AgentResult:
    text: str
    cost_usd: float


def run_agent(
    prompt: str,
    *,
    model: str,
    cwd: str,
    runner: Runner = real_runner,
    timeout: int = 3600,
) -> AgentResult:
    cmd = [
        "claude",
        "-p",
        prompt,
        "--model",
        model,
        "--output-format",
        "json",
        "--permission-mode",
        "acceptEdits",
    ]
    result = runner(cmd, cwd=cwd, timeout=timeout)
    if not result.ok:
        raise AgentError(f"claude exited {result.returncode}: {result.stderr.strip()}")

    try:
        payload = json.loads(result.stdout)
    except json.JSONDecodeError as exc:
        raise AgentError(f"claude の出力を JSON として解釈できない: {exc}") from exc

    if payload.get("is_error"):
        raise AgentError(f"claude reported an error: {payload.get('result', '')}")

    return AgentResult(
        text=str(payload.get("result", "")),
        cost_usd=float(payload.get("total_cost_usd", 0.0)),
    )
