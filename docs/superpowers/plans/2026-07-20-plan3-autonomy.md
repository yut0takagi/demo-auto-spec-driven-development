# Plan 3: Autonomy — GitHub Actions で無人化し h5i 経路を差し込む

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Plan 2 のオーケストレータを GitHub Actions 上で cron 自走させ、停止用の UI ワークフローとサーキットブレーカを備え、最後に h5i-python 経路（`launcher="client"`）へ切り替える。

**Architecture:** `loop.yml` が 1 反復 = 1 ジョブとして `python -m orchestrator` を実行する。verify は `GITHUB_TOKEN` の連鎖トリガー制限（spec §14）を回避するためジョブ内で直接走らせる。停止は `LOOP_ENABLED` リポジトリ変数と `.loop/control.json` の二重化、加えて `control.yml` が GitHub UI からのボタン操作を提供する。h5i 経路は `round.py` に `run_h5i_round` を追加して `ORCHESTRATOR=h5i` で切替える。

**Tech Stack:** GitHub Actions / `gh` CLI / Claude Code CLI / h5i engine (Rust binary) / h5i-orchestra (Python SDK)

**関連 spec:** [2026-07-20-self-driving-loop-design.md](../specs/2026-07-20-self-driving-loop-design.md)
**前提:** Plan 1・Plan 2 完了（`pytest` 全緑、dry-run で 1 反復が完走する）

---

## File Structure

| パス | 責務 |
|---|---|
| `orchestrator/breaker.py` | サーキットブレーカの適用（判定は `gates.py` の純関数、こちらは副作用側） |
| `orchestrator/h5i_round.py` | h5i-python を `launcher="client"` で駆動する敵対ラウンド |
| `.github/workflows/loop.yml` | cron + 手動。1 実行 = 1 反復 |
| `.github/workflows/control.yml` | pause / resume / halt の UI ボタン |
| `.github/workflows/release.yml` | develop→main の昇格 PR を人間向けに開く |
| `.github/workflows/revert.yml` | develop の post-merge CI 失敗時に revert PR を自動生成 |

**分離の理由:** `gates.py`（純判定）と `breaker.py`（実際に変数を書き換え issue を立てる副作用）を分ける。判定ロジックは Plan 2 でテスト済みなので、こちらは薄く保つ。

---

## Task 1: サーキットブレーカの適用層

**Files:**
- Create: `orchestrator/breaker.py`
- Test: `tests/test_breaker.py`

- [ ] **Step 1: 失敗するテストを書く**

`tests/test_breaker.py`:

```python
from orchestrator.breaker import BreakerAction, check_breakers
from orchestrator.config import Config


def runs(*specs):
    """(verdict, cost, finishedAt) のタプル列から run dict を作る。"""
    return [
        {"verdict": v, "cost": {"totalUsd": c}, "finishedAt": f}
        for v, c, f in specs
    ]


def test_no_trip_on_healthy_history():
    action = check_breakers(
        runs(("merged", 0.1, "2026-07-20T01:00:00Z")),
        cfg=Config.from_env({}),
        today="2026-07-20",
    )
    assert action.should_halt is False
    assert action.reason == ""


def test_consecutive_failures_trip_the_breaker():
    action = check_breakers(
        runs(
            ("failed", 0.1, "2026-07-20T01:00:00Z"),
            ("needs-human", 0.1, "2026-07-20T02:00:00Z"),
            ("failed", 0.1, "2026-07-20T03:00:00Z"),
        ),
        cfg=Config.from_env({}),
        today="2026-07-20",
    )
    assert action.should_halt is True
    assert action.actor == "breaker:consecutive-failures"
    assert "3" in action.reason


def test_daily_budget_overrun_trips_the_breaker():
    action = check_breakers(
        runs(("merged", 3.0, "2026-07-20T01:00:00Z"), ("merged", 2.5, "2026-07-20T02:00:00Z")),
        cfg=Config.from_env({}),
        today="2026-07-20",
    )
    assert action.should_halt is True
    assert action.actor == "breaker:daily-budget"


def test_yesterdays_spend_does_not_trip_today():
    action = check_breakers(
        runs(("merged", 99.0, "2026-07-19T01:00:00Z")),
        cfg=Config.from_env({}),
        today="2026-07-20",
    )
    assert action.should_halt is False


def test_failure_breaker_takes_precedence_over_budget():
    action = check_breakers(
        runs(
            ("failed", 9.0, "2026-07-20T01:00:00Z"),
            ("failed", 9.0, "2026-07-20T02:00:00Z"),
            ("failed", 9.0, "2026-07-20T03:00:00Z"),
        ),
        cfg=Config.from_env({}),
        today="2026-07-20",
    )
    assert action.actor == "breaker:consecutive-failures"
```

- [ ] **Step 2: テストを実行して失敗を確認**

Run: `pytest tests/test_breaker.py -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'orchestrator.breaker'`

- [ ] **Step 3: `orchestrator/breaker.py` を実装**

```python
"""サーキットブレーカの適用。判定そのものは gates.py の純関数に委ねる。"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Mapping, Sequence

from orchestrator.config import Config
from orchestrator.gates import should_trip_breaker, spent_today_usd


@dataclass(frozen=True)
class BreakerAction:
    should_halt: bool
    reason: str = ""
    actor: str = ""


def check_breakers(
    runs: Sequence[Mapping], *, cfg: Config, today: str
) -> BreakerAction:
    verdicts = [str(r.get("verdict", "")) for r in runs]
    if should_trip_breaker(verdicts, k=cfg.circuit_breaker_fails):
        return BreakerAction(
            should_halt=True,
            reason=f"直近 {cfg.circuit_breaker_fails} 反復が連続でマージに至らなかった",
            actor="breaker:consecutive-failures",
        )

    spent = spent_today_usd(runs, today=today)
    if spent > cfg.daily_cost_budget_usd:
        return BreakerAction(
            should_halt=True,
            reason=f"本日のコスト ${spent:.2f} が予算 ${cfg.daily_cost_budget_usd:.2f} を超過した",
            actor="breaker:daily-budget",
        )

    return BreakerAction(should_halt=False)
```

- [ ] **Step 4: テストを実行して合格を確認**

Run: `pytest tests/test_breaker.py -v`
Expected: PASS — 5 passed

- [ ] **Step 5: `orchestrator/__main__.py` にブレーカを組み込む**

`main()` の `result = run_iteration(...)` の直後、`write_status(...)` の直前に挿入する:

```python
    from orchestrator.breaker import check_breakers
    from orchestrator.record import load_runs

    breaker = check_breakers(
        load_runs(data_dir), cfg=cfg, today=now[:10]
    )
    if breaker.should_halt:
        gh.create_issue(
            title=f"🛑 ループを自動停止しました: {breaker.actor}",
            body=(
                f"{breaker.reason}\n\n"
                "再開するには原因を確認したうえで:\n"
                "```bash\ngh variable set LOOP_ENABLED --body true\n```"
            ),
            labels=["loop:halted"],
        )
        write_status(
            data_dir, state="HALTED", reason=breaker.reason, actor=breaker.actor,
            resume_hint="原因を確認後 gh variable set LOOP_ENABLED --body true",
            now=now,
        )
        print(json.dumps({"status": "halted", "reason": breaker.reason}, ensure_ascii=False))
        return 0
```

- [ ] **Step 6: 全テストを実行**

Run: `pytest -v`
Expected: PASS — 88 passed（Plan 2 の 83 + breaker 5）

- [ ] **Step 7: コミット**

```bash
git add orchestrator/breaker.py orchestrator/__main__.py tests/test_breaker.py
git commit -m "feat(orchestrator): auto-halt on consecutive failures or budget overrun"
```

---

## Task 2: ループ用 GitHub Actions ワークフロー

**Files:**
- Create: `.github/workflows/loop.yml`

- [ ] **Step 1: `.github/workflows/loop.yml` を作成**

```yaml
name: loop

on:
  schedule:
    - cron: '*/30 * * * *'
  workflow_dispatch:
    inputs:
      dry_run:
        description: 'マージせず PR 作成までで止める'
        type: boolean
        default: false

concurrency:
  group: loop
  cancel-in-progress: false

permissions:
  contents: write
  pull-requests: write
  issues: write

jobs:
  iterate:
    # キルスイッチ L2: 変数が false ならジョブ自体を実行しない
    if: vars.LOOP_ENABLED != 'false'
    runs-on: ubuntu-latest
    timeout-minutes: 45

    steps:
      - uses: actions/checkout@v4
        with:
          ref: develop
          fetch-depth: 0

      - uses: actions/setup-node@v4
        with:
          node-version: '24'
          cache: npm
          cache-dependency-path: dashboard/package-lock.json

      - uses: actions/setup-python@v5
        with:
          python-version: '3.12'

      - name: Install dashboard deps
        working-directory: dashboard
        run: npm ci

      - name: Install Playwright browser
        working-directory: dashboard
        run: npx playwright install --with-deps chromium

      - name: Install Claude Code CLI
        run: npm install -g @anthropic-ai/claude-code

      - name: Configure git identity
        run: |
          git config user.name "loop-bot"
          git config user.email "loop-bot@users.noreply.github.com"

      - name: Run one iteration
        env:
          CLAUDE_CODE_OAUTH_TOKEN: ${{ secrets.CLAUDE_CODE_OAUTH_TOKEN }}
          GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}
          LOOP_ENABLED: ${{ vars.LOOP_ENABLED }}
          LOOP_DRY_RUN: ${{ inputs.dry_run && '1' || '0' }}
          ORCHESTRATOR: ${{ vars.ORCHESTRATOR || 'native' }}
          BUILDER_MODEL: ${{ vars.BUILDER_MODEL || 'claude-sonnet-5' }}
          ADVERSARY_MODEL: ${{ vars.ADVERSARY_MODEL || 'claude-haiku-4-5' }}
          IDEATION_MODEL: ${{ vars.IDEATION_MODEL || 'claude-haiku-4-5' }}
          REPO_ROOT: ${{ github.workspace }}
        run: python -m orchestrator

      - name: Commit run record to develop
        run: |
          git checkout develop
          git pull --rebase origin develop
          if [[ -n "$(git status --porcelain data/)" ]]; then
            git add data/
            git commit -m "chore(loop): record iteration [skip ci]"
            git push origin develop
          fi
```

- [ ] **Step 2: 必要な Secret と変数を登録**

```bash
claude setup-token   # 表示されたトークンをコピー
gh secret set CLAUDE_CODE_OAUTH_TOKEN
gh variable set LOOP_ENABLED --body true
gh variable set ORCHESTRATOR --body native
```

- [ ] **Step 3: `GITHUB_TOKEN` に PR 作成権限を許可**

```bash
gh api -X PUT repos/{owner}/{repo}/actions/permissions/workflow \
  -F default_workflow_permissions=write \
  -F can_approve_pull_request_reviews=true
```

Expected: 204 No Content

- [ ] **Step 4: コミットして dry-run で手動起動**

```bash
git add .github/workflows/loop.yml
git commit -m "ci: add autonomous loop workflow with kill switch"
git push
gh workflow run loop.yml -f dry_run=true
gh run watch
```

Expected: ジョブが success し、PR が作成されるが**マージされない**。

---

## Task 3: 停止用 UI ワークフロー

**Files:**
- Create: `.github/workflows/control.yml`

CLI を使わずに GitHub の画面から停止・再開できるようにする（spec §7 の L1'）。

- [ ] **Step 1: `.github/workflows/control.yml` を作成**

```yaml
name: control

on:
  workflow_dispatch:
    inputs:
      action:
        description: 'ループの制御'
        type: choice
        required: true
        options: [pause, resume, halt]
      reason:
        description: '理由（記録に残ります）'
        type: string
        default: '手動操作'

permissions:
  contents: write
  actions: write

jobs:
  control:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          ref: develop

      - name: Apply control action
        env:
          GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}
          ACTION: ${{ inputs.action }}
          REASON: ${{ inputs.reason }}
          ACTOR: ${{ github.actor }}
        run: |
          set -euo pipefail
          case "$ACTION" in
            pause|halt) ENABLED=false ;;
            resume)     ENABLED=true  ;;
          esac

          gh variable set LOOP_ENABLED --body "$ENABLED"

          STATE=$([[ "$ACTION" == "resume" ]] && echo RUNNING || \
                  ([[ "$ACTION" == "halt" ]] && echo HALTED || echo PAUSED))
          NOW=$(date -u +%Y-%m-%dT%H:%M:%SZ)

          cat > .loop/control.json <<EOF
          {
            "enabled": $ENABLED,
            "reason": "$REASON",
            "actor": "human:$ACTOR"
          }
          EOF

          cat > data/status.json <<EOF
          {
            "state": "$STATE",
            "reason": "$REASON",
            "actor": "human:$ACTOR",
            "updatedAt": "$NOW",
            "resumeHint": "control ワークフローを resume で実行する"
          }
          EOF

          git config user.name "loop-bot"
          git config user.email "loop-bot@users.noreply.github.com"
          git add .loop/control.json data/status.json
          git commit -m "chore(control): $ACTION by $ACTOR [skip ci]"
          git push origin develop

      - name: Disable the schedule when halting
        if: inputs.action == 'halt'
        env:
          GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}
        run: gh workflow disable loop.yml
```

- [ ] **Step 2: pause → resume を実際に試す**

```bash
git add .github/workflows/control.yml
git commit -m "ci: add pause/resume/halt control workflow"
git push

gh workflow run control.yml -f action=pause -f reason="停止機構の動作確認"
gh run watch
gh variable get LOOP_ENABLED
```

Expected: `false` が返る。ダッシュボードのバッジが `PAUSED` になる。

- [ ] **Step 3: 停止中はループが何もしないことを確認**

```bash
gh workflow run loop.yml
gh run watch
```

Expected: `iterate` ジョブが `if: vars.LOOP_ENABLED != 'false'` によりスキップされる。

- [ ] **Step 4: 再開する**

```bash
gh workflow run control.yml -f action=resume -f reason="確認完了"
gh run watch
```

Expected: `LOOP_ENABLED` が `true` に戻る。

---

## Task 4: revert と release のワークフロー

**Files:**
- Create: `.github/workflows/revert.yml`
- Create: `.github/workflows/release.yml`

- [ ] **Step 1: `.github/workflows/revert.yml` を作成**

develop の post-merge CI が落ちたら revert PR を自動で開く（spec §6 の可逆性担保）。

```yaml
name: revert-on-red

on:
  workflow_run:
    workflows: [ci]
    types: [completed]
    branches: [develop]

permissions:
  contents: write
  pull-requests: write

jobs:
  revert:
    if: github.event.workflow_run.conclusion == 'failure'
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          ref: develop
          fetch-depth: 0

      - name: Open a revert PR for the offending commit
        env:
          GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}
          SHA: ${{ github.event.workflow_run.head_sha }}
        run: |
          set -euo pipefail
          git config user.name "loop-bot"
          git config user.email "loop-bot@users.noreply.github.com"

          BRANCH="revert/${SHA::7}"
          git checkout -b "$BRANCH"
          git revert --no-edit "$SHA"
          git push -u origin "$BRANCH"

          gh pr create --base develop --head "$BRANCH" \
            --title "revert: ${SHA::7} (develop の CI が赤になったため)" \
            --body "develop の post-merge CI が失敗したため自動的に revert PR を作成しました。人間の確認が必要です。"
```

- [ ] **Step 2: `.github/workflows/release.yml` を作成**

develop→main の昇格 PR を人間向けに開く（main は人間ゲート）。

```yaml
name: release

on:
  schedule:
    - cron: '0 0 * * 1'
  workflow_dispatch:

permissions:
  contents: read
  pull-requests: write

jobs:
  promote:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0

      - name: Open promotion PR if develop is ahead
        env:
          GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}
        run: |
          set -euo pipefail
          AHEAD=$(git rev-list --count origin/main..origin/develop)
          if [[ "$AHEAD" -eq 0 ]]; then
            echo "develop は main と同じ。昇格 PR は不要。"
            exit 0
          fi
          if gh pr list --base main --head develop --state open --json number -q 'length' | grep -qv '^0$'; then
            echo "昇格 PR は既に開いている。"
            exit 0
          fi
          gh pr create --base main --head develop \
            --title "release: develop を main に昇格 ($AHEAD commits)" \
            --body "自走ループが develop に積んだ $AHEAD 件の変更を main へ昇格します。**マージは人間が判断してください。**"
```

- [ ] **Step 3: コミットして push**

```bash
git add .github/workflows/revert.yml .github/workflows/release.yml
git commit -m "ci: add auto-revert on red develop and human-gated release PR"
git push
```

- [ ] **Step 4: release を手動実行して確認**

```bash
gh workflow run release.yml
gh run watch
gh pr list --base main
```

Expected: develop が main より進んでいれば昇格 PR が 1 件開く。

---

## Task 5: 初回の実走（自動マージを 1 反復）

**Files:** なし（運用手順）

- [ ] **Step 1: 種 issue が存在することを確認**

```bash
gh issue list --label "loop:ready"
```

Expected: 1 件以上。無ければ Plan 2 Task 13 の手順で作成する。

- [ ] **Step 2: dry-run ではなく本番で 1 反復を起動**

```bash
gh workflow run loop.yml -f dry_run=false
gh run watch
```

Expected: ジョブが success。PR が作成され、adversary のレビューコメントが付き、ゲート通過なら squash マージされる。

- [ ] **Step 3: 結果を確認**

```bash
gh pr list --state merged --limit 3
gh issue list --label "loop:ready"
cat data/runs/*.json | tail -40
```

Expected: PR がマージ済み、新しい `loop:ready` issue が 1〜3 件生成され、`data/runs/` に記録が増えている。

- [ ] **Step 4: ダッシュボードに反映されたことを確認**

```bash
gh run list --workflow=pages.yml --limit 1
```

Expected: `pages` が success し、公開 URL に新しい反復が表示される。

---

## Task 6: h5i 経路の実装

**Files:**
- Create: `orchestrator/h5i_round.py`
- Test: `tests/test_h5i_round.py`
- Modify: `orchestrator/__main__.py`

ここまでで native 経路の自走が緑になっている前提で、h5i-python を差し込む。

- [ ] **Step 1: h5i エンジンと SDK をインストール（ローカル検証用）**

```bash
curl -fsSL https://raw.githubusercontent.com/h5i-dev/h5i/main/install.sh | sh
pip install h5i-orchestra
h5i --version
```

Expected: h5i のバージョンが表示される。

- [ ] **Step 2: 失敗するテストを書く**

`tests/test_h5i_round.py`:

```python
import pytest

from orchestrator.config import Config
from orchestrator.h5i_round import build_turn_prompt, select_round_runner
from orchestrator.round import run_native_round


def test_selects_native_by_default():
    assert select_round_runner(Config.from_env({})) is run_native_round


def test_selects_h5i_when_configured():
    runner = select_round_runner(Config.from_env({"ORCHESTRATOR": "h5i"}))
    assert runner is not run_native_round
    assert runner.__name__ == "run_h5i_round"


def test_unknown_orchestrator_falls_back_to_native():
    assert select_round_runner(Config.from_env({"ORCHESTRATOR": "bogus"})) is run_native_round


def test_turn_prompt_includes_task_and_role():
    prompt = build_turn_prompt(role="builder", task="add chart", materials="")
    assert "add chart" in prompt
    assert "builder" in prompt.lower()


def test_turn_prompt_includes_materials_when_present():
    prompt = build_turn_prompt(role="adversary", task="t", materials="diff --git a/x")
    assert "diff --git a/x" in prompt
```

- [ ] **Step 3: テストを実行して失敗を確認**

Run: `pytest tests/test_h5i_round.py -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'orchestrator.h5i_round'`

- [ ] **Step 4: `orchestrator/h5i_round.py` を実装**

h5i を `launcher="client"` で駆動し、`on_turn` の中で Claude CLI にシェルアウトする。これにより tmux が不要になる（spec §4）。

```python
"""h5i-python を launcher="client" で駆動する敵対ラウンド。

on_turn コールバックの中で Claude CLI にシェルアウトするため tmux を必要とせず、
GitHub 管理ランナー上でそのまま動作する。
"""

from __future__ import annotations

import asyncio
from typing import Callable

from orchestrator.claude_cli import run_agent
from orchestrator.config import Config
from orchestrator.review import ADVERSARY_PROMPT_TEMPLATE, parse_adversary_review
from orchestrator.round import (
    BUILDER_PROMPT_TEMPLATE,
    RoundOutcome,
    run_native_round,
)
from orchestrator.shell import Runner, real_runner

TURN_PROMPT_TEMPLATE = """\
あなたは h5i オーケストラの `{role}` シートです。
自分の worktree の中だけで作業し、他のシートの作業領域には触れないでください。

## タスク
{task}
{materials_section}
"""


def build_turn_prompt(*, role: str, task: str, materials: str) -> str:
    materials_section = f"\n## 参考資料\n{materials}\n" if materials else ""
    return TURN_PROMPT_TEMPLATE.format(
        role=role, task=task, materials_section=materials_section
    )


def run_h5i_round(
    *,
    task: str,
    diff_provider: Callable[[], str],
    cwd: str,
    cfg: Config,
    runner: Runner = real_runner,
) -> RoundOutcome:
    return asyncio.run(
        _run_h5i_round_async(
            task=task, diff_provider=diff_provider, cwd=cwd, cfg=cfg, runner=runner
        )
    )


async def _run_h5i_round_async(
    *,
    task: str,
    diff_provider: Callable[[], str],
    cwd: str,
    cfg: Config,
    runner: Runner,
) -> RoundOutcome:
    from h5i.orchestra import Conductor  # 遅延 import: native 経路では不要

    costs = {"builder": 0.0, "adversary": 0.0}

    async def on_turn(ctx):
        """h5i が各シートのターンを要求したときに呼ばれる。"""
        role = ctx.agent_id
        model = cfg.builder_model if role == "builder" else cfg.adversary_model
        prompt = build_turn_prompt(
            role=role, task=ctx.prompt or task, materials=diff_provider()
        )
        result = await asyncio.to_thread(
            run_agent, prompt, model=model, cwd=cwd, runner=runner
        )
        costs[role if role in costs else "builder"] += result.cost_usd
        return result.text

    async with Conductor(
        repo=cwd, run=f"loop-{abs(hash(task)) % 10**8}",
        launcher="client", on_turn=on_turn,
    ) as c:
        builder = await c.hire("builder", runtime="claude", model=cfg.builder_model)
        adversary = await c.hire("adversary", runtime="claude", model=cfg.adversary_model)

        artifact = await builder.work(BUILDER_PROMPT_TEMPLATE.format(task=task))
        await c.freeze()

        review = await adversary.review(artifact)
        verdict = parse_adversary_review(getattr(review, "body", "") or "")

        cycles = 0
        while not verdict.approved and cycles < cfg.max_revise_cycles:
            cycles += 1
            artifact = await builder.revise(artifact, review)
            review = await adversary.review(artifact)
            verdict = parse_adversary_review(getattr(review, "body", "") or "")

        verification = await c.verify(artifact, ["npm", "run", "verify"])
        e2e = await c.verify(artifact, ["npm", "run", "test:e2e"])
        await c.judge()

    return RoundOutcome(
        adversary=verdict,
        revise_cycles=cycles,
        verify_passed=bool(getattr(verification, "tests_passed", False)),
        e2e_passed=bool(getattr(e2e, "tests_passed", False)),
        builder_cost_usd=round(costs["builder"], 6),
        adversary_cost_usd=round(costs["adversary"], 6),
    )


def select_round_runner(cfg: Config) -> Callable[..., RoundOutcome]:
    """設定に応じてラウンド実装を選ぶ。未知の値は安全側で native に倒す。"""
    if cfg.orchestrator == "h5i":
        return run_h5i_round
    return run_native_round
```

- [ ] **Step 5: テストを実行して合格を確認**

Run: `pytest tests/test_h5i_round.py -v`
Expected: PASS — 5 passed

- [ ] **Step 6: `orchestrator/__main__.py` を切替対応にする**

`from orchestrator.round import run_native_round` を次に置き換える:

```python
from orchestrator.h5i_round import select_round_runner
```

`run_iteration(...)` の `round_runner=run_native_round,` を次に置き換える:

```python
        round_runner=select_round_runner(cfg),
```

- [ ] **Step 7: 全テストを実行**

Run: `pytest -v`
Expected: PASS — 全テストが合格

- [ ] **Step 8: コミット**

```bash
git add orchestrator/h5i_round.py orchestrator/__main__.py tests/test_h5i_round.py
git commit -m "feat(orchestrator): add h5i-backed round selectable via ORCHESTRATOR env"
```

---

## Task 7: CI に h5i を導入して切替

**Files:**
- Modify: `.github/workflows/loop.yml`

- [ ] **Step 1: `loop.yml` に h5i インストール手順を追加**

`Install Claude Code CLI` ステップの直後に挿入する:

```yaml
      - name: Install h5i engine and SDK
        if: vars.ORCHESTRATOR == 'h5i'
        run: |
          curl -fsSL https://raw.githubusercontent.com/h5i-dev/h5i/main/install.sh | sh
          echo "$HOME/.local/bin" >> "$GITHUB_PATH"
          pip install h5i-orchestra

      - name: Verify h5i is runnable headless
        if: vars.ORCHESTRATOR == 'h5i'
        run: h5i --version
```

- [ ] **Step 2: コミットして push**

```bash
git add .github/workflows/loop.yml
git commit -m "ci: install h5i engine when ORCHESTRATOR=h5i"
git push
```

- [ ] **Step 3: h5i 経路に切り替えて dry-run**

```bash
gh variable set ORCHESTRATOR --body h5i
gh workflow run loop.yml -f dry_run=true
gh run watch
```

Expected: `h5i --version` が成功し、1 反復が dry-run で完走する。

- [ ] **Step 4: 失敗した場合は native に戻す**

h5i がランナー上で headless 動作しない場合は、原因を issue に記録したうえで安全に戻す:

```bash
gh variable set ORCHESTRATOR --body native
gh issue create --title "h5i 経路が CI で動作しない" \
  --body "$(gh run view --log-failed | tail -50)" --label "loop:needs-human"
```

native 経路のまま自走は継続できる（フォールバック設計の目的）。

---

## Task 8: cron 自走の開始

**Files:** なし（運用手順）

- [ ] **Step 1: 停止手順が機能することを最終確認**

```bash
gh workflow run control.yml -f action=pause -f reason="自走開始前の最終確認"
gh run watch
gh variable get LOOP_ENABLED
```

Expected: `false`

- [ ] **Step 2: 再開して cron を有効化**

```bash
gh workflow run control.yml -f action=resume -f reason="自走開始"
gh workflow enable loop.yml
```

- [ ] **Step 3: 最初の自動起動を待って観測**

```bash
gh run list --workflow=loop.yml --limit 5
```

Expected: cron により 30 分以内に自動起動している。

- [ ] **Step 4: README に公開ダッシュボードの URL を追記**

アカウント名を直書きせず、実際の値を埋めて生成する:

```bash
OWNER=$(gh repo view --json owner -q .owner.login)
REPO=$(gh repo view --json name -q .name)
python - "$OWNER" "$REPO" <<'PY'
import sys, pathlib
owner, repo = sys.argv[1], sys.argv[2]
section = f"""## 稼働状況

[![pages](https://github.com/{owner}/{repo}/actions/workflows/pages.yml/badge.svg)](https://github.com/{owner}/{repo}/actions/workflows/pages.yml)

ライブダッシュボード: https://{owner}.github.io/{repo}/

"""
path = pathlib.Path("README.md")
text = path.read_text(encoding="utf-8")
path.write_text(text.replace("## 🛑 今すぐ止める", section + "## 🛑 今すぐ止める", 1), encoding="utf-8")
PY
```

Expected: README に稼働状況セクションが「🛑 今すぐ止める」の直前へ挿入される。

- [ ] **Step 5: コミット**

```bash
git add README.md
git commit -m "docs: link the live dashboard"
git push
```

---

## Plan 3 完了条件

- [ ] `pytest` が全緑
- [ ] `loop.yml` が cron で自動起動し、無人で 1 反復を完走する
- [ ] `control.yml` の pause で次の反復が確実にスキップされる
- [ ] ゲート不通過時にマージされず `loop:needs-human` が付く
- [ ] 連続失敗・予算超過でブレーカが作動し `loop:halted` issue が立つ
- [ ] develop の CI が赤になったら revert PR が自動で開く
- [ ] `main` は人間がマージしない限り変化しない
- [ ] ダッシュボードが反復ごとに自動更新される

---

## 運用リファレンス

| したいこと | コマンド |
|---|---|
| 今すぐ完全停止 | `gh workflow disable loop.yml` |
| 一時停止 | `gh workflow run control.yml -f action=pause -f reason="..."` |
| 再開 | `gh workflow run control.yml -f action=resume -f reason="..."` |
| 実行中を中断 | `gh run cancel $(gh run list --workflow=loop.yml --status=in_progress --json databaseId -q '.[0].databaseId')` |
| 1 反復だけ手動実行 | `gh workflow run loop.yml -f dry_run=false` |
| コストを確認 | `jq -s 'map(.cost.totalUsd) \| add' data/runs/*.json` |
| モデルを変更 | `gh variable set BUILDER_MODEL --body claude-haiku-4-5` |
| 予算を変更 | `gh variable set DAILY_COST_BUDGET_USD --body 10` |
