# superpowers ブックエンド Phase B1 実装計画（planner 実証）

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development. Steps use `- [ ]`.

**Goal:** planner が実際に妥当な計画を出すかを **安全・安価に実証**する。`plan` サブコマンドを実装（次の ready を拾って planner＋plan-review を走らせ計画を出力するだけ・build/merge しない）＋ 予算計上の前提修正 ＋ dispatch 専用 `loop-v2.yml` で CI 検証。

**Architecture:** run_iteration からロジックを壊さず、planner ループを共有ヘルパ `_run_planner` に抽出（run_iteration もそれを使う＝重複なし・既存テストで振る舞い保存）。新規 `plan_phase()` が kill-switch＋refuel＋FIFO pick＋`_run_planner` を行い、`_run_plan_phase` が handoff 書き出し＋計画出力。ライブ loop.yml は無改変。

**Tech Stack:** Python / pytest / 既存 FakeGh・FakeRunner。設計: `docs/superpowers/specs/2026-07-24-superpowers-bookend-pipeline-design.md`。

---

## Task 1: 予算計上の前提修正（planner_usd を total に算入）

**Files:** Modify `orchestrator/models.py`, `dashboard/src/lib/types.ts`; Test `tests/test_models.py`

- [ ] **Step 1: 失敗テスト** — `tests/test_models.py` に追記:
```python
def test_total_usd_includes_planner():
    from orchestrator.models import CostBreakdown
    c = CostBreakdown(builder_usd=0.1, adversary_usd=0.02, ideation_usd=0.01, planner_usd=0.05)
    assert c.total_usd == 0.18
    assert c.to_dict()["plannerUsd"] == 0.05
    assert c.to_dict()["totalUsd"] == 0.18
```
- [ ] **Step 2: FAIL 確認** — `python3 -m pytest tests/test_models.py`（total は planner を含まず 0.13、plannerUsd キー無し）。
- [ ] **Step 3: 実装** — `orchestrator/models.py` の `CostBreakdown`:
```python
    @property
    def total_usd(self) -> float:
        return round(self.builder_usd + self.adversary_usd + self.ideation_usd + self.planner_usd, 6)

    def to_dict(self) -> dict:
        return {
            "builderUsd": self.builder_usd,
            "adversaryUsd": self.adversary_usd,
            "ideationUsd": self.ideation_usd,
            "plannerUsd": self.planner_usd,
            "totalUsd": self.total_usd,
        }
```
- [ ] **Step 4: dashboard 型を 1:1 に** — `dashboard/src/lib/types.ts` の cost 型（`CostBreakdown` 相当）に `plannerUsd: number` を追加（`ideationUsd` の隣）。既存の総額表示があれば影響しない（追加キーのみ）。`cd dashboard && npm run verify` が緑になること。
- [ ] **Step 5: 既存テスト確認** — `python3 -m pytest`。既存 `test_models` の `totalUsd == 0.15`（planner_usd=0）は不変。全緑。
- [ ] **Step 6: Commit** — `git add orchestrator/models.py dashboard/src/lib/types.ts tests/test_models.py && git commit -m "fix(models): planner_usd を total/JSON に算入(予算過少計上を解消)"`

---

## Task 2: planner ループを共有ヘルパに抽出＋PlanResult→dict adapter

**Files:** Modify `orchestrator/loop.py`, `orchestrator/plan.py`; Test `tests/test_loop.py`, `tests/test_plan.py`

現状 run_iteration は planner ループをインラインで持つ。これを `_run_planner` に抽出し run_iteration からも呼ぶ（重複排除・振る舞い保存）。plan.py には `propose_plan`(PlanResult) を planner フックの dict 形に変換する adapter を足す。

- [ ] **Step 1: adapter の失敗テスト** — `tests/test_plan.py` に追記:
```python
def test_plan_dict_adapter_shapes_planresult():
    from orchestrator.plan import plan_dict_from_result, PlanResult
    d = plan_dict_from_result(PlanResult(trivial=False, plan_text="P", cost_usd=0.05))
    assert d == {"trivial": False, "plan_text": "P", "cost_usd": 0.05}
```
- [ ] **Step 2: FAIL 確認** — `python3 -m pytest tests/test_plan.py`（`plan_dict_from_result` 未定義）。
- [ ] **Step 3: 実装 adapter** — `orchestrator/plan.py` に:
```python
def plan_dict_from_result(result: "PlanResult") -> dict:
    """propose_plan の PlanResult を run_iteration の planner フック dict 形に変換する。"""
    return {"trivial": result.trivial, "plan_text": result.plan_text, "cost_usd": result.cost_usd}
```
- [ ] **Step 4: `_run_planner` 抽出（loop.py）** — 現 run_iteration 内の PLAN ループ（`if planner is not None:` ブロック）を関数へ:
```python
def _run_planner(*, issue, cfg, repo_root, planner, plan_reviewer) -> tuple[str, float]:
    """planner→plan-review を最大 max_plan_cycles 回。 (plan_text, planner_cost) を返す。
    planner が None なら ("", 0.0)。trivial は plan_text="" にして計画をスキップさせる。"""
    if planner is None:
        return "", 0.0
    task = f"{issue.title}\n\n(issue #{issue.number})"
    plan_text, cost = "", 0.0
    for _ in range(cfg.max_plan_cycles + 1):
        p = planner(task=task, cfg=cfg, cwd=repo_root)
        cost += float(p.get("cost_usd", 0.0))
        plan_text = "" if p.get("trivial") else str(p.get("plan_text", ""))
        if plan_reviewer is None or not plan_text:
            break
        verdict, review_cost = plan_reviewer(task=task, plan=plan_text, cfg=cfg, cwd=repo_root)
        cost += float(review_cost)
        if verdict.approved:
            break
    return plan_text, cost
```
run_iteration 内のインライン PLAN ブロックを `plan_text, planner_cost = _run_planner(issue=issue, cfg=cfg, repo_root=repo_root, planner=planner, plan_reviewer=plan_reviewer)` に置換（挙動同一）。
- [ ] **Step 5: 既存テスト＋抽出テスト** — `tests/test_loop.py::TestPlanPhase` の既存3テストが緑のまま（振る舞い保存）であることを確認。`python3 -m pytest`。
- [ ] **Step 6: Commit** — `git add orchestrator/loop.py orchestrator/plan.py tests/test_plan.py && git commit -m "refactor(loop): planner ループを _run_planner に抽出＋PlanResult adapter"`

---

## Task 3: `plan_phase()` ＋ `_run_plan_phase`（安全な計画専用実行）

**Files:** Modify `orchestrator/loop.py`, `orchestrator/__main__.py`, `orchestrator/handoff.py`(必要なら); Test `tests/test_loop.py`, `tests/test_main_subcommands.py`

`plan_phase` は kill-switch＋refuel＋FIFO pick＋`_run_planner` を実行し handoff 相当の結果を返す。build/merge はしない。`_run_plan_phase` はそれを呼び handoff.json に書き＋計画を stdout に出す。

- [ ] **Step 1: plan_phase の失敗テスト** — `tests/test_loop.py` に追記:
```python
class TestPlanPhaseFunction:
    def test_plan_phase_picks_oldest_and_returns_plan(self, tmp_path):
        from orchestrator.loop import plan_phase
        def planner(*, task, cfg, cwd):
            return {"trivial": False, "plan_text": "## 設計\nX", "cost_usd": 0.05}
        gh = FakeGh(issues=[
            Issue(number=9, title="new", labels=["loop:ready"]),
            Issue(number=3, title="old", labels=["loop:ready"]),
        ])
        res = plan_phase(gh=gh, cfg=Config.from_env({}), repo_root=str(tmp_path),
                         kill_switch_reader=lambda: True,
                         ideation_runner=lambda **k: ([], 0.0),
                         planner=planner, plan_reviewer=None)
        assert res.status == "ok"
        assert res.issue.number == 3           # FIFO 最古
        assert "## 設計" in res.plan_text
        assert res.branch == "loop/3-old"

    def test_plan_phase_no_work_when_empty(self, tmp_path):
        from orchestrator.loop import plan_phase
        gh = FakeGh(issues=[])
        res = plan_phase(gh=gh, cfg=Config.from_env({}), repo_root=str(tmp_path),
                         kill_switch_reader=lambda: True,
                         ideation_runner=lambda **k: ([], 0.0),
                         planner=None, plan_reviewer=None)
        assert res.status == "no-work"
```
- [ ] **Step 2: FAIL 確認** — `python3 -m pytest tests/test_loop.py::TestPlanPhaseFunction`（`plan_phase` 未定義）。
- [ ] **Step 3: 実装 plan_phase（loop.py）** — 戻り値 dataclass と関数:
```python
@dataclass(frozen=True)
class PlanPhaseResult:
    status: str            # "ok" | "no-work" | "skipped-disabled"
    issue: Issue | None = None
    branch: str = ""
    plan_text: str = ""
    planner_cost: float = 0.0
    ideation_cost: float = 0.0
    next_issues: tuple[int, ...] = ()


def plan_phase(*, gh, cfg, repo_root, kill_switch_reader, ideation_runner,
               planner, plan_reviewer) -> PlanPhaseResult:
    if not kill_switch_reader():
        return PlanPhaseResult(status="skipped-disabled")
    ready = gh.list_ready_issues(cfg.ready_label)
    ideation_cost, next_issues = _refuel_backlog(
        gh=gh, cfg=cfg, repo_root=repo_root, ready=ready, ideation_runner=ideation_runner)
    if next_issues:
        ready = gh.list_ready_issues(cfg.ready_label)
    if not ready:
        return PlanPhaseResult(status="no-work", ideation_cost=ideation_cost,
                               next_issues=tuple(next_issues))
    issue = min(ready, key=lambda i: i.number)
    branch = f"loop/{issue.number}-{slugify(issue.title)}"
    plan_text, planner_cost = _run_planner(
        issue=issue, cfg=cfg, repo_root=repo_root, planner=planner, plan_reviewer=plan_reviewer)
    return PlanPhaseResult(status="ok", issue=issue, branch=branch, plan_text=plan_text,
                           planner_cost=planner_cost, ideation_cost=ideation_cost,
                           next_issues=tuple(next_issues))
```
- [ ] **Step 4: `_run_plan_phase` 配線（__main__.py）** — スタブを実体に。handoff を書き、計画を出力:
```python
def _run_plan_phase() -> int:
    repo_root = Path(os.environ.get("REPO_ROOT", ".")).resolve()
    cfg = Config.from_env(os.environ)
    gh = GitHubOps(cwd=str(repo_root))

    def kill_switch_reader() -> bool:
        return read_kill_switch(env=os.environ, control=_read_control(repo_root)).enabled

    from orchestrator.loop import plan_phase
    from orchestrator.plan import propose_plan, plan_dict_from_result
    from orchestrator.review import review_plan

    def planner(*, task, cfg, cwd):
        return plan_dict_from_result(propose_plan(task=task, cfg=cfg, cwd=cwd))

    res = plan_phase(
        gh=gh, cfg=cfg, repo_root=str(repo_root),
        kill_switch_reader=kill_switch_reader, ideation_runner=_ideate,
        planner=planner, plan_reviewer=review_plan,
    )
    from orchestrator.handoff import Handoff, write_handoff
    handoff = Handoff(
        status="ok" if res.status == "ok" else "no-work",
        issue_number=(res.issue.number if res.issue else None),
        issue_title=(res.issue.title if res.issue else ""),
        branch=res.branch, plan=res.plan_text,
        trivial=(res.status == "ok" and not res.plan_text),
        planner_cost_usd=res.planner_cost,
        ideation_cost_usd=res.ideation_cost, next_issues=list(res.next_issues),
    )
    write_handoff(repo_root / "data" / "handoff" / "iteration.json", handoff)
    print(json.dumps({"status": res.status, "issue": (res.issue.number if res.issue else None),
                      "plan_preview": res.plan_text[:400]}, ensure_ascii=False))
    return 0
```
（`_ideate` は既存。`_run_full_iteration` は無改変。）
- [ ] **Step 5: dispatch テスト維持** — `tests/test_main_subcommands.py` の `_run_plan_phase` dispatch テストはモンキーパッチなので不変で緑。
- [ ] **Step 6: 全緑** — `python3 -m pytest`。
- [ ] **Step 7: Commit** — `git add orchestrator/loop.py orchestrator/__main__.py tests/test_loop.py && git commit -m "feat(plan): plan_phase と plan サブコマンド(計画専用・build/merge しない)"`

---

## Task 4: `loop-v2.yml`（dispatch 専用・plan 検証ジョブ）

**Files:** Create `.github/workflows/loop-v2.yml`

- [ ] **Step 1: 作成** — cron 無し・`workflow_dispatch` のみ。`python -m orchestrator plan` を1回実行し handoff を artifact 化。ライブ cron に一切触れない。
```yaml
name: loop-v2 (planner 検証)

# dispatch 専用。planner+plan-review が良い計画を出すか安全に検証する（build/merge しない）。
# cron は付けない — ライブは loop.yml のまま。3ジョブのブックエンド本配線は Phase B2。
on:
  workflow_dispatch:

permissions:
  contents: read
  issues: read

jobs:
  plan:
    runs-on: ubuntu-latest
    timeout-minutes: 20
    steps:
      - uses: actions/checkout@v4
        with:
          ref: develop
          fetch-depth: 0
      - uses: actions/setup-python@v5
        with:
          python-version: '3.12'
      - name: Install Claude Code CLI
        run: npm install -g @anthropic-ai/claude-code
      - name: Run plan phase (計画のみ)
        env:
          CLAUDE_CODE_OAUTH_TOKEN: ${{ secrets.CLAUDE_CODE_OAUTH_TOKEN }}
          GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}
          REPO_ROOT: ${{ github.workspace }}
          PLANNER_MODEL: ${{ vars.PLANNER_MODEL || 'claude-sonnet-5' }}
          ADVERSARY_MODEL: ${{ vars.ADVERSARY_MODEL || 'claude-haiku-4-5' }}
          IDEATION_MODEL: ${{ vars.IDEATION_MODEL || 'claude-haiku-4-5' }}
        run: python -m orchestrator plan
      - name: Upload handoff (計画の中身)
        if: always()
        uses: actions/upload-artifact@v4
        with:
          name: plan-handoff
          path: data/handoff/iteration.json
          if-no-files-found: warn
```
- [ ] **Step 2: YAML 妥当性** — `python3 -c "import yaml,sys; yaml.safe_load(open('.github/workflows/loop-v2.yml'))"` がエラー無し。
- [ ] **Step 3: Commit** — `git add .github/workflows/loop-v2.yml && git commit -m "ci(loop-v2): planner 検証用の dispatch 専用ワークフロー(計画のみ)"`

---

## Task 5: 全体緑・PR→develop

- [ ] `python3 -m pytest` 全緑。
- [ ] `git push -u origin <branch>` ＋ `gh pr create --base develop`（本文に「planner 実証段階・ライブ無影響・loop-v2 は dispatch 専用」）。
- [ ] マージ後、loop-v2.yml を main へ昇格（常設 develop→main PR 経由・人間がボタン）しないと dispatch 不可。昇格は dispatch 専用ゆえライブ無影響。昇格後 `gh workflow run loop-v2.yml` で planner の計画品質を目視検証。

## Phase B2（後続）
plan の品質が確認できたら: `build_phase`/`gate_phase` を run_iteration から抽出し `_run_build_phase`/`_run_gate_phase` を handoff＋branch push/merge で本配線、loop-v2.yml を PLAN→BUILD→GATE の3ジョブへ拡張、Phase C で cron 切替。

## Self-Review
- spec 網羅: 予算前提(§14)=Task1 / plan フェーズ(§5 PLAN)=Task2,3 / loop-v2(§13 Phase B)=Task4。build/gate は B2 に明示委譲。
- プレースホルダ: 実コード・実コマンド記載。
- 型整合: `PlanResult`/`plan_dict_from_result`(plan.py)、`PlanPhaseResult`/`plan_phase`/`_run_planner`(loop.py)、`Handoff`(handoff.py) は既存フィールドと一致。`_run_planner` は run_iteration と plan_phase の両方から使い重複なし。
