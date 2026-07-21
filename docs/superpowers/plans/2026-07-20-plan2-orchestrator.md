# Plan 2: Orchestrator — ループの脳

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 1 反復（issue 選定 → 敵対ラウンド → ゲート判定 → PR → マージ → 記録 → 次 issue 生成）をローカルで dry-run できる Python オーケストレータを、pytest で保証された状態で構築する。

**Architecture:** 副作用のある層（`gh` CLI / `claude` CLI / ファイル書き込み）はすべて注入可能な `runner` 経由にし、判断ロジック（ゲート・キルスイッチ・サーキットブレーカ）は純関数として切り出す。これにより外部プロセスなしで脳の正しさを pytest で検証できる。敵対ラウンドは `native` 経路を先に実装し、h5i 経路は Plan 3 で差し込む（`ORCHESTRATOR` env で切替）。

**Tech Stack:** Python 3.12+ / pytest / dataclasses / `gh` CLI / Claude Code CLI (`claude -p --output-format json`)

**関連 spec:** [2026-07-20-self-driving-loop-design.md](../specs/2026-07-20-self-driving-loop-design.md)
**前提:** Plan 1 完了（`dashboard/` に `npm run verify` が存在し緑）

---

## File Structure

| パス | 責務 |
|---|---|
| `orchestrator/config.py` | env から設定を読む。既定値の唯一の置き場所 |
| `orchestrator/models.py` | `RunRecord` / `LoopStatus` / `Issue` の dataclass。**Plan 1 の TS 型と 1:1 対応**（JSON は camelCase） |
| `orchestrator/gates.py` | 純関数: ゲート判定・保護パス判定・キルスイッチ読取・サーキットブレーカ |
| `orchestrator/shell.py` | サブプロセス実行の薄いラッパ。テストで差し替える注入点 |
| `orchestrator/claude_cli.py` | `claude -p` の呼び出しとコスト抽出 |
| `orchestrator/github_ops.py` | `gh` CLI ラッパ（issue/branch/PR/merge/label/comment） |
| `orchestrator/round.py` | 敵対ラウンド（native 経路）。builder→adversary→revise→verify |
| `orchestrator/ideation.py` | 次の改善 issue 生成 |
| `orchestrator/record.py` | `data/runs/*.json` と `data/status.json` の書き込み |
| `orchestrator/loop.py` | 外側ループ本体。3 つの停止チェックポイントを持つ |
| `tests/` | pytest。外部プロセスを一切起動しない |

**分離の理由:** `gates.py` は入出力を持たない純関数だけを置く。ここにファイル読みや subprocess を混ぜると「脳の正しさ」を安く検証できなくなる。キルスイッチのファイル読みは `loop.py` 側で行い、`gates.py` には読み取り済みの値を渡す。

---

## Task 1: プロジェクト初期化と設定層

**Files:**
- Create: `pyproject.toml`
- Create: `orchestrator/__init__.py`
- Create: `orchestrator/config.py`
- Test: `tests/__init__.py`, `tests/test_config.py`

- [ ] **Step 1: `pyproject.toml` を作成**

```toml
[project]
name = "orchestrator"
version = "0.1.0"
requires-python = ">=3.12"
dependencies = []

[project.optional-dependencies]
dev = ["pytest>=8.0", "pytest-cov>=5.0"]
h5i = ["h5i-orchestra"]

[tool.pytest.ini_options]
testpaths = ["tests"]
addopts = "-q"

[tool.setuptools.packages.find]
include = ["orchestrator*"]
```

- [ ] **Step 2: 空の `orchestrator/__init__.py` と `tests/__init__.py` を作成**

```bash
mkdir -p orchestrator tests
touch orchestrator/__init__.py tests/__init__.py
```

- [ ] **Step 3: 失敗するテストを書く**

`tests/test_config.py`:

```python
from orchestrator.config import Config


def test_defaults_match_spec():
    cfg = Config.from_env({})
    assert cfg.max_revise_cycles == 2
    assert cfg.max_changed_lines == 400
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
```

- [ ] **Step 4: テストを実行して失敗を確認**

Run: `pytest tests/test_config.py -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'orchestrator.config'`

- [ ] **Step 5: `orchestrator/config.py` を実装**

```python
"""ループの設定。既定値の唯一の置き場所。"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Mapping

_TRUTHY = {"1", "true", "yes", "on"}


def _flag(env: Mapping[str, str], key: str, default: bool = False) -> bool:
    raw = env.get(key)
    if raw is None:
        return default
    return raw.strip().lower() in _TRUTHY


@dataclass(frozen=True)
class Config:
    max_revise_cycles: int = 2
    max_changed_lines: int = 400
    circuit_breaker_fails: int = 3
    daily_cost_budget_usd: float = 5.0
    per_iter_cost_budget_usd: float = 0.5
    ideation_max_issues: int = 3
    builder_model: str = "claude-sonnet-5"
    adversary_model: str = "claude-haiku-4-5"
    ideation_model: str = "claude-haiku-4-5"
    #: "native" | "h5i"
    orchestrator: str = "native"
    dry_run: bool = False
    base_branch: str = "develop"
    ready_label: str = "loop:ready"
    needs_human_label: str = "loop:needs-human"
    paused_label: str = "loop:paused"

    @classmethod
    def from_env(cls, env: Mapping[str, str]) -> "Config":
        return cls(
            max_revise_cycles=int(env.get("MAX_REVISE_CYCLES", 2)),
            max_changed_lines=int(env.get("MAX_CHANGED_LINES", 400)),
            circuit_breaker_fails=int(env.get("CIRCUIT_BREAKER_FAILS", 3)),
            daily_cost_budget_usd=float(env.get("DAILY_COST_BUDGET_USD", 5.0)),
            per_iter_cost_budget_usd=float(env.get("PER_ITER_COST_BUDGET_USD", 0.5)),
            ideation_max_issues=int(env.get("IDEATION_MAX_ISSUES", 3)),
            builder_model=env.get("BUILDER_MODEL", "claude-sonnet-5"),
            adversary_model=env.get("ADVERSARY_MODEL", "claude-haiku-4-5"),
            ideation_model=env.get("IDEATION_MODEL", "claude-haiku-4-5"),
            orchestrator=env.get("ORCHESTRATOR", "native"),
            dry_run=_flag(env, "LOOP_DRY_RUN"),
            base_branch=env.get("BASE_BRANCH", "develop"),
        )
```

- [ ] **Step 6: テストを実行して合格を確認**

Run: `pytest tests/test_config.py -v`
Expected: PASS — 3 passed

- [ ] **Step 7: コミット**

```bash
git add pyproject.toml orchestrator tests
git commit -m "feat(orchestrator): add typed config layer with defaults from spec"
```

---

## Task 2: データモデル（Plan 1 の TS 契約と 1:1）

**Files:**
- Create: `orchestrator/models.py`
- Test: `tests/test_models.py`

`dashboard/src/lib/types.ts` の `RunRecord` とフィールド名が **完全一致**していること。JSON は camelCase。

- [ ] **Step 1: 失敗するテストを書く**

`tests/test_models.py`:

> **レビューでの修正（2026-07-20）:** 当初案は `VerifyResult.tests_passed` 一本、`Verdict` に `dry-run` なし、`gate_reasons`/`pr_number` なしだった。ダッシュボード側（Plan 1）の契約修正に合わせて、unit と e2e を別々に持ち、ゲート不通過の理由と PR 番号を記録できるようにする。

```python
import json
from dataclasses import replace

from orchestrator.models import AdversaryVerdict, CostBreakdown, Issue, LoopStatus, RunRecord, VerifyResult


def make_record() -> RunRecord:
    return RunRecord(
        id="20260720T120000Z-42",
        iteration=42,
        issue=Issue(number=42, title="add x", labels=["loop:ready"]),
        branch="loop/42-add-x",
        started_at="2026-07-20T12:00:00Z",
        finished_at="2026-07-20T12:06:00Z",
        duration_sec=360,
        revise_cycles=1,
        verdict="merged",
        gate_reasons=[],
        pr_number=42,
        adversary=AdversaryVerdict(approved=True, summary="ok"),
        verify=VerifyResult(unit_passed=True, e2e_passed=True, coverage_pct=87.5),
        changed_lines=120,
        cost=CostBreakdown(builder_usd=0.12, adversary_usd=0.02, ideation_usd=0.01),
        models={"builder": "claude-sonnet-5", "adversary": "claude-haiku-4-5", "ideation": "claude-haiku-4-5"},
        next_issues=[43, 44],
    )


def test_to_json_uses_camel_case_matching_typescript_contract():
    payload = json.loads(make_record().to_json())
    assert payload["durationSec"] == 360
    assert payload["reviseCycles"] == 1
    assert payload["changedLines"] == 120
    assert payload["startedAt"] == "2026-07-20T12:00:00Z"
    assert payload["finishedAt"] == "2026-07-20T12:06:00Z"
    assert payload["nextIssues"] == [43, 44]
    assert payload["issue"]["number"] == 42
    assert payload["adversary"]["approved"] is True
    assert payload["verify"]["coveragePct"] == 87.5
    assert payload["verify"]["unitPassed"] is True
    assert payload["verify"]["e2ePassed"] is True
    assert payload["gateReasons"] == []
    assert payload["prNumber"] == 42


def test_cost_total_is_derived_not_stored():
    payload = json.loads(make_record().to_json())
    assert payload["cost"]["builderUsd"] == 0.12
    assert payload["cost"]["totalUsd"] == 0.15


def test_pr_number_serialises_as_null_when_absent():
    record = replace(make_record(), pr_number=None, verdict="failed")
    payload = json.loads(record.to_json())
    assert payload["prNumber"] is None


def test_gate_reasons_round_trip_as_a_list():
    record = replace(
        make_record(),
        verdict="needs-human",
        gate_reasons=["adversary が approve していない", "e2e(Playwright) が失敗している"],
    )
    payload = json.loads(record.to_json())
    assert payload["gateReasons"] == [
        "adversary が approve していない",
        "e2e(Playwright) が失敗している",
    ]


def test_dry_run_is_a_valid_verdict():
    record = replace(make_record(), verdict="dry-run")
    payload = json.loads(record.to_json())
    assert payload["verdict"] == "dry-run"


def test_loop_status_serialises_camel_case():
    status = LoopStatus(
        state="HALTED",
        reason="breaker tripped",
        actor="breaker:consecutive-failures",
        updated_at="2026-07-20T12:00:00Z",
        resume_hint="gh variable set LOOP_ENABLED --body true",
    )
    payload = json.loads(status.to_json())
    assert payload["state"] == "HALTED"
    assert payload["updatedAt"] == "2026-07-20T12:00:00Z"
    assert payload["resumeHint"].startswith("gh variable set")
```

- [ ] **Step 2: テストを実行して失敗を確認**

Run: `pytest tests/test_models.py -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'orchestrator.models'`

- [ ] **Step 3: `orchestrator/models.py` を実装**

```python
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
```

- [ ] **Step 4: テストを実行して合格を確認**

Run: `pytest tests/test_models.py -v`
Expected: PASS — 6 passed（`gate_reasons`/`pr_number`/`dry-run` を追加検証する 3 件をレビューで追加したため、旧稿の「3 passed」から更新）

- [ ] **Step 5: コミット**

```bash
git add orchestrator/models.py tests/test_models.py
git commit -m "feat(orchestrator): add data models mirroring the TypeScript contract"
```

---

## Task 3: ゲート・キルスイッチ・ブレーカ（純関数、脳の中核）

**Files:**
- Create: `orchestrator/gates.py`
- Test: `tests/test_gates.py`

**これがループの安全性の中核。** 副作用を一切持たせない。

- [ ] **Step 1: 失敗するテストを書く**

`tests/test_gates.py`:

```python
from orchestrator.gates import (
    PROTECTED_PREFIXES,
    KillSwitch,
    evaluate_gate,
    protected_violations,
    read_kill_switch,
    should_trip_breaker,
    spent_today_usd,
)


class TestProtectedPaths:
    def test_dashboard_and_data_are_allowed(self):
        assert protected_violations(["dashboard/src/app/page.tsx", "data/runs/2.json"]) == []

    def test_workflows_and_orchestrator_are_blocked(self):
        violations = protected_violations(
            [".github/workflows/loop.yml", "orchestrator/loop.py", "dashboard/x.ts"]
        )
        assert violations == [".github/workflows/loop.yml", "orchestrator/loop.py"]

    def test_control_file_is_blocked(self):
        assert protected_violations([".loop/control.json"]) == [".loop/control.json"]

    def test_prefixes_are_documented(self):
        assert ".github/workflows/" in PROTECTED_PREFIXES
        assert "orchestrator/" in PROTECTED_PREFIXES


class TestEvaluateGate:
    def _kwargs(self, **overrides):
        base = dict(
            verify_passed=True,
            e2e_passed=True,
            adversary_approved=True,
            changed_lines=100,
            changed_files=["dashboard/src/app/page.tsx"],
            max_changed_lines=400,
        )
        base.update(overrides)
        return base

    def test_all_conditions_met_passes(self):
        result = evaluate_gate(**self._kwargs())
        assert result.passed is True
        assert result.reasons == ()

    def test_failing_verify_blocks(self):
        result = evaluate_gate(**self._kwargs(verify_passed=False))
        assert result.passed is False
        assert any("verify" in r for r in result.reasons)

    def test_failing_e2e_blocks(self):
        result = evaluate_gate(**self._kwargs(e2e_passed=False))
        assert result.passed is False
        assert any("e2e" in r for r in result.reasons)

    def test_adversary_rejection_blocks(self):
        result = evaluate_gate(**self._kwargs(adversary_approved=False))
        assert result.passed is False
        assert any("adversary" in r for r in result.reasons)

    def test_too_many_changed_lines_blocks(self):
        result = evaluate_gate(**self._kwargs(changed_lines=401))
        assert result.passed is False
        assert any("400" in r for r in result.reasons)

    def test_exactly_at_limit_passes(self):
        assert evaluate_gate(**self._kwargs(changed_lines=400)).passed is True

    def test_protected_path_blocks(self):
        result = evaluate_gate(**self._kwargs(changed_files=["orchestrator/gates.py"]))
        assert result.passed is False
        assert any("orchestrator/gates.py" in r for r in result.reasons)

    def test_all_failures_are_reported_together(self):
        result = evaluate_gate(
            **self._kwargs(
                verify_passed=False,
                adversary_approved=False,
                changed_lines=999,
                changed_files=["orchestrator/x.py"],
            )
        )
        assert result.passed is False
        assert len(result.reasons) == 4


class TestKillSwitch:
    def test_enabled_when_nothing_disables_it(self):
        ks = read_kill_switch(env={}, control={})
        assert ks.enabled is True

    def test_env_false_disables(self):
        ks = read_kill_switch(env={"LOOP_ENABLED": "false"}, control={})
        assert ks.enabled is False
        assert ks.actor == "human:env"

    def test_control_file_false_disables(self):
        ks = read_kill_switch(
            env={}, control={"enabled": False, "reason": "手動停止", "actor": "human:yut0takagi"}
        )
        assert ks.enabled is False
        assert ks.reason == "手動停止"
        assert ks.actor == "human:yut0takagi"

    def test_either_source_disabling_wins_fail_safe(self):
        ks = read_kill_switch(env={"LOOP_ENABLED": "true"}, control={"enabled": False})
        assert ks.enabled is False


class TestBreaker:
    def test_trips_after_k_consecutive_non_merges(self):
        assert should_trip_breaker(["failed", "failed", "failed"], k=3) is True

    def test_does_not_trip_when_a_merge_is_within_window(self):
        assert should_trip_breaker(["failed", "merged", "failed"], k=3) is False

    def test_uses_only_the_most_recent_k(self):
        # 古い成功は無視され、直近3件がすべて失敗なので発火する
        assert should_trip_breaker(["merged", "failed", "failed", "failed"], k=3) is True

    def test_does_not_trip_before_k_runs_exist(self):
        assert should_trip_breaker(["failed", "failed"], k=3) is False


class TestBudget:
    def test_sums_only_todays_runs(self):
        runs = [
            {"finishedAt": "2026-07-20T01:00:00Z", "cost": {"totalUsd": 0.2}},
            {"finishedAt": "2026-07-20T23:00:00Z", "cost": {"totalUsd": 0.3}},
            {"finishedAt": "2026-07-19T23:00:00Z", "cost": {"totalUsd": 9.0}},
        ]
        assert spent_today_usd(runs, today="2026-07-20") == 0.5

    def test_returns_zero_when_no_runs_today(self):
        assert spent_today_usd([], today="2026-07-20") == 0.0
```

- [ ] **Step 2: テストを実行して失敗を確認**

Run: `pytest tests/test_gates.py -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'orchestrator.gates'`

- [ ] **Step 3: `orchestrator/gates.py` を実装**

```python
"""ループの安全判断。すべて純関数 — I/O を持ち込まないこと。"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Iterable, Mapping, Sequence

#: ボットが変更してはならないパス接頭辞。
#: ループが自分の脳と安全装置を書き換えるのを防ぐ（spec §6）。
PROTECTED_PREFIXES: tuple[str, ...] = (
    ".github/workflows/",
    "orchestrator/",
    ".loop/",
    "tests/",
)

_TRUTHY = {"1", "true", "yes", "on"}


@dataclass(frozen=True)
class GateResult:
    passed: bool
    reasons: tuple[str, ...]


@dataclass(frozen=True)
class KillSwitch:
    enabled: bool
    reason: str
    actor: str


def protected_violations(changed_files: Iterable[str]) -> list[str]:
    """保護パスに触れているファイルを返す。空なら違反なし。"""
    return [f for f in changed_files if f.startswith(PROTECTED_PREFIXES)]


def evaluate_gate(
    *,
    verify_passed: bool,
    e2e_passed: bool,
    adversary_approved: bool,
    changed_lines: int,
    changed_files: Sequence[str],
    max_changed_lines: int,
) -> GateResult:
    """develop への自動マージ可否。失敗理由はすべて集めて返す。"""
    reasons: list[str] = []

    if not verify_passed:
        reasons.append("verify(lint/typecheck/unit/build) が失敗している")
    if not e2e_passed:
        reasons.append("e2e(Playwright) が失敗している")
    if not adversary_approved:
        reasons.append("adversary が approve していない")
    if changed_lines > max_changed_lines:
        reasons.append(
            f"変更行数 {changed_lines} が上限 {max_changed_lines} を超えている"
        )
    for path in protected_violations(changed_files):
        reasons.append(f"保護パスを変更している: {path}")

    return GateResult(passed=not reasons, reasons=tuple(reasons))


def read_kill_switch(
    *, env: Mapping[str, str], control: Mapping[str, Any]
) -> KillSwitch:
    """env と制御ファイルの両方を見る。どちらかが無効化していれば無効（fail-safe）。"""
    env_raw = env.get("LOOP_ENABLED")
    env_disabled = env_raw is not None and env_raw.strip().lower() not in _TRUTHY
    control_disabled = control.get("enabled") is False

    if control_disabled:
        return KillSwitch(
            enabled=False,
            reason=str(control.get("reason", "制御ファイルで無効化されている")),
            actor=str(control.get("actor", "human:control-file")),
        )
    if env_disabled:
        return KillSwitch(
            enabled=False,
            reason="LOOP_ENABLED が false に設定されている",
            actor="human:env",
        )
    return KillSwitch(enabled=True, reason="有効", actor="system")


def should_trip_breaker(recent_verdicts: Sequence[str], *, k: int) -> bool:
    """直近 k 件がすべて merged 以外ならブレーカを落とす。"""
    if len(recent_verdicts) < k:
        return False
    window = recent_verdicts[-k:]
    return all(v != "merged" for v in window)


def spent_today_usd(runs: Iterable[Mapping[str, Any]], *, today: str) -> float:
    """today (YYYY-MM-DD) に完了した run のコスト合計。"""
    total = 0.0
    for run in runs:
        finished = str(run.get("finishedAt", ""))
        if finished.startswith(today):
            total += float(run.get("cost", {}).get("totalUsd", 0.0))
    return round(total, 6)
```

- [ ] **Step 4: テストを実行して合格を確認**

Run: `pytest tests/test_gates.py -v`
Expected: PASS — 22 passed

- [ ] **Step 5: コミット**

```bash
git add orchestrator/gates.py tests/test_gates.py
git commit -m "feat(orchestrator): add pure safety layer (gates, kill switch, breaker, budget)"
```

---

## Task 4: シェル実行の注入点

**Files:**
- Create: `orchestrator/shell.py`
- Test: `tests/test_shell.py`

テストで差し替えるための唯一の subprocess 境界。

- [ ] **Step 1: 失敗するテストを書く**

`tests/test_shell.py`:

```python
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
```

- [ ] **Step 2: テストを実行して失敗を確認**

Run: `pytest tests/test_shell.py -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'orchestrator.shell'`

- [ ] **Step 3: `orchestrator/shell.py` を実装**

```python
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
```

- [ ] **Step 4: テストを実行して合格を確認**

Run: `pytest tests/test_shell.py -v`
Expected: PASS — 3 passed

- [ ] **Step 5: コミット**

```bash
git add orchestrator/shell.py tests/test_shell.py
git commit -m "feat(orchestrator): add injectable shell runner boundary"
```

---

## Task 5: Claude CLI ラッパ（コスト計測つき）

**Files:**
- Create: `orchestrator/claude_cli.py`
- Test: `tests/test_claude_cli.py`

`claude -p --output-format json` は `total_cost_usd` を含む JSON を返す。これがコスト計測の情報源。

- [ ] **Step 1: 失敗するテストを書く**

`tests/test_claude_cli.py`:

```python
import json

import pytest

from orchestrator.claude_cli import AgentError, AgentResult, run_agent
from orchestrator.shell import CommandResult, FakeRunner


def _payload(result_text: str, cost: float) -> str:
    return json.dumps({"result": result_text, "total_cost_usd": cost, "is_error": False})


def test_returns_text_and_cost():
    runner = FakeRunner([CommandResult(0, _payload("done", 0.042), "")])
    out = run_agent("do it", model="claude-sonnet-5", cwd="/repo", runner=runner)
    assert isinstance(out, AgentResult)
    assert out.text == "done"
    assert out.cost_usd == 0.042


def test_passes_model_and_print_flags():
    runner = FakeRunner([CommandResult(0, _payload("ok", 0.0), "")])
    run_agent("task", model="claude-haiku-4-5", cwd="/repo", runner=runner)
    cmd, cwd = runner.calls[0]
    assert cmd[0] == "claude"
    assert "-p" in cmd
    assert "--model" in cmd
    assert cmd[cmd.index("--model") + 1] == "claude-haiku-4-5"
    assert "--output-format" in cmd
    assert cmd[cmd.index("--output-format") + 1] == "json"
    assert cwd == "/repo"


def test_raises_on_nonzero_exit():
    runner = FakeRunner([CommandResult(1, "", "auth failed")])
    with pytest.raises(AgentError, match="auth failed"):
        run_agent("task", model="claude-sonnet-5", cwd="/repo", runner=runner)


def test_raises_on_unparseable_output():
    runner = FakeRunner([CommandResult(0, "not json", "")])
    with pytest.raises(AgentError, match="JSON"):
        run_agent("task", model="claude-sonnet-5", cwd="/repo", runner=runner)


def test_missing_cost_defaults_to_zero():
    runner = FakeRunner([CommandResult(0, json.dumps({"result": "x"}), "")])
    assert run_agent("t", model="m", cwd="/repo", runner=runner).cost_usd == 0.0
```

- [ ] **Step 2: テストを実行して失敗を確認**

Run: `pytest tests/test_claude_cli.py -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'orchestrator.claude_cli'`

- [ ] **Step 3: `orchestrator/claude_cli.py` を実装**

```python
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
```

- [ ] **Step 4: テストを実行して合格を確認**

Run: `pytest tests/test_claude_cli.py -v`
Expected: PASS — 5 passed

- [ ] **Step 5: コミット**

```bash
git add orchestrator/claude_cli.py tests/test_claude_cli.py
git commit -m "feat(orchestrator): add Claude CLI wrapper with cost extraction"
```

---

## Task 6: 敵対レビューの構造化パース

**Files:**
- Create: `orchestrator/review.py`
- Test: `tests/test_review.py`

adversary の自由文から approve 判定を安全に取り出す。**パースに失敗したら「棄却」に倒す**（fail-safe）。

- [ ] **Step 1: 失敗するテストを書く**

`tests/test_review.py`:

```python
from orchestrator.review import ADVERSARY_PROMPT_TEMPLATE, parse_adversary_review


def test_parses_fenced_json_verdict():
    text = """
    ざっと見た。
    ```json
    {"approved": false, "summary": "境界値のテストが無い", "blocking_issues": ["n=0 が未検証"]}
    ```
    """
    verdict = parse_adversary_review(text)
    assert verdict.approved is False
    assert "境界値" in verdict.summary


def test_parses_bare_json():
    verdict = parse_adversary_review('{"approved": true, "summary": "問題なし"}')
    assert verdict.approved is True
    assert verdict.summary == "問題なし"


def test_unparseable_output_is_treated_as_rejection():
    verdict = parse_adversary_review("よさそうです！")
    assert verdict.approved is False
    assert "解釈できない" in verdict.summary


def test_missing_approved_key_is_treated_as_rejection():
    verdict = parse_adversary_review('{"summary": "曖昧"}')
    assert verdict.approved is False


def test_non_boolean_approved_is_treated_as_rejection():
    verdict = parse_adversary_review('{"approved": "yes", "summary": "s"}')
    assert verdict.approved is False


def test_prompt_template_demands_hostility_and_json():
    assert "棄却" in ADVERSARY_PROMPT_TEMPLATE
    assert "approved" in ADVERSARY_PROMPT_TEMPLATE
    assert "{task}" in ADVERSARY_PROMPT_TEMPLATE
    assert "{diff}" in ADVERSARY_PROMPT_TEMPLATE
```

- [ ] **Step 2: テストを実行して失敗を確認**

Run: `pytest tests/test_review.py -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'orchestrator.review'`

- [ ] **Step 3: `orchestrator/review.py` を実装**

```python
"""adversary の出力を構造化して取り出す。曖昧なら棄却に倒す。"""

from __future__ import annotations

import json
import re

from orchestrator.models import AdversaryVerdict

ADVERSARY_PROMPT_TEMPLATE = """\
あなたは敵対的コードレビュアーです。目的は **この変更を棄却する正当な理由を見つけること** です。
安易に承認してはいけません。承認してよいのは、真剣に穴を探した上で本当に問題が無いときだけです。

特に次を疑ってください:
- テストが実装を実質的に検証しておらず、通ることだけを目的にしていないか
- 境界値・空・異常系が未検証のまま残っていないか
- 要件を満たしたように見えて、実際には別のことをしていないか
- 既存の挙動を壊していないか

## 元のタスク
{task}

## 変更内容(diff)
{diff}

最後に、必ず次の JSON だけをコードフェンスで囲って出力してください:
```json
{{"approved": <true|false>, "summary": "<判断理由を1〜3文>", "blocking_issues": ["<具体的な指摘>"]}}
```
"""

_FENCED = re.compile(r"```(?:json)?\s*(\{.*?\})\s*```", re.DOTALL)
_BARE = re.compile(r"(\{.*\})", re.DOTALL)

_REJECT_UNPARSEABLE = "adversary の出力を解釈できないため棄却として扱う"


def parse_adversary_review(text: str) -> AdversaryVerdict:
    payload = _extract_json(text)
    if payload is None:
        return AdversaryVerdict(approved=False, summary=_REJECT_UNPARSEABLE)

    approved = payload.get("approved")
    if not isinstance(approved, bool):
        return AdversaryVerdict(
            approved=False,
            summary=f"approved が真偽値でないため棄却: {payload.get('summary', '')}".strip(),
        )

    summary = str(payload.get("summary", "")).strip()
    blocking = payload.get("blocking_issues") or []
    if isinstance(blocking, list) and blocking:
        summary = f"{summary} / 指摘: " + "; ".join(str(b) for b in blocking)

    return AdversaryVerdict(approved=approved, summary=summary)


def _extract_json(text: str) -> dict | None:
    for pattern in (_FENCED, _BARE):
        match = pattern.search(text)
        if not match:
            continue
        try:
            parsed = json.loads(match.group(1))
        except json.JSONDecodeError:
            continue
        if isinstance(parsed, dict):
            return parsed
    return None
```

- [ ] **Step 4: テストを実行して合格を確認**

Run: `pytest tests/test_review.py -v`
Expected: PASS — 6 passed

- [ ] **Step 5: コミット**

```bash
git add orchestrator/review.py tests/test_review.py
git commit -m "feat(orchestrator): parse adversary verdict, failing closed on ambiguity"
```

---

## Task 7: GitHub 操作ラッパ

**Files:**
- Create: `orchestrator/github_ops.py`
- Test: `tests/test_github_ops.py`

- [ ] **Step 1: 失敗するテストを書く**

`tests/test_github_ops.py`:

```python
import json

from orchestrator.github_ops import GitHubOps
from orchestrator.shell import CommandResult, FakeRunner


def ops(results):
    runner = FakeRunner(results)
    return GitHubOps(cwd="/repo", runner=runner), runner


class TestListReadyIssues:
    def test_parses_issue_list(self):
        payload = json.dumps(
            [
                {"number": 7, "title": "add chart", "labels": [{"name": "loop:ready"}]},
                {"number": 9, "title": "fix flake", "labels": [{"name": "loop:ready"}]},
            ]
        )
        gh, _ = ops([CommandResult(0, payload, "")])
        issues = gh.list_ready_issues("loop:ready")
        assert [i.number for i in issues] == [7, 9]
        assert issues[0].labels == ["loop:ready"]

    def test_empty_list_returns_empty(self):
        gh, _ = ops([CommandResult(0, "[]", "")])
        assert gh.list_ready_issues("loop:ready") == []


class TestChangedFiles:
    def test_parses_name_only_diff(self):
        gh, _ = ops([CommandResult(0, "dashboard/a.ts\ndashboard/b.ts\n", "")])
        assert gh.changed_files("develop") == ["dashboard/a.ts", "dashboard/b.ts"]

    def test_ignores_blank_lines(self):
        gh, _ = ops([CommandResult(0, "a.ts\n\n\n", "")])
        assert gh.changed_files("develop") == ["a.ts"]


class TestChangedLines:
    def test_sums_added_and_deleted(self):
        gh, _ = ops([CommandResult(0, "10\t5\ta.ts\n3\t2\tb.ts\n", "")])
        assert gh.changed_lines("develop") == 20

    def test_treats_binary_dashes_as_zero(self):
        gh, _ = ops([CommandResult(0, "-\t-\timage.png\n4\t1\ta.ts\n", "")])
        assert gh.changed_lines("develop") == 5


class TestMutations:
    def test_open_pr_returns_number_from_url(self):
        gh, runner = ops([CommandResult(0, "https://github.com/o/r/pull/123\n", "")])
        assert gh.open_pr(title="t", body="b", base="develop", head="loop/1-x") == 123
        assert runner.calls[0][0][:3] == ["gh", "pr", "create"]

    def test_merge_pr_uses_squash_and_deletes_branch(self):
        gh, runner = ops([CommandResult(0, "", "")])
        gh.merge_pr(123)
        cmd = runner.calls[0][0]
        assert cmd[:3] == ["gh", "pr", "merge"]
        assert "--squash" in cmd
        assert "--delete-branch" in cmd

    def test_add_label(self):
        gh, runner = ops([CommandResult(0, "", "")])
        gh.add_label(123, "loop:needs-human")
        assert "loop:needs-human" in runner.calls[0][0]

    def test_create_issue_returns_number(self):
        gh, _ = ops([CommandResult(0, "https://github.com/o/r/issues/45\n", "")])
        assert gh.create_issue(title="t", body="b", labels=["loop:ready"]) == 45
```

- [ ] **Step 2: テストを実行して失敗を確認**

Run: `pytest tests/test_github_ops.py -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'orchestrator.github_ops'`

- [ ] **Step 3: `orchestrator/github_ops.py` を実装**

```python
"""gh / git CLI のラッパ。すべて runner 経由なのでテストで差し替えられる。"""

from __future__ import annotations

import json
import re
from dataclasses import dataclass

from orchestrator.models import Issue
from orchestrator.shell import CommandResult, Runner, real_runner

_TRAILING_NUMBER = re.compile(r"/(\d+)\s*$")


class GitHubError(RuntimeError):
    """gh / git コマンドが失敗した。"""


@dataclass
class GitHubOps:
    cwd: str
    runner: Runner = real_runner

    def _run(self, cmd: list[str]) -> CommandResult:
        result = self.runner(cmd, cwd=self.cwd)
        if not result.ok:
            raise GitHubError(f"{' '.join(cmd)} failed: {result.stderr.strip()}")
        return result

    # --- 読み取り ---

    def list_ready_issues(self, label: str) -> list[Issue]:
        result = self._run(
            [
                "gh", "issue", "list",
                "--label", label,
                "--state", "open",
                "--json", "number,title,labels",
                "--limit", "50",
            ]
        )
        return [
            Issue(
                number=item["number"],
                title=item["title"],
                labels=[lb["name"] for lb in item.get("labels", [])],
            )
            for item in json.loads(result.stdout or "[]")
        ]

    def changed_files(self, base: str) -> list[str]:
        result = self._run(["git", "diff", "--name-only", f"{base}...HEAD"])
        return [line for line in result.stdout.splitlines() if line.strip()]

    def changed_lines(self, base: str) -> int:
        result = self._run(["git", "diff", "--numstat", f"{base}...HEAD"])
        total = 0
        for line in result.stdout.splitlines():
            parts = line.split("\t")
            if len(parts) < 3:
                continue
            added, deleted = parts[0], parts[1]
            total += (0 if added == "-" else int(added))
            total += (0 if deleted == "-" else int(deleted))
        return total

    def diff(self, base: str, max_chars: int = 60_000) -> str:
        result = self._run(["git", "diff", f"{base}...HEAD"])
        return result.stdout[:max_chars]

    # --- 変更 ---

    def create_branch(self, name: str, base: str) -> None:
        self._run(["git", "checkout", "-b", name, base])

    def push_branch(self, name: str) -> None:
        self._run(["git", "push", "-u", "origin", name])

    def open_pr(self, *, title: str, body: str, base: str, head: str) -> int:
        result = self._run(
            ["gh", "pr", "create", "--title", title, "--body", body,
             "--base", base, "--head", head]
        )
        return _number_from_url(result.stdout)

    def comment_pr(self, number: int, body: str) -> None:
        self._run(["gh", "pr", "comment", str(number), "--body", body])

    def merge_pr(self, number: int) -> None:
        self._run(["gh", "pr", "merge", str(number), "--squash", "--delete-branch"])

    def add_label(self, number: int, label: str) -> None:
        self._run(["gh", "issue", "edit", str(number), "--add-label", label])

    def create_issue(self, *, title: str, body: str, labels: list[str]) -> int:
        cmd = ["gh", "issue", "create", "--title", title, "--body", body]
        for label in labels:
            cmd += ["--label", label]
        return _number_from_url(self._run(cmd).stdout)


def _number_from_url(stdout: str) -> int:
    match = _TRAILING_NUMBER.search(stdout.strip())
    if not match:
        raise GitHubError(f"URL から番号を取り出せない: {stdout!r}")
    return int(match.group(1))
```

- [ ] **Step 4: テストを実行して合格を確認**

Run: `pytest tests/test_github_ops.py -v`
Expected: PASS — 10 passed

- [ ] **Step 5: コミット**

```bash
git add orchestrator/github_ops.py tests/test_github_ops.py
git commit -m "feat(orchestrator): add gh/git operations wrapper"
```

---

## Task 8: 敵対ラウンド（native 経路）

**Files:**
- Create: `orchestrator/round.py`
- Test: `tests/test_round.py`

builder が実装 → adversary が敵対レビュー → 棄却なら revise → verify。

> **レビュー確認（2026-07-20）:** `RoundOutcome` は元々 `verify_passed` と `e2e_passed` を別フィールドとして持っており、Task 2 の契約修正（`VerifyResult` の unit/e2e 分離）に対して本タスクの変更は不要。以下のコードは変更なし。

- [ ] **Step 1: 失敗するテストを書く**

`tests/test_round.py`:

```python
import json

from orchestrator.config import Config
from orchestrator.round import RoundOutcome, run_native_round
from orchestrator.shell import CommandResult, FakeRunner


def agent_out(text: str, cost: float = 0.01) -> CommandResult:
    return CommandResult(0, json.dumps({"result": text, "total_cost_usd": cost}), "")


APPROVE = '```json\n{"approved": true, "summary": "ok"}\n```'
REJECT = '```json\n{"approved": false, "summary": "テストが薄い"}\n```'


def test_approved_on_first_review_runs_no_revise():
    runner = FakeRunner([
        agent_out("implemented", 0.10),   # builder.work
        agent_out(APPROVE, 0.01),         # adversary.review
        CommandResult(0, "", ""),         # npm run verify
        CommandResult(0, "", ""),         # npm run test:e2e
    ])
    outcome = run_native_round(
        task="add x", diff_provider=lambda: "diff", cwd="/repo",
        cfg=Config.from_env({}), runner=runner,
    )
    assert isinstance(outcome, RoundOutcome)
    assert outcome.adversary.approved is True
    assert outcome.revise_cycles == 0
    assert outcome.verify_passed is True
    assert outcome.e2e_passed is True
    assert outcome.builder_cost_usd == 0.10
    assert outcome.adversary_cost_usd == 0.01


def test_rejection_triggers_revise_then_re_review():
    runner = FakeRunner([
        agent_out("v1", 0.10),      # work
        agent_out(REJECT, 0.01),    # review 1 -> reject
        agent_out("v2", 0.08),      # revise
        agent_out(APPROVE, 0.01),   # review 2 -> approve
        CommandResult(0, "", ""),   # verify
        CommandResult(0, "", ""),   # e2e
    ])
    outcome = run_native_round(
        task="add x", diff_provider=lambda: "diff", cwd="/repo",
        cfg=Config.from_env({}), runner=runner,
    )
    assert outcome.revise_cycles == 1
    assert outcome.adversary.approved is True
    assert outcome.builder_cost_usd == 0.18


def test_stops_after_max_revise_cycles_still_rejected():
    runner = FakeRunner([
        agent_out("v1"), agent_out(REJECT),
        agent_out("v2"), agent_out(REJECT),
        agent_out("v3"), agent_out(REJECT),
        CommandResult(0, "", ""),  # verify
        CommandResult(0, "", ""),  # e2e
    ])
    outcome = run_native_round(
        task="t", diff_provider=lambda: "d", cwd="/repo",
        cfg=Config.from_env({"MAX_REVISE_CYCLES": "2"}), runner=runner,
    )
    assert outcome.revise_cycles == 2
    assert outcome.adversary.approved is False


def test_failing_verify_is_reported():
    runner = FakeRunner([
        agent_out("v1"), agent_out(APPROVE),
        CommandResult(1, "", "tsc error"),  # verify fails
        CommandResult(0, "", ""),           # e2e
    ])
    outcome = run_native_round(
        task="t", diff_provider=lambda: "d", cwd="/repo",
        cfg=Config.from_env({}), runner=runner,
    )
    assert outcome.verify_passed is False


def test_builder_prompt_contains_the_task():
    runner = FakeRunner([
        agent_out("v1"), agent_out(APPROVE),
        CommandResult(0, "", ""), CommandResult(0, "", ""),
    ])
    run_native_round(
        task="カバレッジを上げる", diff_provider=lambda: "d", cwd="/repo",
        cfg=Config.from_env({}), runner=runner,
    )
    builder_cmd = runner.calls[0][0]
    assert "カバレッジを上げる" in builder_cmd[2]


def test_uses_configured_models_for_each_role():
    runner = FakeRunner([
        agent_out("v1"), agent_out(APPROVE),
        CommandResult(0, "", ""), CommandResult(0, "", ""),
    ])
    run_native_round(
        task="t", diff_provider=lambda: "d", cwd="/repo",
        cfg=Config.from_env({}), runner=runner,
    )
    builder_cmd, adversary_cmd = runner.calls[0][0], runner.calls[1][0]
    assert builder_cmd[builder_cmd.index("--model") + 1] == "claude-sonnet-5"
    assert adversary_cmd[adversary_cmd.index("--model") + 1] == "claude-haiku-4-5"
```

- [ ] **Step 2: テストを実行して失敗を確認**

Run: `pytest tests/test_round.py -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'orchestrator.round'`

- [ ] **Step 3: `orchestrator/round.py` を実装**

```python
"""敵対ラウンド。native 経路（h5i 経路は Plan 3 で追加）。"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Callable

from orchestrator.claude_cli import run_agent
from orchestrator.config import Config
from orchestrator.models import AdversaryVerdict
from orchestrator.review import ADVERSARY_PROMPT_TEMPLATE, parse_adversary_review
from orchestrator.shell import Runner, real_runner

BUILDER_PROMPT_TEMPLATE = """\
あなたは実装担当です。次のタスクをこのリポジトリに実装してください。

## タスク
{task}

## 必ず守ること
- 変更は `dashboard/` と `data/` の中だけに限る。`.github/`, `orchestrator/`, `tests/` は絶対に変更しない
- 実装だけでなく、その振る舞いを**実質的に検証する**テストを書く（通すためだけのテストは禁止）
- `cd dashboard && npm run verify` が緑になること
- 変更は最小限に保つ（400 行以内）
"""

REVISE_PROMPT_TEMPLATE = """\
あなたの実装は敵対的レビューで棄却されました。指摘に対応して修正してください。

## 元のタスク
{task}

## レビューでの指摘
{review}

## 必ず守ること
- 指摘された点に実際に対応する（見せかけの修正は禁止）
- `cd dashboard && npm run verify` が緑になること
- `.github/`, `orchestrator/`, `tests/` は変更しない
"""


@dataclass(frozen=True)
class RoundOutcome:
    adversary: AdversaryVerdict
    revise_cycles: int
    verify_passed: bool
    e2e_passed: bool
    builder_cost_usd: float
    adversary_cost_usd: float


def run_native_round(
    *,
    task: str,
    diff_provider: Callable[[], str],
    cwd: str,
    cfg: Config,
    runner: Runner = real_runner,
) -> RoundOutcome:
    builder_cost = 0.0
    adversary_cost = 0.0

    work = run_agent(
        BUILDER_PROMPT_TEMPLATE.format(task=task),
        model=cfg.builder_model, cwd=cwd, runner=runner,
    )
    builder_cost += work.cost_usd

    review_out = run_agent(
        ADVERSARY_PROMPT_TEMPLATE.format(task=task, diff=diff_provider()),
        model=cfg.adversary_model, cwd=cwd, runner=runner,
    )
    adversary_cost += review_out.cost_usd
    verdict = parse_adversary_review(review_out.text)

    cycles = 0
    while not verdict.approved and cycles < cfg.max_revise_cycles:
        cycles += 1
        revise = run_agent(
            REVISE_PROMPT_TEMPLATE.format(task=task, review=verdict.summary),
            model=cfg.builder_model, cwd=cwd, runner=runner,
        )
        builder_cost += revise.cost_usd

        review_out = run_agent(
            ADVERSARY_PROMPT_TEMPLATE.format(task=task, diff=diff_provider()),
            model=cfg.adversary_model, cwd=cwd, runner=runner,
        )
        adversary_cost += review_out.cost_usd
        verdict = parse_adversary_review(review_out.text)

    verify_passed = runner(["npm", "run", "verify"], cwd=f"{cwd}/dashboard").ok
    e2e_passed = runner(["npm", "run", "test:e2e"], cwd=f"{cwd}/dashboard").ok

    return RoundOutcome(
        adversary=verdict,
        revise_cycles=cycles,
        verify_passed=verify_passed,
        e2e_passed=e2e_passed,
        builder_cost_usd=round(builder_cost, 6),
        adversary_cost_usd=round(adversary_cost, 6),
    )
```

- [ ] **Step 4: テストを実行して合格を確認**

Run: `pytest tests/test_round.py -v`
Expected: PASS — 6 passed

- [ ] **Step 5: コミット**

```bash
git add orchestrator/round.py tests/test_round.py
git commit -m "feat(orchestrator): implement native adversarial round with revise loop"
```

---

## Task 9: 記録の書き込み

**Files:**
- Create: `orchestrator/record.py`
- Test: `tests/test_record.py`

- [ ] **Step 1: 失敗するテストを書く**

`tests/test_record.py`:

```python
import json

from orchestrator.models import (
    AdversaryVerdict, CostBreakdown, Issue, RunRecord, VerifyResult,
)
from orchestrator.record import load_runs, next_iteration, write_run_record, write_status


def make_record(iteration: int) -> RunRecord:
    return RunRecord(
        id=f"20260720T000000Z-{iteration}",
        iteration=iteration,
        issue=Issue(number=iteration, title="t", labels=[]),
        branch=f"loop/{iteration}-x",
        started_at="2026-07-20T00:00:00Z",
        finished_at="2026-07-20T00:05:00Z",
        duration_sec=300,
        revise_cycles=0,
        verdict="merged",
        gate_reasons=[],
        pr_number=11,
        adversary=AdversaryVerdict(approved=True, summary=""),
        verify=VerifyResult(unit_passed=True, e2e_passed=True, coverage_pct=80.0),
        changed_lines=10,
        cost=CostBreakdown(builder_usd=0.1),
        models={"builder": "b", "adversary": "a", "ideation": "i"},
    )


def test_write_run_record_creates_zero_padded_file(tmp_path):
    path = write_run_record(make_record(7), data_dir=tmp_path)
    assert path.name == "0007.json"
    assert json.loads(path.read_text())["iteration"] == 7


def test_write_run_record_creates_directory_when_missing(tmp_path):
    target = tmp_path / "nested"
    write_run_record(make_record(1), data_dir=target)
    assert (target / "runs" / "0001.json").exists()


def test_load_runs_returns_sorted_dicts(tmp_path):
    write_run_record(make_record(3), data_dir=tmp_path)
    write_run_record(make_record(1), data_dir=tmp_path)
    runs = load_runs(tmp_path)
    assert [r["iteration"] for r in runs] == [1, 3]


def test_load_runs_on_missing_dir_is_empty(tmp_path):
    assert load_runs(tmp_path / "nope") == []


def test_next_iteration_starts_at_one(tmp_path):
    assert next_iteration(tmp_path) == 1


def test_next_iteration_is_max_plus_one(tmp_path):
    write_run_record(make_record(4), data_dir=tmp_path)
    write_run_record(make_record(2), data_dir=tmp_path)
    assert next_iteration(tmp_path) == 5


def test_write_status_round_trips(tmp_path):
    write_status(
        tmp_path, state="HALTED", reason="breaker", actor="breaker:x",
        resume_hint="gh variable set LOOP_ENABLED --body true",
        now="2026-07-20T12:00:00Z",
    )
    payload = json.loads((tmp_path / "status.json").read_text())
    assert payload["state"] == "HALTED"
    assert payload["actor"] == "breaker:x"
    assert payload["updatedAt"] == "2026-07-20T12:00:00Z"
```

- [ ] **Step 2: テストを実行して失敗を確認**

Run: `pytest tests/test_record.py -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'orchestrator.record'`

- [ ] **Step 3: `orchestrator/record.py` を実装**

```python
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
```

- [ ] **Step 4: テストを実行して合格を確認**

Run: `pytest tests/test_record.py -v`
Expected: PASS — 7 passed

- [ ] **Step 5: コミット**

```bash
git add orchestrator/record.py tests/test_record.py
git commit -m "feat(orchestrator): persist run records and loop status for the dashboard"
```

---

## Task 10: 次の改善 issue 生成（ループの永続化）

**Files:**
- Create: `orchestrator/ideation.py`
- Test: `tests/test_ideation.py`

- [ ] **Step 1: 失敗するテストを書く**

`tests/test_ideation.py`:

```python
import json

from orchestrator.config import Config
from orchestrator.ideation import parse_issue_proposals, propose_next_issues
from orchestrator.shell import CommandResult, FakeRunner


def agent_out(text: str, cost: float = 0.01) -> CommandResult:
    return CommandResult(0, json.dumps({"result": text, "total_cost_usd": cost}), "")


def test_parses_proposal_list():
    text = """```json
    [{"title": "カバレッジを90%に", "body": "lib/ の分岐が未検証"},
     {"title": "コスト推移に移動平均", "body": "ノイズが多い"}]
    ```"""
    proposals = parse_issue_proposals(text)
    assert [p.title for p in proposals] == ["カバレッジを90%に", "コスト推移に移動平均"]


def test_unparseable_output_yields_no_proposals():
    assert parse_issue_proposals("いい案が思いつきません") == []


def test_entries_missing_title_are_skipped():
    proposals = parse_issue_proposals('[{"body": "no title"}, {"title": "ok", "body": "b"}]')
    assert [p.title for p in proposals] == ["ok"]


def test_propose_respects_max_issues():
    text = json.dumps([{"title": f"t{i}", "body": "b"} for i in range(10)])
    runner = FakeRunner([agent_out(text)])
    result = propose_next_issues(
        context="ctx", cfg=Config.from_env({"IDEATION_MAX_ISSUES": "2"}),
        cwd="/repo", runner=runner,
    )
    assert len(result.proposals) == 2
    assert result.cost_usd == 0.01


def test_propose_uses_ideation_model():
    runner = FakeRunner([agent_out("[]")])
    propose_next_issues(context="c", cfg=Config.from_env({}), cwd="/repo", runner=runner)
    cmd = runner.calls[0][0]
    assert cmd[cmd.index("--model") + 1] == "claude-haiku-4-5"
```

- [ ] **Step 2: テストを実行して失敗を確認**

Run: `pytest tests/test_ideation.py -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'orchestrator.ideation'`

- [ ] **Step 3: `orchestrator/ideation.py` を実装**

```python
"""次の改善 issue を生成する。ループが枯れないようにする心臓部。"""

from __future__ import annotations

import json
import re
from dataclasses import dataclass

from orchestrator.claude_cli import run_agent
from orchestrator.config import Config
from orchestrator.shell import Runner, real_runner

IDEATION_PROMPT_TEMPLATE = """\
あなたはこのリポジトリのプロダクトオーナーです。
「ループ自身の稼働を可視化する自己観測ダッシュボード」を改善する次の作業を提案してください。

## 現在の状況
{context}

## 提案の条件
- 1 件あたり 400 行以内の変更で完了できる粒度にする
- `dashboard/` 配下だけで完結する（CI やオーケストレータは対象外）
- 「テストで正しさを機械判定できる」ものを優先する
- 既存機能の焼き直しではなく、観測性を実際に高めるものにする

最大 {max_issues} 件、次の JSON 配列だけをコードフェンスで囲って出力してください:
```json
[{{"title": "<簡潔な題名>", "body": "<背景と受け入れ条件>"}}]
```
"""

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
        IDEATION_PROMPT_TEMPLATE.format(
            context=context, max_issues=cfg.ideation_max_issues
        ),
        model=cfg.ideation_model,
        cwd=cwd,
        runner=runner,
    )
    proposals = parse_issue_proposals(out.text)[: cfg.ideation_max_issues]
    return IdeationResult(proposals=proposals, cost_usd=out.cost_usd)
```

- [ ] **Step 4: テストを実行して合格を確認**

Run: `pytest tests/test_ideation.py -v`
Expected: PASS — 5 passed

- [ ] **Step 5: コミット**

```bash
git add orchestrator/ideation.py tests/test_ideation.py
git commit -m "feat(orchestrator): generate follow-up improvement issues"
```

---

## Task 11: 外側ループ本体（3 つの停止チェックポイント）

**Files:**
- Create: `orchestrator/loop.py`
- Test: `tests/test_loop.py`

**spec §7 の停止機構の中核。** 停止時に不可逆な操作が走らないことをテストで保証する。

> **レビューでの修正（2026-07-20）:** 以下 4 点を修正する。
> 1. `_record()` が `tests_passed=verify_passed and e2e_passed` として畳んでおり、どちらが失敗したか記録から失われていた → `unit_passed`/`e2e_passed` を分離して渡す。
> 2. `_record()` が `gate_reasons`/`pr_number` を受け取っておらず契約を満たせなかった → 両方を受け取り記録する。
> 3. **チェックポイント3（マージ直前の一時停止）が記録を一切書かずに return していた** — builder+adversary の 1 ラウンド分の実費用が発生したのに痕跡が残らないバグ。ここで `verdict="paused"` の記録を書いてから return するよう修正する。あわせて dry-run パスは `verdict="paused"` ではなく `verdict="dry-run"` を記録するよう修正する（「人間が止めた」と「最初からマージしない設定だった」は別事象）。
> 4. `duration_sec` が `0` 固定（`started_at == finished_at == now`）だった → `clock: Callable[[], str]` を注入し、反復開始時と各終了パスでそれぞれ実際の時刻を読んで差分を計算する。

- [ ] **Step 1: 失敗するテストを書く**

`tests/test_loop.py`:

```python
import json
from pathlib import Path

import pytest

from orchestrator.config import Config
from orchestrator.loop import IterationResult, run_iteration
from orchestrator.models import AdversaryVerdict, Issue
from orchestrator.round import RoundOutcome


class FakeGh:
    """GitHubOps の代役。呼ばれた操作を記録する。"""

    def __init__(self, issues=None, changed_files=None, changed_lines=100):
        self._issues = issues if issues is not None else [
            Issue(number=42, title="add chart", labels=["loop:ready"])
        ]
        self._changed_files = changed_files or ["dashboard/src/app/page.tsx"]
        self._changed_lines = changed_lines
        self.actions: list[str] = []
        self.created_issues: list[str] = []

    def list_ready_issues(self, label): return list(self._issues)
    def changed_files(self, base): return list(self._changed_files)
    def changed_lines(self, base): return self._changed_lines
    def diff(self, base, max_chars=60_000): return "diff"
    def create_branch(self, name, base): self.actions.append(f"branch:{name}")
    def push_branch(self, name): self.actions.append(f"push:{name}")
    def open_pr(self, *, title, body, base, head):
        self.actions.append("open_pr")
        return 123
    def comment_pr(self, number, body): self.actions.append(f"comment:{number}")
    def merge_pr(self, number): self.actions.append(f"merge:{number}")
    def add_label(self, number, label): self.actions.append(f"label:{label}")
    def create_issue(self, *, title, body, labels):
        self.created_issues.append(title)
        return 900 + len(self.created_issues)


def approved_round(**overrides) -> RoundOutcome:
    base = dict(
        adversary=AdversaryVerdict(approved=True, summary="ok"),
        revise_cycles=0, verify_passed=True, e2e_passed=True,
        builder_cost_usd=0.1, adversary_cost_usd=0.01,
    )
    base.update(overrides)
    return RoundOutcome(**base)


def make_clock(*timestamps: str):
    """固定シーケンスを返す `clock`。尽きたら最後の値を返し続ける（duration_sec を決定的にする）。"""
    values = list(timestamps) or ["2026-07-20T12:00:00Z", "2026-07-20T12:05:00Z"]

    def _clock() -> str:
        if len(values) > 1:
            return values.pop(0)
        return values[0]

    return _clock


def run(tmp_path, *, gh, disable_on_call=None, round_outcome=None, cfg=None,
        proposals=("next idea",), clock=None):
    """1 反復を実行するヘルパ。

    kill_switch_reader は 3 回呼ばれる:
      1 回目 = 反復開始時, 2 回目 = ラウンド後・PR 前, 3 回目 = マージ直前。
    `disable_on_call=N` で N 回目以降を無効にし、任意のチェックポイントを検証する。
    """
    calls = {"n": 0}

    def kill_switch_reader():
        calls["n"] += 1
        if disable_on_call is None:
            return True
        return calls["n"] < disable_on_call

    def round_runner(**_kwargs):
        return round_outcome or approved_round()

    return run_iteration(
        gh=gh,
        cfg=cfg or Config.from_env({}),
        data_dir=tmp_path,
        repo_root=str(tmp_path),
        clock=clock or make_clock(),
        kill_switch_reader=kill_switch_reader,
        round_runner=round_runner,
        ideation_runner=lambda **_k: ([{"title": t, "body": "b"} for t in proposals], 0.01),
    )


class TestCheckpoint1:
    def test_disabled_at_start_does_nothing(self, tmp_path):
        gh = FakeGh()
        result = run(tmp_path, gh=gh, disable_on_call=1)
        assert result.status == "skipped-disabled"
        assert gh.actions == []
        assert not (tmp_path / "runs").exists()


class TestCheckpoint2:
    def test_disabled_after_round_leaves_branch_but_opens_no_pr(self, tmp_path):
        gh = FakeGh()
        result = run(tmp_path, gh=gh, disable_on_call=2)
        assert result.status == "paused-before-pr"
        assert "branch:loop/42-add-chart" in gh.actions
        assert "open_pr" not in gh.actions
        assert not any(a.startswith("merge:") for a in gh.actions)


class TestCheckpoint3:
    def test_disabled_before_merge_opens_pr_but_never_merges(self, tmp_path):
        gh = FakeGh()
        result = run(tmp_path, gh=gh, disable_on_call=3)
        assert result.status == "paused"
        assert "open_pr" in gh.actions
        assert not any(a.startswith("merge:") for a in gh.actions)
        assert "label:loop:paused" in gh.actions

    def test_disabled_before_merge_writes_a_paused_record(self, tmp_path):
        # レビュー指摘: 以前はこのチェックポイントで記録を書かずに終了しており、
        # 実際に課金されたラウンドの痕跡が消えていた。
        gh = FakeGh()
        run(tmp_path, gh=gh, disable_on_call=3)
        record = json.loads((tmp_path / "runs" / "0001.json").read_text())
        assert record["verdict"] == "paused"
        assert record["prNumber"] == 123
        assert record["gateReasons"] == []


class TestHappyPath:
    def test_gate_passing_merges_and_records(self, tmp_path):
        gh = FakeGh()
        result = run(tmp_path, gh=gh)
        assert result.status == "merged"
        assert "merge:123" in gh.actions
        record = json.loads((tmp_path / "runs" / "0001.json").read_text())
        assert record["verdict"] == "merged"
        assert record["iteration"] == 1
        assert record["issue"]["number"] == 42
        assert record["prNumber"] == 123
        assert record["gateReasons"] == []

    def test_creates_follow_up_issues_after_merge(self, tmp_path):
        gh = FakeGh()
        run(tmp_path, gh=gh, proposals=("idea A", "idea B"))
        assert gh.created_issues == ["idea A", "idea B"]

    def test_iteration_number_increments_across_runs(self, tmp_path):
        run(tmp_path, gh=FakeGh())
        second = run(tmp_path, gh=FakeGh())
        assert second.iteration == 2


class TestGateFailures:
    def test_adversary_rejection_blocks_merge_and_labels_needs_human(self, tmp_path):
        gh = FakeGh()
        result = run(
            tmp_path, gh=gh,
            round_outcome=approved_round(
                adversary=AdversaryVerdict(approved=False, summary="薄い")
            ),
        )
        assert result.status == "needs-human"
        assert not any(a.startswith("merge:") for a in gh.actions)
        assert "label:loop:needs-human" in gh.actions

    def test_protected_path_change_blocks_merge(self, tmp_path):
        gh = FakeGh(changed_files=["orchestrator/loop.py"])
        result = run(tmp_path, gh=gh)
        assert result.status == "needs-human"
        assert not any(a.startswith("merge:") for a in gh.actions)

    def test_oversized_diff_blocks_merge(self, tmp_path):
        gh = FakeGh(changed_lines=999)
        result = run(tmp_path, gh=gh)
        assert result.status == "needs-human"

    def test_failed_verify_blocks_merge(self, tmp_path):
        gh = FakeGh()
        result = run(tmp_path, gh=gh, round_outcome=approved_round(verify_passed=False))
        assert result.status == "needs-human"

    def test_blocked_iteration_does_not_create_follow_up_issues(self, tmp_path):
        gh = FakeGh(changed_lines=999)
        run(tmp_path, gh=gh)
        assert gh.created_issues == []


class TestNoWork:
    def test_no_ready_issue_is_a_noop(self, tmp_path):
        gh = FakeGh(issues=[])
        result = run(tmp_path, gh=gh)
        assert result.status == "no-work"
        assert gh.actions == []


class TestDryRun:
    def test_dry_run_never_merges(self, tmp_path):
        gh = FakeGh()
        result = run(tmp_path, gh=gh, cfg=Config.from_env({"LOOP_DRY_RUN": "1"}))
        assert result.status == "dry-run"
        assert not any(a.startswith("merge:") for a in gh.actions)

    def test_dry_run_records_verdict_dry_run(self, tmp_path):
        # レビュー指摘: 以前は dry-run も verdict="paused" として記録され、
        # 「人間が止めた」のか「設定でマージしない」のか区別できなかった。
        gh = FakeGh()
        run(tmp_path, gh=gh, cfg=Config.from_env({"LOOP_DRY_RUN": "1"}))
        record = json.loads((tmp_path / "runs" / "0001.json").read_text())
        assert record["verdict"] == "dry-run"
        assert record["prNumber"] == 123


class TestDuration:
    def test_duration_sec_is_derived_from_clock_reads(self, tmp_path):
        # レビュー指摘: duration_sec が 0 固定（started_at == finished_at）だったのを、
        # 実際の開始・終了時刻から計算するように変更した。
        gh = FakeGh()
        clock = make_clock("2026-07-20T12:00:00Z", "2026-07-20T12:07:30Z")
        run(tmp_path, gh=gh, clock=clock)
        record = json.loads((tmp_path / "runs" / "0001.json").read_text())
        assert record["startedAt"] == "2026-07-20T12:00:00Z"
        assert record["finishedAt"] == "2026-07-20T12:07:30Z"
        assert record["durationSec"] == 450
```

- [ ] **Step 2: テストを実行して失敗を確認**

Run: `pytest tests/test_loop.py -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'orchestrator.loop'`

- [ ] **Step 3: `orchestrator/loop.py` を実装**

```python
"""外側ループ。1 回の呼び出し = 1 反復。

停止チェックポイントは 3 箇所（spec §7）:
  1. 反復開始時          — 何もせず終了
  2. ラウンド後・PR 前   — ブランチだけ残して終了
  3. マージ直前          — PR を開いたまま loop:paused を付け、
                           verdict="paused" の記録を書いて終了
"""

from __future__ import annotations

import re
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path
from typing import Any, Callable, Protocol

from orchestrator.config import Config
from orchestrator.gates import evaluate_gate
from orchestrator.models import (
    AdversaryVerdict, CostBreakdown, Issue, RunRecord, VerifyResult,
)
from orchestrator.record import next_iteration, write_run_record

_SLUG = re.compile(r"[^a-z0-9]+")


class GhLike(Protocol):
    def list_ready_issues(self, label: str) -> list[Issue]: ...
    def changed_files(self, base: str) -> list[str]: ...
    def changed_lines(self, base: str) -> int: ...
    def diff(self, base: str, max_chars: int = ...) -> str: ...
    def create_branch(self, name: str, base: str) -> None: ...
    def push_branch(self, name: str) -> None: ...
    def open_pr(self, *, title: str, body: str, base: str, head: str) -> int: ...
    def comment_pr(self, number: int, body: str) -> None: ...
    def merge_pr(self, number: int) -> None: ...
    def add_label(self, number: int, label: str) -> None: ...
    def create_issue(self, *, title: str, body: str, labels: list[str]) -> int: ...


@dataclass(frozen=True)
class IterationResult:
    status: str
    iteration: int
    issue_number: int | None = None
    pr_number: int | None = None
    reasons: tuple[str, ...] = ()


def slugify(title: str) -> str:
    return _SLUG.sub("-", title.lower()).strip("-")[:40] or "task"


def _seconds_between(start_iso: str, end_iso: str) -> int:
    """ISO8601（`...Z`）の2時刻の差を秒で返す。負値にはしない。"""
    start = datetime.fromisoformat(start_iso.replace("Z", "+00:00"))
    end = datetime.fromisoformat(end_iso.replace("Z", "+00:00"))
    return max(0, round((end - start).total_seconds()))


def run_iteration(
    *,
    gh: GhLike,
    cfg: Config,
    data_dir: Path,
    repo_root: str,
    clock: Callable[[], str],
    kill_switch_reader: Callable[[], bool],
    round_runner: Callable[..., Any],
    ideation_runner: Callable[..., tuple[list[dict], float]],
) -> IterationResult:
    """1 反復を実行する。`clock` は ISO8601 文字列を返す呼び出し可能オブジェクト。
    テストでは固定シーケンスを注入し、`duration_sec` を決定的にする
    （旧稿は `started_at == finished_at == now` で `duration_sec` が常に 0 だった）。
    """
    started_at = clock()
    iteration = next_iteration(Path(data_dir))

    # --- 停止チェックポイント 1 ---
    if not kill_switch_reader():
        return IterationResult(status="skipped-disabled", iteration=iteration)

    ready = gh.list_ready_issues(cfg.ready_label)
    if not ready:
        return IterationResult(status="no-work", iteration=iteration)

    issue = ready[0]
    branch = f"loop/{issue.number}-{slugify(issue.title)}"
    gh.create_branch(branch, cfg.base_branch)

    outcome = round_runner(
        task=f"{issue.title}\n\n(issue #{issue.number})",
        diff_provider=lambda: gh.diff(cfg.base_branch),
        cwd=repo_root,
        cfg=cfg,
    )

    # --- 停止チェックポイント 2 ---
    if not kill_switch_reader():
        return IterationResult(
            status="paused-before-pr", iteration=iteration, issue_number=issue.number
        )

    changed_files = gh.changed_files(cfg.base_branch)
    changed_lines = gh.changed_lines(cfg.base_branch)
    gate = evaluate_gate(
        verify_passed=outcome.verify_passed,
        e2e_passed=outcome.e2e_passed,
        adversary_approved=outcome.adversary.approved,
        changed_lines=changed_lines,
        changed_files=changed_files,
        max_changed_lines=cfg.max_changed_lines,
    )

    gh.push_branch(branch)
    pr = gh.open_pr(
        title=f"{issue.title} (#{issue.number})",
        body=_pr_body(issue, outcome, gate.reasons),
        base=cfg.base_branch,
        head=branch,
    )
    gh.comment_pr(pr, _review_comment(outcome.adversary))

    # --- 停止チェックポイント 3（マージ直前） ---
    # レビュー指摘: 以前はここで記録を書かずに return していたため、実際に
    # builder+adversary の 1 ラウンド分の課金が発生したのに痕跡が残らなかった。
    if not kill_switch_reader():
        gh.add_label(issue.number, cfg.paused_label)
        _record(
            data_dir, iteration, issue, branch, outcome, changed_lines,
            verdict="paused", started_at=started_at, finished_at=clock(),
            cfg=cfg, ideation_cost=0.0, next_issues=[],
            gate_reasons=gate.reasons, pr_number=pr,
        )
        return IterationResult(
            status="paused", iteration=iteration,
            issue_number=issue.number, pr_number=pr,
        )

    if not gate.passed:
        gh.add_label(issue.number, cfg.needs_human_label)
        _record(
            data_dir, iteration, issue, branch, outcome, changed_lines,
            verdict="needs-human", started_at=started_at, finished_at=clock(),
            cfg=cfg, ideation_cost=0.0, next_issues=[],
            gate_reasons=gate.reasons, pr_number=pr,
        )
        return IterationResult(
            status="needs-human", iteration=iteration,
            issue_number=issue.number, pr_number=pr, reasons=gate.reasons,
        )

    if cfg.dry_run:
        # レビュー指摘: 以前は dry-run も verdict="paused" として記録しており、
        # 「人間が止めた」のか「最初からマージしない設定だった」のか区別できなかった。
        _record(
            data_dir, iteration, issue, branch, outcome, changed_lines,
            verdict="dry-run", started_at=started_at, finished_at=clock(),
            cfg=cfg, ideation_cost=0.0, next_issues=[],
            gate_reasons=gate.reasons, pr_number=pr,
        )
        return IterationResult(
            status="dry-run", iteration=iteration,
            issue_number=issue.number, pr_number=pr,
        )

    gh.merge_pr(pr)

    proposals, ideation_cost = ideation_runner(
        context=f"iteration {iteration} で「{issue.title}」を完了した", cfg=cfg, cwd=repo_root
    )
    next_issues = [
        gh.create_issue(title=p["title"], body=p["body"], labels=[cfg.ready_label])
        for p in proposals
    ]

    _record(
        data_dir, iteration, issue, branch, outcome, changed_lines,
        verdict="merged", started_at=started_at, finished_at=clock(),
        cfg=cfg, ideation_cost=ideation_cost, next_issues=next_issues,
        gate_reasons=gate.reasons, pr_number=pr,
    )
    return IterationResult(
        status="merged", iteration=iteration,
        issue_number=issue.number, pr_number=pr,
    )


def _record(
    data_dir, iteration, issue, branch, outcome, changed_lines,
    *, verdict, started_at, finished_at, cfg, ideation_cost, next_issues,
    gate_reasons, pr_number,
) -> None:
    write_run_record(
        RunRecord(
            id=f"{started_at.replace('-', '').replace(':', '')}-{issue.number}",
            iteration=iteration,
            issue=issue,
            branch=branch,
            started_at=started_at,
            finished_at=finished_at,
            duration_sec=_seconds_between(started_at, finished_at),
            revise_cycles=outcome.revise_cycles,
            verdict=verdict,
            gate_reasons=list(gate_reasons),
            pr_number=pr_number,
            adversary=outcome.adversary,
            verify=VerifyResult(
                unit_passed=outcome.verify_passed,
                e2e_passed=outcome.e2e_passed,
            ),
            changed_lines=changed_lines,
            cost=CostBreakdown(
                builder_usd=outcome.builder_cost_usd,
                adversary_usd=outcome.adversary_cost_usd,
                ideation_usd=ideation_cost,
            ),
            models={
                "builder": cfg.builder_model,
                "adversary": cfg.adversary_model,
                "ideation": cfg.ideation_model,
            },
            next_issues=next_issues,
        ),
        data_dir=Path(data_dir),
    )


def _pr_body(issue: Issue, outcome, reasons: tuple[str, ...]) -> str:
    lines = [
        f"Closes #{issue.number}",
        "",
        f"- adversary: {'approved' if outcome.adversary.approved else 'rejected'}",
        f"- revise cycles: {outcome.revise_cycles}",
        f"- verify: {'pass' if outcome.verify_passed else 'FAIL'}",
        f"- e2e: {'pass' if outcome.e2e_passed else 'FAIL'}",
    ]
    if reasons:
        lines += ["", "### ゲート不通過の理由", *[f"- {r}" for r in reasons]]
    return "\n".join(lines)


def _review_comment(verdict: AdversaryVerdict) -> str:
    head = "✅ approved" if verdict.approved else "❌ rejected"
    return f"### 敵対レビュー: {head}\n\n{verdict.summary}"
```

- [ ] **Step 4: テストを実行して合格を確認**

Run: `pytest tests/test_loop.py -v`
Expected: PASS — 16 passed（レビューでの修正により「チェックポイント3が記録を書く」「dry-runがverdict=dry-runを記録する」「duration_secが実時刻から算出される」の3件を追加したため、旧稿の「13 passed」から更新）

- [ ] **Step 5: 全テストを実行**

Run: `pytest -v`
Expected: PASS — 全 89 テストが合格（レビューでの契約修正により models 3→6、loop 13→16 に増えたため、旧稿の「83」から更新）
（内訳: config 3 / models 6 / gates 22 / shell 3 / claude_cli 5 / review 6 / github_ops 10 / round 6 / record 7 / ideation 5 / loop 16）

- [ ] **Step 6: コミット**

```bash
git add orchestrator/loop.py tests/test_loop.py
git commit -m "feat(orchestrator): add outer loop with three stop checkpoints"
```

---

## Task 12: CLI エントリポイントと制御ファイル

**Files:**
- Create: `orchestrator/__main__.py`
- Create: `.loop/control.json`

- [ ] **Step 1: `.loop/control.json` を作成**

```json
{
  "enabled": true,
  "reason": "通常稼働",
  "actor": "system"
}
```

- [ ] **Step 2: `orchestrator/__main__.py` を実装**

> **レビューでの修正（2026-07-20）:** `run_iteration` が例外を投げると、実際に課金は発生していても `data/runs/*.json` には何も書かれず、無人実行では反復が「消える」。これがこの自走ループにおける唯一の観測手段になるため、トップレベルで例外を捕まえ `verdict="failed"` の記録を書いてから終了するようにする。あわせて `run_iteration` が `now: str` から `clock: Callable[[], str]` に変わった（Task 11）ため呼び出しを更新する。

```python
"""`python -m orchestrator` で 1 反復を実行する。"""

from __future__ import annotations

import json
import os
import sys
from datetime import datetime, timezone
from pathlib import Path

from orchestrator.config import Config
from orchestrator.gates import read_kill_switch
from orchestrator.github_ops import GitHubOps
from orchestrator.ideation import propose_next_issues
from orchestrator.loop import run_iteration
from orchestrator.models import AdversaryVerdict, CostBreakdown, Issue, RunRecord, VerifyResult
from orchestrator.record import next_iteration, write_run_record, write_status
from orchestrator.round import run_native_round


def _read_control(repo_root: Path) -> dict:
    path = repo_root / ".loop" / "control.json"
    if not path.is_file():
        return {}
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except json.JSONDecodeError:
        return {"enabled": False, "reason": "control.json が壊れている", "actor": "system"}


def _utc_now() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def main() -> int:
    repo_root = Path(os.environ.get("REPO_ROOT", ".")).resolve()
    data_dir = repo_root / "data"
    cfg = Config.from_env(os.environ)

    def kill_switch_reader() -> bool:
        return read_kill_switch(env=os.environ, control=_read_control(repo_root)).enabled

    gh = GitHubOps(cwd=str(repo_root))

    # 無人実行の最終防波堤: 反復のどこで例外が飛んでも、必ず verdict="failed" の
    # 記録を残してから異常終了する。これが無いと、課金は発生したのにダッシュ
    # ボードには何も表示されない「消えた反復」が起きる。
    try:
        result = run_iteration(
            gh=gh,
            cfg=cfg,
            data_dir=data_dir,
            repo_root=str(repo_root),
            clock=_utc_now,
            kill_switch_reader=kill_switch_reader,
            round_runner=run_native_round,
            ideation_runner=_ideate,
        )
    except Exception as exc:  # noqa: BLE001 — 無人実行では握りつぶさず記録して非ゼロ終了する
        _record_crash(data_dir, cfg, exc)
        print(json.dumps({"status": "failed", "error": repr(exc)}, ensure_ascii=False))
        return 1

    switch = read_kill_switch(env=os.environ, control=_read_control(repo_root))
    write_status(
        data_dir,
        state="RUNNING" if switch.enabled else "PAUSED",
        reason=switch.reason if not switch.enabled else f"直近の反復: {result.status}",
        actor=switch.actor,
        resume_hint="gh variable set LOOP_ENABLED --body true && gh workflow enable loop.yml",
        now=_utc_now(),
    )

    print(json.dumps(result.__dict__, ensure_ascii=False, default=list))
    return 0


def _record_crash(data_dir: Path, cfg: Config, exc: Exception) -> None:
    """例外で異常終了した反復の痕跡を残す。issue はこの時点では特定できないため不明値で埋める。"""
    now = _utc_now()
    write_run_record(
        RunRecord(
            id=f"{now.replace('-', '').replace(':', '')}-0",
            iteration=next_iteration(data_dir),
            issue=Issue(number=0, title="(不明: 例外発生時点で issue を特定できなかった)", labels=[]),
            branch="unknown",
            started_at=now,
            finished_at=now,
            duration_sec=0,
            revise_cycles=0,
            verdict="failed",
            gate_reasons=[f"反復が例外で異常終了した: {exc!r}"],
            pr_number=None,
            adversary=AdversaryVerdict(approved=False, summary="例外により審査に到達しなかった"),
            verify=VerifyResult(unit_passed=False, e2e_passed=False, coverage_pct=0.0),
            changed_lines=0,
            cost=CostBreakdown(),
            models={
                "builder": cfg.builder_model,
                "adversary": cfg.adversary_model,
                "ideation": cfg.ideation_model,
            },
            next_issues=[],
        ),
        data_dir=data_dir,
    )


def _ideate(*, context: str, cfg: Config, cwd: str) -> tuple[list[dict], float]:
    """loop.py が `ideation_runner(context=, cfg=, cwd=)` で呼ぶ形に合わせる。"""
    outcome = propose_next_issues(context=context, cfg=cfg, cwd=cwd)
    return ([{"title": p.title, "body": p.body} for p in outcome.proposals], outcome.cost_usd)


if __name__ == "__main__":
    sys.exit(main())
```

- [ ] **Step 3: dry-run で動作確認**

```bash
LOOP_DRY_RUN=1 REPO_ROOT=. python -m orchestrator
```

Expected: `no-work`（`loop:ready` の issue が無いため）が JSON で出力され、`data/status.json` が更新される。

- [ ] **Step 4: コミット**

```bash
git add orchestrator/__main__.py .loop
git commit -m "feat(orchestrator): add CLI entrypoint and kill-switch control file"
```

---

## Task 13: ラベル作成と実地 dry-run

**Files:** なし（GitHub 設定）

- [ ] **Step 1: 必要なラベルを作成**

```bash
gh label create "loop:ready" --color 0e8a16 --description "ループが着手してよい" --force
gh label create "loop:needs-human" --color d93f0b --description "ゲート不通過。人間の判断が必要" --force
gh label create "loop:halted" --color b60205 --description "サーキットブレーカ作動" --force
gh label create "loop:paused" --color fbca04 --description "停止スイッチにより中断" --force
```

- [ ] **Step 2: 最初の種 issue を作成**

```bash
gh issue create --title "ダッシュボードに直近反復の所要時間を表示する" \
  --body "IterationTimeline の各行に durationSec を分表記で追加する。受け入れ条件: 単体テストで表示形式を検証していること。" \
  --label "loop:ready"
```

- [ ] **Step 3: dry-run で 1 反復を実走**

```bash
LOOP_DRY_RUN=1 REPO_ROOT=. python -m orchestrator
```

Expected: `dry-run` ステータスで終了し、PR が作成されるが**マージはされない**。`data/runs/0001.json` が作られる。

- [ ] **Step 4: 停止機構の実地確認**

```bash
gh variable set LOOP_ENABLED --body false
LOOP_ENABLED=false REPO_ROOT=. python -m orchestrator
```

Expected: `skipped-disabled` が出力され、GitHub 上に一切の変更が発生しない。

- [ ] **Step 5: 元に戻す**

```bash
gh variable set LOOP_ENABLED --body true
```

---

## Plan 2 完了条件

- [ ] `pytest` が全緑（89 テスト）
- [ ] `LOOP_DRY_RUN=1 python -m orchestrator` で 1 反復が完走し PR が作られる（マージはされない）
- [ ] `LOOP_ENABLED=false` で `skipped-disabled` になり副作用ゼロ
- [ ] 保護パス変更・過大 diff・adversary 棄却のいずれでもマージされないことがテストで保証されている
- [ ] `data/runs/*.json` が Plan 1 のダッシュボードで表示できる

**次:** Plan 3（Autonomy）— GHA workflows で無人化し、h5i 経路を差し込む。
