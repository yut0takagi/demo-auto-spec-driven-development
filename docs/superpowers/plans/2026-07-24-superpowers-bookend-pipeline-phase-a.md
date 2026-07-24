# superpowers ブックエンド・パイプライン Phase A 実装計画

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 実装エージェントに planner（自律 spec+plan）・plan-review・モデル昇格を足し、`run_iteration` を plan/build/gate の 3 フェーズに分解して各フェーズを独立起動可能にする（Phase A = orchestrator 側のみ。ライブ loop.yml は従来どおり `run_iteration` を呼ぶので稼働無影響）。

**Architecture:** 純ロジックは Python（テスト可能）。新モジュール `handoff.py`（job 間の baton）/`plan.py`（planner）を追加、`review.py` に plan-review、`round.py` にモデル昇格と PLAN 注入、`loop.py` を `plan_phase`/`build_phase`/`gate_phase` に分解し `run_iteration` はその合成にする。`__main__.py` に `plan|build|gate` サブコマンドを追加。

**Tech Stack:** Python 3 / dataclasses / pytest / 既存 FakeGh・FakeRunner テスト基盤。

**設計spec:** [2026-07-24-superpowers-bookend-pipeline-design.md](../specs/2026-07-24-superpowers-bookend-pipeline-design.md)

---

## File Structure

| ファイル | 責務 | 変更 |
|---|---|---|
| `orchestrator/config.py` | 既定値。planner/昇格/plan-cycle の config を追加 | Modify |
| `orchestrator/handoff.py` | job 間 baton の JSON I/O（純 I/O） | **Create** |
| `orchestrator/plan.py` | planner：issue→設計+手順+受入 or TRIVIAL | **Create** |
| `orchestrator/review.py` | 既存 adversary に plan-review プロンプト/関数を追加 | Modify |
| `orchestrator/round.py` | PLAN 注入＋モデル昇格。`RoundOutcome.builder_model_used` 追加 | Modify |
| `orchestrator/loop.py` | `run_iteration` を 3 フェーズに分解し合成 | Modify |
| `orchestrator/__main__.py` | `plan\|build\|gate` サブコマンド追加 | Modify |
| `tests/test_config.py` 他 | 各機能の TDD テスト | Modify/Create |

**不変条件:** 既存 130 テストは全タスクで緑を維持する（ライブ稼働の振る舞い契約）。

---

## Task 1: Config に新パラメータ

**Files:**
- Modify: `orchestrator/config.py`
- Test: `tests/test_config.py`

- [ ] **Step 1: 失敗するテストを書く**

`tests/test_config.py` の `test_defaults_match_spec` に追記:

```python
    assert cfg.planner_model == "claude-sonnet-5"
    assert cfg.builder_escalation_model == "claude-opus-4-8"
    assert cfg.escalate_after_cycles == 2
    assert cfg.max_plan_cycles == 2
```

新規テストを追加:

```python
def test_planner_and_escalation_env_overrides():
    cfg = Config.from_env({
        "PLANNER_MODEL": "claude-haiku-4-5",
        "BUILDER_ESCALATION_MODEL": "claude-sonnet-5",
        "ESCALATE_AFTER_CYCLES": "1",
        "MAX_PLAN_CYCLES": "3",
    })
    assert cfg.planner_model == "claude-haiku-4-5"
    assert cfg.builder_escalation_model == "claude-sonnet-5"
    assert cfg.escalate_after_cycles == 1
    assert cfg.max_plan_cycles == 3
```

- [ ] **Step 2: 失敗を確認**

Run: `python3 -m pytest tests/test_config.py -q`
Expected: FAIL（`AttributeError: 'Config' object has no attribute 'planner_model'`）

- [ ] **Step 3: 最小実装**

`orchestrator/config.py` の dataclass に（`ideation_low_water` の直後あたりに）追加:

```python
    #: planner（自律 spec+plan）が使うモデル。
    planner_model: str = "claude-sonnet-5"
    #: revise が escalate_after_cycles に達したら builder を切り替える上位モデル。
    builder_escalation_model: str = "claude-opus-4-8"
    #: revise サイクルがこの回数に達したら builder モデルを昇格する。
    escalate_after_cycles: int = 2
    #: plan-review 却下からの再計画の上限。
    max_plan_cycles: int = 2
```

`from_env` に追加:

```python
            planner_model=env.get("PLANNER_MODEL", "claude-sonnet-5"),
            builder_escalation_model=env.get("BUILDER_ESCALATION_MODEL", "claude-opus-4-8"),
            escalate_after_cycles=int(env.get("ESCALATE_AFTER_CYCLES", 2)),
            max_plan_cycles=int(env.get("MAX_PLAN_CYCLES", 2)),
```

- [ ] **Step 4: 通過を確認**

Run: `python3 -m pytest tests/test_config.py -q`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add orchestrator/config.py tests/test_config.py
git commit -m "feat(config): planner/昇格/plan-cycle の設定を追加"
```

---

## Task 2: handoff モジュール（job 間 baton）

**Files:**
- Create: `orchestrator/handoff.py`
- Test: `tests/test_handoff.py`

- [ ] **Step 1: 失敗するテストを書く**

`tests/test_handoff.py`:

```python
from pathlib import Path

from orchestrator.handoff import Handoff, read_handoff, write_handoff


def test_round_trip_preserves_all_fields(tmp_path):
    h = Handoff(
        status="ok", issue_number=176, issue_title="複数ページ化",
        branch="loop/176-multi", trivial=False, plan="## 設計\n...",
        verify_passed=True, e2e_passed=True, adversary_approved=True,
        adversary_summary="ok", revise_cycles=1,
        builder_model_used="claude-opus-4-8", builder_cost_usd=0.3,
        adversary_cost_usd=0.02, planner_cost_usd=0.05, changed_lines=420,
        changed_files=["dashboard/src/app/page.tsx"], ideation_cost_usd=0.0,
        next_issues=[901],
    )
    p = tmp_path / "handoff" / "iteration.json"
    write_handoff(p, h)
    assert read_handoff(p) == h


def test_write_creates_parent_dirs(tmp_path):
    p = tmp_path / "a" / "b" / "iteration.json"
    write_handoff(p, Handoff(status="no-work"))
    assert p.is_file()
    assert read_handoff(p).status == "no-work"
```

- [ ] **Step 2: 失敗を確認**

Run: `python3 -m pytest tests/test_handoff.py -q`
Expected: FAIL（`ModuleNotFoundError: No module named 'orchestrator.handoff'`）

- [ ] **Step 3: 最小実装**

`orchestrator/handoff.py`:

```python
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
```

- [ ] **Step 4: 通過を確認**

Run: `python3 -m pytest tests/test_handoff.py -q`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add orchestrator/handoff.py tests/test_handoff.py
git commit -m "feat(handoff): job間 baton の JSON I/O を追加"
```

---

## Task 3: planner モジュール（自律 spec+plan / trivial トリアージ）

**Files:**
- Create: `orchestrator/plan.py`
- Test: `tests/test_plan.py`

planner は superpowers の brainstorming（設計分解）と writing-plans（手順化・受入条件）を人間 Q&A 無しの自律版に翻案。出力は JSON 1 個。

- [ ] **Step 1: パーサの失敗テストを書く**

`tests/test_plan.py`:

```python
import json

from orchestrator.config import Config
from orchestrator.plan import PlanResult, parse_plan, propose_plan
from orchestrator.shell import CommandResult, FakeRunner


FULL = (
    "```json\n"
    + json.dumps({
        "trivial": False,
        "design": "ルータを導入しページを分割する",
        "tasks": ["ルータ骨組み", "パネル移設"],
        "acceptance": ["/a /b が表示される", "既存テスト緑"],
    }, ensure_ascii=False)
    + "\n```"
)
TRIVIAL = '```json\n{"trivial": true, "design": "", "tasks": [], "acceptance": []}\n```'


def test_parse_full_plan_is_not_trivial_and_renders_sections():
    res = parse_plan(FULL, cost=0.05)
    assert isinstance(res, PlanResult)
    assert res.trivial is False
    assert "ルータを導入" in res.plan_text
    assert "パネル移設" in res.plan_text
    assert "/a /b が表示される" in res.plan_text
    assert res.cost_usd == 0.05


def test_parse_trivial_plan():
    res = parse_plan(TRIVIAL, cost=0.01)
    assert res.trivial is True


def test_parse_malformed_falls_back_to_nontrivial_raw_text():
    # 壊れた出力でも build を止めない: trivial=False で生テキストを plan に載せる。
    res = parse_plan("これは JSON ではない散文の計画", cost=0.0)
    assert res.trivial is False
    assert "散文の計画" in res.plan_text
```

- [ ] **Step 2: 失敗を確認**

Run: `python3 -m pytest tests/test_plan.py -q`
Expected: FAIL（`ModuleNotFoundError: No module named 'orchestrator.plan'`）

- [ ] **Step 3: 最小実装**

`orchestrator/plan.py`:

```python
"""planner: issue から設計+手順+受入条件を自律生成する（人間 Q&A なし）。

superpowers の brainstorming（設計分解）と writing-plans（手順化・受入条件）を
ヘッドレス自律版に翻案。小さい issue は trivial として即返し、計画をスキップさせる。
"""

from __future__ import annotations

import json
import re
from dataclasses import dataclass

from orchestrator.claude_cli import run_agent
from orchestrator.config import Config
from orchestrator.shell import Runner, real_runner

PLANNER_PROMPT_TEMPLATE = """\
あなたはこのリポジトリの実装計画者です。次のタスクを実装するための計画を立ててください。
人間には質問できません（無人運用）。与えられた情報だけで自律的に判断すること。

## タスク
{task}

## 進め方
- まず「これは小さく、計画不要か」を判定する。設定変更・単一パネル追加など数十行で終わるものは trivial。
- trivial でなければ、設計方針・ファイル単位のタスク分解・**機械検証可能な受入条件**を書く。
- 変更は `dashboard/` と `data/` 内で完結する前提で計画する。

次の JSON だけをコードフェンスで囲って出力すること:
```json
{{"trivial": <true/false>, "design": "<設計方針>", "tasks": ["<手順1>", "..."], "acceptance": ["<検証可能な受入条件>", "..."]}}
```
"""

_FENCED = re.compile(r"```(?:json)?\s*(\{.*?\})\s*```", re.DOTALL)
_BARE = re.compile(r"(\{.*\})", re.DOTALL)


@dataclass(frozen=True)
class PlanResult:
    trivial: bool
    plan_text: str
    cost_usd: float


def _render(design: str, tasks: list, acceptance: list) -> str:
    lines = ["## 設計方針", design, "", "## 手順"]
    lines += [f"- {t}" for t in tasks]
    lines += ["", "## 受入条件（検証可能）"]
    lines += [f"- {a}" for a in acceptance]
    return "\n".join(lines)


def parse_plan(text: str, *, cost: float) -> PlanResult:
    for pattern in (_FENCED, _BARE):
        match = pattern.search(text)
        if not match:
            continue
        try:
            data = json.loads(match.group(1))
        except json.JSONDecodeError:
            continue
        if not isinstance(data, dict):
            continue
        trivial = bool(data.get("trivial", False))
        plan_text = _render(
            str(data.get("design", "")),
            list(data.get("tasks", [])),
            list(data.get("acceptance", [])),
        )
        return PlanResult(trivial=trivial, plan_text=plan_text, cost_usd=cost)
    # パース不能でも build を止めない: 非 trivial 扱いで生テキストを計画に載せる。
    return PlanResult(trivial=False, plan_text=text.strip(), cost_usd=cost)


def propose_plan(
    *, task: str, cfg: Config, cwd: str, runner: Runner = real_runner
) -> PlanResult:
    out = run_agent(
        PLANNER_PROMPT_TEMPLATE.format(task=task),
        model=cfg.planner_model, cwd=cwd, runner=runner,
    )
    return parse_plan(out.text, cost=out.cost_usd)
```

- [ ] **Step 4: 通過を確認**

Run: `python3 -m pytest tests/test_plan.py -q`
Expected: PASS

- [ ] **Step 5: propose_plan の統合テストを追加**

`tests/test_plan.py` に追記:

```python
def _agent(text, cost=0.05):
    return CommandResult(0, json.dumps({"result": text, "total_cost_usd": cost}), "")


def test_propose_plan_calls_planner_model():
    runner = FakeRunner([_agent(FULL)])
    res = propose_plan(task="複数ページ化", cfg=Config.from_env({}), cwd="/repo", runner=runner)
    cmd = runner.calls[0][0]
    assert cmd[cmd.index("--model") + 1] == "claude-sonnet-5"
    assert res.trivial is False
    assert "複数ページ化" in cmd[2]  # プロンプトにタスクが入っている
```

- [ ] **Step 6: 通過を確認 & Commit**

Run: `python3 -m pytest tests/test_plan.py -q`
Expected: PASS

```bash
git add orchestrator/plan.py tests/test_plan.py
git commit -m "feat(plan): 自律 planner(spec+plan/trivial トリアージ) を追加"
```

---

## Task 4: plan-review（build 前に PLAN を審査）

**Files:**
- Modify: `orchestrator/review.py`
- Test: `tests/test_review.py`

既存の公正 adversary を PLAN 用に再利用する。`parse_adversary_review` はそのまま流用。

- [ ] **Step 1: 失敗するテストを書く**

`tests/test_review.py` に追記:

```python
from orchestrator.review import PLAN_REVIEW_PROMPT_TEMPLATE, review_plan


def test_plan_review_prompt_is_fair_and_has_placeholders():
    t = PLAN_REVIEW_PROMPT_TEMPLATE
    assert "{task}" in t and "{plan}" in t
    assert "公正" in t          # 公正レビュー基調（reject バイアスにしない）
    assert "approved" in t       # JSON 契約


def test_review_plan_parses_verdict():
    import json
    from orchestrator.config import Config
    from orchestrator.shell import CommandResult, FakeRunner
    approve = '```json\n{"approved": true, "summary": "妥当"}\n```'
    runner = FakeRunner([CommandResult(0, json.dumps({"result": approve, "total_cost_usd": 0.01}), "")])
    verdict, cost = review_plan(task="t", plan="## 設計\n...", cfg=Config.from_env({}), cwd="/repo", runner=runner)
    assert verdict.approved is True
    assert cost == 0.01
    cmd = runner.calls[0][0]
    assert cmd[cmd.index("--model") + 1] == "claude-haiku-4-5"  # adversary_model を使う
```

- [ ] **Step 2: 失敗を確認**

Run: `python3 -m pytest tests/test_review.py -q`
Expected: FAIL（`ImportError: cannot import name 'PLAN_REVIEW_PROMPT_TEMPLATE'`）

- [ ] **Step 3: 最小実装**

`orchestrator/review.py` に追加（既存 import の `run_agent` を利用。無ければ `from orchestrator.claude_cli import run_agent` を追加）:

```python
PLAN_REVIEW_PROMPT_TEMPLATE = """\
あなたは公正なシニアレビュアーです。以下のタスクに対する「実装計画(PLAN)」を、コードを書く前に審査してください。

## タスク
{task}

## 実装計画(PLAN)
{plan}

## 判断基準
- 計画がタスクの受入条件を満たし、方針の筋が通っていれば approve する。
- 却下は「具体的で実害のある設計欠陥」（受入条件を満たせない・明らかな手戻り）に限る。
- 些末な好みや、実装で吸収できる細部では却下しない。

次の JSON だけを出力すること:
```json
{{"approved": <true/false>, "summary": "<承認理由 or blocking な欠陥>"}}
```
"""


def review_plan(*, task, plan, cfg, cwd, runner=real_runner):
    """PLAN を adversary_model で審査し (AdversaryVerdict, cost) を返す。"""
    out = run_agent(
        PLAN_REVIEW_PROMPT_TEMPLATE.format(task=task, plan=plan),
        model=cfg.adversary_model, cwd=cwd, runner=runner,
    )
    return parse_adversary_review(out.text), out.cost_usd
```

（`real_runner` が review.py 未 import の場合は `from orchestrator.shell import real_runner` を追加。）

- [ ] **Step 4: 通過を確認**

Run: `python3 -m pytest tests/test_review.py -q`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add orchestrator/review.py tests/test_review.py
git commit -m "feat(review): build 前に PLAN を審査する plan-review を追加"
```

---

## Task 5: round にモデル昇格と PLAN 注入

**Files:**
- Modify: `orchestrator/round.py`
- Test: `tests/test_round.py`

- [ ] **Step 1: 昇格の失敗テストを書く**

`tests/test_round.py` に追記:

```python
def test_escalates_builder_model_after_threshold():
    # ESCALATE_AFTER_CYCLES=1: cycle0 の builder は base、revise(cycle1) は昇格モデルを使う。
    runner = FakeRunner([
        agent_out("v1"),                     # builder cycle0 (base)
        CommandResult(1, "", "err"),         # verify 失敗
        agent_out("r1"),                     # revise cycle1 (escalated)
        OK, OK, agent_out(APPROVE),          # verify, e2e, approve
    ])
    outcome = run_native_round(
        task="t", diff_provider=lambda: "d", cwd="/repo",
        cfg=Config.from_env({"ESCALATE_AFTER_CYCLES": "1"}), runner=runner,
    )
    work_cmd = runner.calls[0][0]
    revise_cmd = runner.calls[2][0]
    assert work_cmd[work_cmd.index("--model") + 1] == "claude-sonnet-5"
    assert revise_cmd[revise_cmd.index("--model") + 1] == "claude-opus-4-8"
    assert outcome.builder_model_used == "claude-opus-4-8"


def test_no_escalation_when_green_early_keeps_base_model():
    runner = FakeRunner([agent_out("v1"), OK, OK, agent_out(APPROVE)])
    outcome = run_native_round(
        task="t", diff_provider=lambda: "d", cwd="/repo",
        cfg=Config.from_env({}), runner=runner,
    )
    assert outcome.builder_model_used == "claude-sonnet-5"


def test_plan_is_injected_into_builder_prompt():
    runner = FakeRunner([agent_out("v1"), OK, OK, agent_out(APPROVE)])
    run_native_round(
        task="t", diff_provider=lambda: "d", cwd="/repo",
        cfg=Config.from_env({}), runner=runner, plan="## 設計方針\nルータ導入",
    )
    builder_cmd = runner.calls[0][0]
    assert "ルータ導入" in builder_cmd[2]
```

- [ ] **Step 2: 失敗を確認**

Run: `python3 -m pytest tests/test_round.py -q`
Expected: FAIL（`builder_model_used` 属性なし / `plan` 引数なし）

- [ ] **Step 3: 最小実装**

`orchestrator/round.py`:

(a) `RoundOutcome` に末尾フィールドを追加:

```python
    builder_cost_usd: float
    adversary_cost_usd: float
    builder_model_used: str = ""
```

(b) `BUILDER_PROMPT_TEMPLATE` を PLAN 注入・TDD 明示・陳腐化した「3000行以内」除去に差し替え:

```python
BUILDER_PROMPT_TEMPLATE = """\
あなたは実装担当です。次のタスクをこのリポジトリに実装してください。

## タスク
{task}
{plan_block}
## 進め方（テスト駆動）
- まず失敗するテストを書き、失敗を確認してから最小実装で通す（見せかけのテスト・実装は禁止）
- テストは振る舞いを実質的に検証する（通すためだけのテストは禁止）

## 必ず守ること
- 変更は `dashboard/` と `data/` の中だけに限る。`.github/`, `orchestrator/`, `tests/` は絶対に変更しない
- `cd dashboard && npm run verify` と `npm run test:e2e` が緑になること
- 変更は必要最小限に保つ
"""
```

(c) 昇格ヘルパと `run_native_round` シグネチャ・呼び出しを変更:

```python
def _builder_model(cycles: int, cfg: Config) -> str:
    """revise が escalate_after_cycles に達したら上位モデルへ昇格する。"""
    if cycles >= cfg.escalate_after_cycles:
        return cfg.builder_escalation_model
    return cfg.builder_model


def _builder_prompt(task: str, plan: str) -> str:
    block = f"\n## 実装計画（これに沿って進める）\n{plan}\n" if plan else "\n"
    return BUILDER_PROMPT_TEMPLATE.format(task=task, plan_block=block)
```

`run_native_round` の定義に `plan: str = ""` を追加し、初回 builder 呼び出しを:

```python
    model_used = _builder_model(0, cfg)
    work = run_agent(
        _builder_prompt(task, plan),
        model=model_used, cwd=cwd, runner=runner,
    )
    builder_cost += work.cost_usd
```

revise 呼び出し（現 `cycles += 1` の後）を:

```python
        cycles += 1
        feedback = _compose_feedback(...)  # 既存のまま
        model_used = _builder_model(cycles, cfg)
        revise = run_agent(
            REVISE_PROMPT_TEMPLATE.format(task=task, feedback=feedback),
            model=model_used, cwd=cwd, runner=runner,
        )
        builder_cost += revise.cost_usd
```

`RoundOutcome(...)` の生成に `builder_model_used=model_used` を追加。

- [ ] **Step 4: 通過を確認（新旧すべて）**

Run: `python3 -m pytest tests/test_round.py -q`
Expected: PASS（既存 9 + 新規 3）

- [ ] **Step 5: Commit**

```bash
git add orchestrator/round.py tests/test_round.py
git commit -m "feat(round): PLAN 注入と revise 連続失敗時のモデル昇格"
```

---

## Task 6: run_iteration を 3 フェーズに分解して合成

**Files:**
- Modify: `orchestrator/loop.py`
- Test: `tests/test_loop.py`

**方針:** 既存 `run_iteration`（[loop.py](../../../orchestrator/loop.py) の 151-296 行）の振る舞いを **1 バイトも変えない**まま、内部を `plan_phase`→`build_phase`→`gate_phase` の合成に置き換える。既存 130 テストが緑のままであることが「振る舞い保存」の証明。新規テストは (a) planner が build 前に呼ばれること、(b) plan-review 却下で再計画されること を足す。

### 6-1: フェーズの戻り値 dataclass と planner フックを配線

- [ ] **Step 1: `run_iteration` に planner/plan-review フックを注入する新テスト（RED）**

`tests/test_loop.py` に追記（`run` ヘルパは `planner`/`plan_reviewer` を任意注入できるよう後で拡張する）:

```python
class TestPlanPhase:
    def test_planner_runs_before_builder_and_plan_reaches_round(self, tmp_path):
        seen = {}

        def planner(*, task, cfg, cwd):
            seen["planned_task"] = task
            return {"trivial": False, "plan_text": "## 設計\nルータ導入", "cost_usd": 0.05}

        def round_runner(**kwargs):
            seen["round_plan"] = kwargs.get("plan", "")
            return approved_round()

        gh = FakeGh(issues=[Issue(number=176, title="複数ページ化", labels=["loop:ready"])])
        result = run(tmp_path, gh=gh, proposals=(), planner=planner, round_runner_fn=round_runner)
        assert result.status == "merged"
        assert "複数ページ化" in seen["planned_task"]
        assert "ルータ導入" in seen["round_plan"]   # PLAN が round に渡っている

    def test_plan_review_rejection_replans_up_to_limit(self, tmp_path):
        calls = {"plan": 0, "review": 0}

        def planner(*, task, cfg, cwd):
            calls["plan"] += 1
            return {"trivial": False, "plan_text": f"plan-v{calls['plan']}", "cost_usd": 0.01}

        def plan_reviewer(*, task, plan, cfg, cwd):
            calls["review"] += 1
            # 1 回目は却下、2 回目は承認
            from orchestrator.models import AdversaryVerdict
            return AdversaryVerdict(approved=(calls["review"] >= 2), summary="s"), 0.01

        gh = FakeGh(issues=[Issue(number=5, title="t", labels=["loop:ready"])])
        result = run(tmp_path, gh=gh, proposals=(), planner=planner, plan_reviewer=plan_reviewer)
        assert calls["plan"] == 2        # 却下で 1 回再計画
        assert result.status == "merged"
```

- [ ] **Step 2: 失敗を確認**

Run: `python3 -m pytest tests/test_loop.py::TestPlanPhase -q`
Expected: FAIL（`run()` が `planner`/`plan_reviewer`/`round_runner_fn` を受け付けない）

- [ ] **Step 3: `run_iteration` に planner/plan-review を配線**

`orchestrator/loop.py`:

(a) `GhLike` の下に planner/plan-review の型注釈用フックを `run_iteration` の引数として追加（既定は本番実装を注入）。シグネチャに追加:

```python
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
    planner: Callable[..., dict] | None = None,
    plan_reviewer: Callable[..., tuple[Any, float]] | None = None,
) -> IterationResult:
```

(b) issue を pick した直後（現 `issue = min(ready, key=...)` の後、`branch = ...` の前）に PLAN フェーズを挿入:

```python
    # --- PLAN フェーズ: 自律 spec+plan → plan-review（build 前に筋を検証） ---
    plan_text = ""
    planner_cost = 0.0
    if planner is not None:
        task = f"{issue.title}\n\n(issue #{issue.number})"
        for attempt in range(cfg.max_plan_cycles + 1):
            p = planner(task=task, cfg=cfg, cwd=repo_root)
            planner_cost += float(p.get("cost_usd", 0.0))
            plan_text = "" if p.get("trivial") else str(p.get("plan_text", ""))
            if plan_reviewer is None or not plan_text:
                break
            verdict, review_cost = plan_reviewer(task=task, plan=plan_text, cfg=cfg, cwd=repo_root)
            planner_cost += float(review_cost)
            if verdict.approved:
                break
    # planner_cost は既存の記録経路に載せる（builder/ideation と別枠で足す）。
```

(c) `round_runner(...)` 呼び出しに `plan=plan_text` を渡す（現 189-194 行）:

```python
    outcome = round_runner(
        task=f"{issue.title}\n\n(issue #{issue.number})",
        diff_provider=lambda: gh.diff(cfg.base_branch),
        cwd=repo_root,
        cfg=cfg,
        plan=plan_text,
    )
```

> 注: 既存の `round_runner` フェイク（`tests/test_loop.py` の `def round_runner(**_kwargs)`）は `**kwargs` 受けなので `plan=` を渡しても壊れない。本番の `select_round_runner` が返す `run_native_round` は Task 5 で `plan` 引数を持つ。h5i 経路（`h5i_round.py`）にも `plan: str = ""` を受ける形へ後方互換で追加（Step 5）。

(d) `planner_cost` を記録に載せる: `_record`/`_abandon` に `planner_cost: float = 0.0` を通し、`CostBreakdown` に planner 分を足す（`CostBreakdown` に `planner_usd` が無ければ追加、あるいは既存 `ideation_usd` とは別に `builder_usd` に含めず新フィールド）。最小変更として `CostBreakdown(builder_usd=..., adversary_usd=..., ideation_usd=..., planner_usd=planner_cost)` とし、`models.py` の `CostBreakdown` に `planner_usd: float = 0.0` を追加。

- [ ] **Step 4: `run()` ヘルパを拡張**

`tests/test_loop.py` の `run(...)` に引数を追加し `run_iteration` へ委譲:

```python
def run(tmp_path, *, gh, disable_on_call=None, round_outcome=None, cfg=None,
        proposals=("next idea",), clock=None, ideation_runner=None,
        planner=None, plan_reviewer=None, round_runner_fn=None):
    ...
    def round_runner(**_kwargs):
        return round_outcome or approved_round()
    ...
    return run_iteration(
        gh=gh, cfg=cfg or Config.from_env({}), data_dir=tmp_path, repo_root=str(tmp_path),
        clock=clock or make_clock(), kill_switch_reader=kill_switch_reader,
        round_runner=round_runner_fn or round_runner,
        ideation_runner=ideation_runner or default_ideation,
        planner=planner, plan_reviewer=plan_reviewer,
    )
```

`approved_round()` に `builder_model_used="claude-sonnet-5"` を追加（Task 5 の新フィールド既定に合わせる。既定ありなので任意）。

- [ ] **Step 5: h5i 経路の後方互換**

`orchestrator/h5i_round.py` の round 関数シグネチャに `plan: str = ""` を受ける引数を追加（未使用でも受けるだけ。呼び出し側が `plan=` を渡すため）。

- [ ] **Step 6: 全テスト緑を確認（振る舞い保存の証明）**

Run: `python3 -m pytest -q`
Expected: PASS（既存 130 + 新規。既存が緑＝ run_iteration の振る舞いは保存されている）

- [ ] **Step 7: Commit**

```bash
git add orchestrator/loop.py orchestrator/h5i_round.py orchestrator/models.py tests/test_loop.py
git commit -m "feat(loop): PLAN フェーズ(自律 planner + plan-review)を run_iteration に配線"
```

---

## Task 7: `plan|build|gate` サブコマンド（CLI 分解）

**Files:**
- Modify: `orchestrator/__main__.py`
- Test: `tests/test_main_subcommands.py`

Phase B の workflow が各 job から呼ぶエントリ。ここでは**サブコマンドのディスパッチと handoff の入出力**を配線する（各フェーズの中核ロジックは Task 1-6 で実装済み・テスト済み）。ライブ loop.yml は引数なし `python -m orchestrator` を呼ぶので、**引数なし時は従来の一括 `main()` を維持**する（無影響）。

- [ ] **Step 1: 引数なしが従来動作を保つ回帰テスト（RED→即GREEN 設計）**

`tests/test_main_subcommands.py`:

```python
import sys

import orchestrator.__main__ as m


def test_no_args_dispatches_full_iteration(monkeypatch):
    called = {}
    monkeypatch.setattr(m, "_run_full_iteration", lambda: called.setdefault("full", True) or 0)
    monkeypatch.setattr(sys, "argv", ["orchestrator"])
    assert m.main() == 0
    assert called.get("full") is True


def test_plan_subcommand_dispatches_plan_phase(monkeypatch):
    called = {}
    monkeypatch.setattr(m, "_run_plan_phase", lambda: called.setdefault("plan", True) or 0)
    monkeypatch.setattr(sys, "argv", ["orchestrator", "plan"])
    assert m.main() == 0
    assert called.get("plan") is True
```

- [ ] **Step 2: 失敗を確認**

Run: `python3 -m pytest tests/test_main_subcommands.py -q`
Expected: FAIL（`_run_full_iteration` / `_run_plan_phase` 未定義、`main()` が引数を見ない）

- [ ] **Step 3: `main()` をディスパッチャ化**

`orchestrator/__main__.py`:

現行 `main()` の本体を `_run_full_iteration() -> int` にリネームし、新 `main()` を:

```python
def main() -> int:
    argv = sys.argv[1:]
    sub = argv[0] if argv else None
    if sub is None:
        return _run_full_iteration()
    if sub == "plan":
        return _run_plan_phase()
    if sub == "build":
        return _run_build_phase()
    if sub == "gate":
        return _run_gate_phase()
    print(json.dumps({"status": "failed", "error": f"unknown subcommand: {sub}"}, ensure_ascii=False))
    return 2
```

`_run_plan_phase` / `_run_build_phase` / `_run_gate_phase` は handoff を読み書きしつつ Task 1-6 の関数を呼ぶ薄いラッパ。まずは `_run_plan_phase` を実装し、残り 2 つはスタブ（`raise NotImplementedError` ではなく handoff を読み書きする最小実装）で置く。**Phase A の受け入れは「引数なし＝従来動作が完全維持」であり、サブコマンド本体の完全配線は Phase B で行う**（ここでは骨組みとディスパッチ + plan フェーズのみ）。

- [ ] **Step 4: 通過を確認**

Run: `python3 -m pytest tests/test_main_subcommands.py -q`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add orchestrator/__main__.py tests/test_main_subcommands.py
git commit -m "feat(cli): plan|build|gate サブコマンドのディスパッチを追加(引数なしは従来動作)"
```

---

## Task 8: 全体緑・spec 整合の最終確認

- [ ] **Step 1: 全テスト実行**

Run: `python3 -m pytest -q`
Expected: PASS（既存 130 + 本計画の新規すべて）

- [ ] **Step 2: ライブ無影響の確認**

`python -m orchestrator`（引数なし）が従来どおり 1 反復を実行することを目視確認（`_run_full_iteration` が旧 `main()` と同一ロジック）。loop.yml は未変更。

- [ ] **Step 3: PR 作成 → develop へ**

```bash
git push -u origin feat/superpowers-bookend-pipeline
gh pr create --base develop --title "feat: superpowers ブックエンド Phase A(planner/昇格/フェーズ分解)" --body "設計: docs/superpowers/specs/2026-07-24-...  計画: docs/superpowers/plans/2026-07-24-...-phase-a.md。ライブ loop.yml は無影響(引数なし=従来動作)。"
```

---

## Phase B/C（後続・別計画）

Phase A が develop で緑に稼働したら、別計画で:
- **Phase B:** `loop-v2.yml`（PLAN→BUILD→GATE の 3 ジョブ、`needs`＋`upload/download-artifact` で handoff 運搬、BUILD が branch push、GATE が merge）を追加し `workflow_dispatch` で検証。`_run_build_phase`/`_run_gate_phase` を完全配線。
- **Phase C:** 安定後に cron を loop.yml → loop-v2.yml へ切替（この YAML 変更のみ main 昇格が必要）。問題時は cron を戻すだけでロールバック。

### Phase B の必須前提（Phase A レビューで判明した積み残し）
- **planner コストの総額反映:** Task 6 では `CostBreakdown.planner_usd` を追加したが、`total_usd`/`to_dict()` には未反映（JSON 契約と既存テストを保つための意図的な範囲限定）。Phase A では planner が休眠のため無害だが、**Phase B で planner を実稼働させる前に** `planner_usd` を `total_usd` と `to_dict()`（＝run JSON / dashboard 型）に組み込むこと。さもないと**日次予算ブレーカが planner+plan-review 分だけ過少計上**する。対応時は該当の厳密キー JSON 契約テスト（`tests/test_models.py`）も併せて更新する。
- **planner フック実体の adapter:** `orchestrator/plan.py::propose_plan` は `PlanResult` を返すが、`run_iteration` の `planner` フックは dict `{trivial, plan_text, cost_usd}` を期待する。Phase B の `_run_plan_phase` 配線時に薄い adapter（`PlanResult` → dict）を噛ませる。
- **h5i 経路の plan 破棄:** `run_h5i_round` は `plan=` を受けるが無視する。`ORCHESTRATOR=h5i` で planner を有効化する場合、Phase B で h5i round に plan を実際に使わせる（現状はネイティブ経路のみ plan を消費）。
- **JSON 抽出の重複整理（任意）:** fenced/bare JSON 抽出ロジックが `plan.py`／`review.py`／`ideation.py` に3重複している（object 形と array 形）。将来の分岐を防ぐため共有ヘルパ（例 `orchestrator/_jsonx.py`）への集約を検討。現状は既存規約に沿った許容範囲の重複。

**昇格のライブ有効化について:** Phase A では builder モデル昇格を **plan 有効時のみ**に限定した（plan 無しの現行ライブループは従来どおり base モデル＝挙動・コスト不変）。昇格を planner 抜きでもライブ全体に効かせたい場合は、`_builder_model` の `if plan and ...` 条件を緩めるか config フラグ化する（人間判断で切替）。

## Self-Review（計画者による点検）

- **spec 網羅:** planner(§6)=Task3 / plan-review(§5)=Task4 / 昇格(§6)=Task5 / フェーズ分解(§5,§8)=Task6,7 / config(§7)=Task1 / handoff(§4)=Task2 / 段階移行(§13)=Task7+Phase B/C。網羅。
- **プレースホルダ:** 各ステップに実コード・実コマンド・期待出力を記載。TBD なし。
- **型整合:** `PlanResult`(plan.py) / `Handoff`(handoff.py) / `RoundOutcome.builder_model_used`(round.py) / `run_native_round(..., plan=)` / `run_iteration(..., planner=, plan_reviewer=)` はタスク間で一貫。planner フックの戻り値は dict（`trivial`/`plan_text`/`cost_usd`）で loop.py・test で一致。
