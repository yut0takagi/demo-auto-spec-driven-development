"""dashboard/src/lib/types.ts と 1:1 対応するデータモデル。JSON は camelCase。"""

from __future__ import annotations

import json
from dataclasses import dataclass, field
from typing import Literal

Verdict = Literal["merged", "needs-human", "paused", "dry-run", "failed"]
LoopState = Literal["RUNNING", "PAUSED", "HALTED"]


@dataclass(frozen=True)
class Issue:
    number: int
    title: str
    labels: list[str] = field(default_factory=list)

    def to_dict(self) -> dict:
        return {"number": self.number, "title": self.title, "labels": list(self.labels)}


@dataclass(frozen=True)
class AdversaryVerdict:
    approved: bool
    summary: str

    def to_dict(self) -> dict:
        return {"approved": self.approved, "summary": self.summary}


@dataclass(frozen=True)
class VerifyResult:
    """`npm run verify`（unit）と `npm run test:e2e` はゲート上も別条件なので分けて持つ。"""

    unit_passed: bool
    e2e_passed: bool
    coverage_pct: float = 0.0

    def to_dict(self) -> dict:
        return {
            "unitPassed": self.unit_passed,
            "e2ePassed": self.e2e_passed,
            "coveragePct": self.coverage_pct,
        }


@dataclass(frozen=True)
class CostBreakdown:
    builder_usd: float = 0.0
    adversary_usd: float = 0.0
    ideation_usd: float = 0.0

    @property
    def total_usd(self) -> float:
        return round(self.builder_usd + self.adversary_usd + self.ideation_usd, 6)

    def to_dict(self) -> dict:
        return {
            "builderUsd": self.builder_usd,
            "adversaryUsd": self.adversary_usd,
            "ideationUsd": self.ideation_usd,
            "totalUsd": self.total_usd,
        }


@dataclass(frozen=True)
class RunRecord:
    id: str
    iteration: int
    issue: Issue
    branch: str
    started_at: str
    finished_at: str
    duration_sec: int
    revise_cycles: int
    verdict: Verdict
    #: ゲートを通過しなかった理由。通過した場合は空リスト。
    gate_reasons: list[str]
    #: この反復が開いた PR 番号。PR 到達前に終了した場合は None
    pr_number: int | None
    adversary: AdversaryVerdict
    verify: VerifyResult
    changed_lines: int
    cost: CostBreakdown
    models: dict[str, str]
    next_issues: list[int] = field(default_factory=list)

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "iteration": self.iteration,
            "issue": self.issue.to_dict(),
            "branch": self.branch,
            "startedAt": self.started_at,
            "finishedAt": self.finished_at,
            "durationSec": self.duration_sec,
            "reviseCycles": self.revise_cycles,
            "verdict": self.verdict,
            "gateReasons": list(self.gate_reasons),
            "prNumber": self.pr_number,
            "adversary": self.adversary.to_dict(),
            "verify": self.verify.to_dict(),
            "changedLines": self.changed_lines,
            "cost": self.cost.to_dict(),
            "models": dict(self.models),
            "nextIssues": list(self.next_issues),
        }

    def to_json(self) -> str:
        return json.dumps(self.to_dict(), ensure_ascii=False, indent=2)


@dataclass(frozen=True)
class LoopStatus:
    state: LoopState
    reason: str
    actor: str
    updated_at: str
    resume_hint: str

    def to_dict(self) -> dict:
        return {
            "state": self.state,
            "reason": self.reason,
            "actor": self.actor,
            "updatedAt": self.updated_at,
            "resumeHint": self.resume_hint,
        }

    def to_json(self) -> str:
        return json.dumps(self.to_dict(), ensure_ascii=False, indent=2)
