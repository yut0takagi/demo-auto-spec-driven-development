"""次の改善 issue を生成する。ループが枯れないようにする心臓部。"""

from __future__ import annotations

import json
import re
from dataclasses import dataclass

from orchestrator import prompts
from orchestrator.claude_cli import run_agent
from orchestrator.config import Config
from orchestrator.shell import Runner, real_runner

_FENCED = re.compile(r"```(?:json)?\s*(\[.*?\])\s*```", re.DOTALL)
_BARE = re.compile(r"(\[.*\])", re.DOTALL)


@dataclass(frozen=True)
class IssueProposal:
    title: str
    body: str


@dataclass(frozen=True)
class IdeationResult:
    proposals: list[IssueProposal]
    cost_usd: float


def parse_issue_proposals(text: str) -> list[IssueProposal]:
    for pattern in (_FENCED, _BARE):
        match = pattern.search(text)
        if not match:
            continue
        try:
            parsed = json.loads(match.group(1))
        except json.JSONDecodeError:
            continue
        if not isinstance(parsed, list):
            continue
        return [
            IssueProposal(title=str(item["title"]), body=str(item.get("body", "")))
            for item in parsed
            if isinstance(item, dict) and item.get("title")
        ]
    return []


def propose_next_issues(
    *,
    context: str,
    cfg: Config,
    cwd: str,
    runner: Runner = real_runner,
) -> IdeationResult:
    out = run_agent(
        prompts.render(
            "ideation", context=context, max_issues=cfg.ideation_max_issues
        ),
        model=cfg.ideation_model,
        cwd=cwd,
        runner=runner,
    )
    proposals = parse_issue_proposals(out.text)[: cfg.ideation_max_issues]
    return IdeationResult(proposals=proposals, cost_usd=out.cost_usd)
