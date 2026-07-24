"""ブックエンド分割の job 間で受け渡す baton。純 I/O（判断を持ち込まない）。"""

from __future__ import annotations

import json
from dataclasses import asdict, dataclass, field
from pathlib import Path


@dataclass
class Handoff:
    #: "ok"（実装対象あり） | "no-work"（ready なし。BUILD/GATE は skip）
    status: str
    issue_number: int | None = None
    issue_title: str = ""
    branch: str = ""
    trivial: bool = False
    plan: str = ""
    # --- build フェーズが埋める outcome ---
    verify_passed: bool = False
    e2e_passed: bool = False
    adversary_approved: bool = False
    adversary_summary: str = ""
    revise_cycles: int = 0
    builder_model_used: str = ""
    builder_cost_usd: float = 0.0
    adversary_cost_usd: float = 0.0
    planner_cost_usd: float = 0.0
    changed_lines: int = 0
    changed_files: list[str] = field(default_factory=list)
    committed: bool = False
    # --- plan フェーズの給油記録（gate の記録に引き回す） ---
    ideation_cost_usd: float = 0.0
    next_issues: list[int] = field(default_factory=list)


def write_handoff(path: Path, handoff: Handoff) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(
        json.dumps(asdict(handoff), ensure_ascii=False, indent=2), encoding="utf-8"
    )


def read_handoff(path: Path) -> Handoff:
    data = json.loads(Path(path).read_text(encoding="utf-8"))
    return Handoff(**data)
