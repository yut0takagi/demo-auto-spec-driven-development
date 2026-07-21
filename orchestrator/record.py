"""ダッシュボードが読む data/ への書き込み。"""

from __future__ import annotations

import json
from pathlib import Path

from orchestrator.models import LoopState, LoopStatus, RunRecord


def _runs_dir(data_dir: Path) -> Path:
    return Path(data_dir) / "runs"


def write_run_record(record: RunRecord, *, data_dir: Path) -> Path:
    runs = _runs_dir(data_dir)
    runs.mkdir(parents=True, exist_ok=True)
    path = runs / f"{record.iteration:04d}.json"
    path.write_text(record.to_json() + "\n", encoding="utf-8")
    return path


def load_runs(data_dir: Path) -> list[dict]:
    runs = _runs_dir(data_dir)
    if not runs.is_dir():
        return []
    records = [
        json.loads(p.read_text(encoding="utf-8"))
        for p in runs.glob("*.json")
    ]
    return sorted(records, key=lambda r: r.get("iteration", 0))


def next_iteration(data_dir: Path) -> int:
    runs = load_runs(data_dir)
    if not runs:
        return 1
    return max(r.get("iteration", 0) for r in runs) + 1


def write_status(
    data_dir: Path,
    *,
    state: LoopState,
    reason: str,
    actor: str,
    resume_hint: str,
    now: str,
) -> Path:
    Path(data_dir).mkdir(parents=True, exist_ok=True)
    status = LoopStatus(
        state=state, reason=reason, actor=actor,
        updated_at=now, resume_hint=resume_hint,
    )
    path = Path(data_dir) / "status.json"
    path.write_text(status.to_json() + "\n", encoding="utf-8")
    return path
