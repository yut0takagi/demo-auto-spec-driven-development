# superpowers ブックエンド Phase B2 実装計画（planner を実装パイプラインに本配線）

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development. Steps use `- [ ]`.

**Goal:** planner を full-iteration に本配線し、**計画に沿ったビルド**（plan→build→verify/e2e/adversary→gate）を実現する。`LOOP_PLANNING` フラグで有効化（既定 off ＝ ライブ loop.yml 無改変）。loop-v2.yml を full-iteration 化して dry-run で本番同型検証。

**Architecture:** Phase A で `run_iteration` は planner/plan_reviewer フック経由で plan→build→gate を1プロセスで通せる（休眠）。B2 は `_run_full_iteration` がフラグ有効時にそのフックを注入するだけ。3ジョブ物理分割はしない（in-process 完結）。

**Tech Stack:** Python / pytest。設計: `docs/superpowers/specs/2026-07-24-superpowers-bookend-pipeline-design.md`。Phase B1(#202) 済み。

---

## Task 1: `LOOP_PLANNING` フラグ＋planner フック注入

**Files:** Modify `orchestrator/config.py`, `orchestrator/__main__.py`; Test `tests/test_config.py`, `tests/test_main_subcommands.py`

- [ ] **Step 1: config 失敗テスト** — `tests/test_config.py`:
```python
def test_planning_enabled_flag():
    assert Config.from_env({}).planning_enabled is False
    assert Config.from_env({"LOOP_PLANNING": "1"}).planning_enabled is True
    assert Config.from_env({"LOOP_PLANNING": "true"}).planning_enabled is True
```
- [ ] **Step 2: FAIL 確認** — `python3 -m pytest tests/test_config.py`.
- [ ] **Step 3: config 実装** — `orchestrator/config.py`:
  - dataclass に `planning_enabled: bool = False`（既存 `dry_run: bool = False` の近く）
  - `from_env` に `planning_enabled=_flag(env, "LOOP_PLANNING"),`
- [ ] **Step 4: hooks ヘルパの失敗テスト** — `tests/test_main_subcommands.py`:
```python
def test_make_planner_hooks_off_by_default():
    import orchestrator.__main__ as m
    from orchestrator.config import Config
    planner, reviewer = m._make_planner_hooks(Config.from_env({}))
    assert planner is None and reviewer is None

def test_make_planner_hooks_on_when_enabled():
    import orchestrator.__main__ as m
    from orchestrator.config import Config
    from orchestrator.review import review_plan
    planner, reviewer = m._make_planner_hooks(Config.from_env({"LOOP_PLANNING": "1"}))
    assert callable(planner)
    assert reviewer is review_plan
```
- [ ] **Step 5: FAIL 確認** — `python3 -m pytest tests/test_main_subcommands.py`.
- [ ] **Step 6: hooks 実装（__main__.py）** — モジュール先頭付近の import に `from orchestrator.plan import propose_plan, plan_dict_from_result` / `from orchestrator.review import review_plan` を追加し:
```python
def _make_planner_hooks(cfg: Config):
    """planning_enabled のとき (planner, plan_reviewer) を返す。無効なら (None, None)。
    planner は propose_plan を run_iteration のフック dict 形に橋渡しする。"""
    if not cfg.planning_enabled:
        return None, None

    def planner(*, task, cfg, cwd):
        return plan_dict_from_result(propose_plan(task=task, cfg=cfg, cwd=cwd))

    return planner, review_plan
```
- [ ] **Step 7: `_run_full_iteration` に注入** — 現行の `run_iteration(...)` 呼び出しに以下を追加（他引数は不変）:
```python
        planner_hook, plan_reviewer_hook = _make_planner_hooks(cfg)
        result = run_iteration(
            gh=gh, cfg=cfg, data_dir=data_dir, repo_root=str(repo_root),
            clock=_utc_now, kill_switch_reader=kill_switch_reader,
            round_runner=select_round_runner(cfg), ideation_runner=_ideate,
            planner=planner_hook, plan_reviewer=plan_reviewer_hook,
        )
```
（`planning_enabled` 既定 off ゆえ、ライブ loop.yml（`LOOP_PLANNING` 未設定）は `planner=None` で従来動作を厳密に維持。）
- [ ] **Step 8: 全緑** — `python3 -m pytest`（既存＋新規 5）。既存の `_run_full_iteration` 系テストが緑のまま＝ライブ経路不変。
- [ ] **Step 9: Commit** — `git add orchestrator/config.py orchestrator/__main__.py tests/test_config.py tests/test_main_subcommands.py && git commit -m "feat(loop): LOOP_PLANNING で planner を full-iteration に本配線(既定off)"`

---

## Task 2: loop-v2.yml を full-iteration 化（planning＋dry-run 検証）

**Files:** Modify `.github/workflows/loop-v2.yml`

plan-only ジョブに加え、**計画に沿ったビルド**を本番同型（dry-run）で検証する full-iteration ジョブを持たせる。dispatch 入力 `dry_run`（既定 true）でマージ有無を選ぶ。

- [ ] **Step 1: 置換** — `.github/workflows/loop-v2.yml` を以下に（loop.yml のビルド設定を流用しつつ planning を有効化。cron は付けない）:
```yaml
name: loop-v2 (planner 本配線)

# dispatch 専用。planner を有効化した full-iteration を検証する。
# dry_run=true(既定): plan→build→verify→e2e→adversary まで通し、マージしない（安全）。
# dry_run=false: 実際に develop へマージ（計画に沿ったビルドを本番投入）。
# cron は付けない — ライブ定期実行は loop.yml のまま。
on:
  workflow_dispatch:
    inputs:
      dry_run:
        description: 'true=マージしない(検証) / false=develop へマージ'
        type: boolean
        default: true

permissions:
  contents: write
  pull-requests: write
  issues: write

concurrency:
  group: loop-v2
  cancel-in-progress: false

jobs:
  iterate:
    runs-on: ubuntu-latest
    timeout-minutes: 60
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
      - name: Run planned iteration
        env:
          CLAUDE_CODE_OAUTH_TOKEN: ${{ secrets.CLAUDE_CODE_OAUTH_TOKEN }}
          GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}
          REPO_ROOT: ${{ github.workspace }}
          LOOP_PLANNING: '1'
          LOOP_DRY_RUN: ${{ inputs.dry_run && '1' || '0' }}
          BUILDER_MODEL: ${{ vars.BUILDER_MODEL || 'claude-sonnet-5' }}
          PLANNER_MODEL: ${{ vars.PLANNER_MODEL || 'claude-sonnet-5' }}
          ADVERSARY_MODEL: ${{ vars.ADVERSARY_MODEL || 'claude-haiku-4-5' }}
          IDEATION_MODEL: ${{ vars.IDEATION_MODEL || 'claude-haiku-4-5' }}
          DAILY_COST_BUDGET_USD: ${{ vars.DAILY_COST_BUDGET_USD || '100' }}
        run: python -m orchestrator
      - name: Record data (dry-run 検証時も記録を残す)
        if: always()
        run: |
          if [[ -n "$(git status --porcelain data/)" ]]; then
            git add data/ && git commit -m "chore(loop-v2): record [skip ci]" || true
          fi
      - name: Upload run record
        if: always()
        uses: actions/upload-artifact@v4
        with:
          name: loop-v2-data
          path: data/
          if-no-files-found: warn
```
（注: `python -m orchestrator`（引数なし）は `_run_full_iteration` を呼ぶ。`LOOP_PLANNING=1` で planner が有効化される。plan-only の `python -m orchestrator plan` も引き続き使える。）
- [ ] **Step 2: YAML 妥当性** — `python3 -c "import yaml; yaml.safe_load(open('.github/workflows/loop-v2.yml')); print('OK')"`.
- [ ] **Step 3: 全 python 緑** — `python3 -m pytest`（ワークフローのみなのでテスト数不変）。
- [ ] **Step 4: Commit** — `git add .github/workflows/loop-v2.yml && git commit -m "ci(loop-v2): planner有効の full-iteration を dry-run 検証付きで実行"`

---

## Task 3: 全体緑・PR→develop

- [ ] `python3 -m pytest` 全緑。
- [ ] push＋`gh pr create --base develop`（本文: planner 本配線・既定off・ライブ無影響・loop-v2 で dry-run 検証可）。
- [ ] マージ後 loop-v2.yml を main 昇格（常設PRボタン）→ `gh workflow run loop-v2.yml`（dry_run=true）で**計画に沿ったビルドが verify/e2e/adversary を通るか**検証。良ければ dry_run=false で実マージ、または Phase C で cron 切替。

## 積み残し / Phase C
- h5i round の plan 消費（`ORCHESTRATOR=h5i` 時）。native 既定では不要。
- Phase C: cron を loop.yml→loop-v2.yml へ切替（planner をライブ定期実行に。YAML 変更のみ main 昇格必要）。

## Self-Review
- spec 網羅: planner 本配線(§4 BUILD)=Task1 / 検証ワークフロー(§13 Phase B)=Task2。
- 型整合: `planning_enabled`(config)、`_make_planner_hooks`(__main__)、`propose_plan`/`plan_dict_from_result`(plan.py)、`review_plan`(review.py)、`run_iteration(planner=, plan_reviewer=)`(loop.py) は既存と一致。
- ライブ不変: `planning_enabled` 既定 False ＋ loop.yml は `LOOP_PLANNING` 未設定 ＝ planner=None で従来動作。
