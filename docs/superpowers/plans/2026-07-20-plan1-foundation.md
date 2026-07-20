# Plan 1: Foundation — 自己観測ダッシュボードと CI/デプロイ基盤

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** ループの実行記録（`data/runs/*.json`）を可視化する静的ダッシュボードを構築し、CI（lint/type/unit/E2E）と GitHub Pages 自動デプロイを緑にする。

**Architecture:** リポジトリ直下に `dashboard/`（Next.js App Router, static export）、`data/`（ループが書き込む JSON 記録）を置く。ダッシュボードはビルド時に `../data` を fs で読み、純関数の集計層（`lib/aggregate.ts`）を通して表示する。集計層は副作用がないため TDD の主対象になる。`npm run verify` が後続 Plan で agent が越える verify ゲートそのものになる。

**Tech Stack:** Next.js 15 (App Router, `output: 'export'`) / TypeScript / Tailwind CSS / Vitest / Playwright / GitHub Actions / GitHub Pages

**関連 spec:** [2026-07-20-self-driving-loop-design.md](../specs/2026-07-20-self-driving-loop-design.md)

---

## File Structure

このプランで作成するファイルと責務:

| パス | 責務 |
|---|---|
| `dashboard/src/lib/types.ts` | **全プラン共通のデータ契約**。`RunRecord` / `LoopStatus` の型定義。Plan 2 の Python 側はこれに一致する JSON を出力する |
| `dashboard/src/lib/aggregate.ts` | 純関数の集計層。`summarize` / `coverageTrend` / `costTrend`。副作用なし＝TDD対象 |
| `dashboard/src/lib/loadData.ts` | ビルド時に `../data` を fs で読む I/O 層。集計層とは分離 |
| `dashboard/src/components/StatusBadge.tsx` | RUNNING/PAUSED/HALTED バッジ＋停止理由・再開手順の表示 |
| `dashboard/src/components/MetricCards.tsx` | 集計サマリのカード群 |
| `dashboard/src/components/IterationTimeline.tsx` | 反復履歴のタイムライン |
| `dashboard/src/components/TrendChart.tsx` | カバレッジ／コスト推移の SVG チャート（依存追加を避け自前実装） |
| `dashboard/src/app/page.tsx` | 上記を組み立てるトップページ |
| `data/status.json` | ループ稼働状態。Plan 2/3 が書き換える |
| `data/runs/*.json` | 反復ごとの記録。Plan 2 が追記する |
| `.github/workflows/ci.yml` | lint/typecheck/unit/build/E2E |
| `.github/workflows/pages.yml` | static export → GitHub Pages |
| `README.md` | 最上部に停止手順 |

**分離の理由:** `loadData`（I/O）と `aggregate`（純関数）を分けることで、集計ロジックをファイルシステムなしでテストできる。コンポーネントは集計済みデータを受け取るだけにし、表示とロジックを混ぜない。

---

## Task 1: リポジトリの初期化と GitHub への作成

**Files:**
- Create: `.gitignore`
- Create: `README.md`

- [ ] **Step 1: `.gitignore` を作成**

```gitignore
node_modules/
.next/
out/
coverage/
playwright-report/
test-results/
__pycache__/
*.pyc
.venv/
.env
.DS_Store
```

- [ ] **Step 2: `README.md` を作成（停止手順を最上部に）**

````markdown
# demo-auto-spec-driven-development

Issue を自分で立て、実装し、敵対的レビューを受け、PR を出し、`develop` へ自動マージし、次の改善 Issue を立てる — を無人で繰り返す自走リポジトリ。育てている題材は「ループ自身の稼働を可視化する自己観測ダッシュボード」。

## 🛑 今すぐ止める

```bash
gh workflow disable loop.yml          # cron を停止（最も確実）
gh run cancel $(gh run list --workflow=loop.yml --status=in_progress --json databaseId -q '.[0].databaseId')
```

一時停止のみなら:

```bash
gh variable set LOOP_ENABLED --body false
```

停止しても不可逆な操作は走らない。最悪でもレビュー待ちの open PR が残るだけ。再開は `gh workflow enable loop.yml` / `gh variable set LOOP_ENABLED --body true`。

## 設計

[docs/superpowers/specs/2026-07-20-self-driving-loop-design.md](docs/superpowers/specs/2026-07-20-self-driving-loop-design.md)

## ブランチ

- `main` — 保護。`develop` からの昇格は人間のみ
- `develop` — ループがゲート通過時に自動マージする統合ブランチ
- `loop/<issue#>-<slug>` — 各反復の作業ブランチ
````

- [ ] **Step 3: コミット**

```bash
git add .gitignore README.md
git commit -m "chore: add gitignore and README with stop instructions"
```

- [ ] **Step 4: GitHub にリポジトリを作成して push**

```bash
gh repo create demo-auto-spec-driven-development --public --source=. --remote=origin --push
```

Expected: リポジトリが作成され `main` が push される。

- [ ] **Step 5: `develop` ブランチを作成して push**

```bash
git checkout -b develop
git push -u origin develop
```

Expected: `develop` が origin に存在する。

---

## Task 2: 共有データ契約（型定義）とサンプルデータ

**Files:**
- Create: `dashboard/src/lib/types.ts`
- Create: `data/status.json`
- Create: `data/runs/0001.json`

これは Plan 2（Python 側）と共有する契約。ここで確定した名前は Plan 2/3 で厳密に一致させること。

- [ ] **Step 1: Next.js をスキャフォールド**

```bash
npx create-next-app@latest dashboard --typescript --tailwind --eslint --app --src-dir --no-import-alias --use-npm --turbopack
```

Expected: `dashboard/` が作成され `dashboard/src/app/page.tsx` が存在する。

- [ ] **Step 2: `dashboard/src/lib/types.ts` を作成**

```typescript
/**
 * 全プラン共通のデータ契約。
 * Plan 2 の Python orchestrator はこの形に一致する JSON を出力する。
 */

export type LoopState = 'RUNNING' | 'PAUSED' | 'HALTED';

export interface LoopStatus {
  state: LoopState;
  /** なぜこの状態なのか（人間向け） */
  reason: string;
  /** 誰が/何がこの状態にしたか: "human:<name>" | "breaker:<kind>" | "system" */
  actor: string;
  /** ISO8601 */
  updatedAt: string;
  /** 再開手順の一文 */
  resumeHint: string;
}

/** 1 反復の最終結果 */
export type Verdict = 'merged' | 'needs-human' | 'paused' | 'failed';

export interface RunRecord {
  /** 一意ID。`<ISO8601 basic>-<issue#>` 形式 */
  id: string;
  /** 連番。1 始まり */
  iteration: number;
  issue: {
    number: number;
    title: string;
    labels: string[];
  };
  branch: string;
  /** ISO8601 */
  startedAt: string;
  /** ISO8601 */
  finishedAt: string;
  durationSec: number;
  /** adversary の棄却により builder が revise した回数 */
  reviseCycles: number;
  verdict: Verdict;
  adversary: {
    approved: boolean;
    summary: string;
  };
  verify: {
    testsPassed: boolean;
    /** 0..100 */
    coveragePct: number;
  };
  changedLines: number;
  cost: {
    builderUsd: number;
    adversaryUsd: number;
    ideationUsd: number;
    totalUsd: number;
  };
  models: {
    builder: string;
    adversary: string;
    ideation: string;
  };
  /** この反復が生成した次の改善 issue 番号 */
  nextIssues: number[];
}
```

- [ ] **Step 3: `data/status.json` を作成**

```json
{
  "state": "PAUSED",
  "reason": "初期状態。まだループを起動していない",
  "actor": "system",
  "updatedAt": "2026-07-20T00:00:00Z",
  "resumeHint": "gh variable set LOOP_ENABLED --body true && gh workflow enable loop.yml"
}
```

- [ ] **Step 4: `data/runs/0001.json` にサンプル記録を作成**

ダッシュボードが空でない状態で開発・テストできるようにする。Plan 2 稼働後は実データが追加される。

```json
{
  "id": "20260720T000000Z-1",
  "iteration": 1,
  "issue": {
    "number": 1,
    "title": "seed: ダッシュボードに稼働ステータスを表示する",
    "labels": ["loop:ready"]
  },
  "branch": "loop/1-seed",
  "startedAt": "2026-07-20T00:00:00Z",
  "finishedAt": "2026-07-20T00:05:00Z",
  "durationSec": 300,
  "reviseCycles": 0,
  "verdict": "merged",
  "adversary": { "approved": true, "summary": "テストが実装を実質的に検証している。指摘なし。" },
  "verify": { "testsPassed": true, "coveragePct": 80.0 },
  "changedLines": 42,
  "cost": { "builderUsd": 0.09, "adversaryUsd": 0.01, "ideationUsd": 0.01, "totalUsd": 0.11 },
  "models": { "builder": "claude-sonnet-5", "adversary": "claude-haiku-4-5", "ideation": "claude-haiku-4-5" },
  "nextIssues": [2]
}
```

- [ ] **Step 5: コミット**

```bash
git add dashboard data
git commit -m "feat: scaffold dashboard and define shared RunRecord/LoopStatus contract"
```

---

## Task 3: 集計層を TDD で実装

**Files:**
- Create: `dashboard/src/lib/aggregate.ts`
- Test: `dashboard/src/lib/aggregate.test.ts`
- Modify: `dashboard/package.json`

- [ ] **Step 1: Vitest を導入**

```bash
cd dashboard && npm install -D vitest @vitejs/plugin-react jsdom @testing-library/react @testing-library/jest-dom
```

- [ ] **Step 2: `dashboard/vitest.config.ts` を作成**

```typescript
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'node:path';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./vitest.setup.ts'],
    include: ['src/**/*.test.{ts,tsx}'],
    coverage: {
      provider: 'v8',
      include: ['src/lib/**', 'src/components/**'],
    },
  },
  resolve: {
    alias: { '@': path.resolve(__dirname, './src') },
  },
});
```

- [ ] **Step 3: `dashboard/vitest.setup.ts` を作成**

```typescript
import '@testing-library/jest-dom/vitest';
```

- [ ] **Step 4: `dashboard/package.json` の `scripts` を更新**

`scripts` を以下の内容に置き換える（`verify` が後続 Plan の agent が越えるゲートになる）:

```json
{
  "dev": "next dev",
  "build": "next build",
  "start": "next start",
  "lint": "eslint .",
  "typecheck": "tsc --noEmit",
  "test:unit": "vitest run",
  "test:unit:cov": "vitest run --coverage",
  "test:e2e": "playwright test",
  "verify": "npm run lint && npm run typecheck && npm run test:unit && npm run build"
}
```

- [ ] **Step 5: 失敗するテストを書く**

`dashboard/src/lib/aggregate.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { summarize, coverageTrend, costTrend } from './aggregate';
import type { RunRecord } from './types';

function makeRun(overrides: Partial<RunRecord> = {}): RunRecord {
  return {
    id: '20260720T000000Z-1',
    iteration: 1,
    issue: { number: 1, title: 't', labels: [] },
    branch: 'loop/1-x',
    startedAt: '2026-07-20T00:00:00Z',
    finishedAt: '2026-07-20T00:05:00Z',
    durationSec: 300,
    reviseCycles: 0,
    verdict: 'merged',
    adversary: { approved: true, summary: '' },
    verify: { testsPassed: true, coveragePct: 80 },
    changedLines: 10,
    cost: { builderUsd: 0.1, adversaryUsd: 0.01, ideationUsd: 0.01, totalUsd: 0.12 },
    models: { builder: 'claude-sonnet-5', adversary: 'claude-haiku-4-5', ideation: 'claude-haiku-4-5' },
    nextIssues: [],
    ...overrides,
  };
}

describe('summarize', () => {
  it('空配列でも NaN を出さずゼロを返す', () => {
    const s = summarize([]);
    expect(s.totalRuns).toBe(0);
    expect(s.approvalRate).toBe(0);
    expect(s.mergeRate).toBe(0);
    expect(s.avgCycleTimeSec).toBe(0);
    expect(s.avgReviseCycles).toBe(0);
    expect(s.totalCostUsd).toBe(0);
    expect(s.latestCoveragePct).toBe(0);
  });

  it('承認率とマージ率を別々に数える', () => {
    const runs = [
      makeRun({ iteration: 1, adversary: { approved: true, summary: '' }, verdict: 'merged' }),
      makeRun({ iteration: 2, adversary: { approved: true, summary: '' }, verdict: 'needs-human' }),
      makeRun({ iteration: 3, adversary: { approved: false, summary: '' }, verdict: 'failed' }),
      makeRun({ iteration: 4, adversary: { approved: false, summary: '' }, verdict: 'paused' }),
    ];
    const s = summarize(runs);
    expect(s.totalRuns).toBe(4);
    expect(s.mergedRuns).toBe(1);
    expect(s.approvalRate).toBeCloseTo(0.5);
    expect(s.mergeRate).toBeCloseTo(0.25);
  });

  it('平均と合計を計算する', () => {
    const runs = [
      makeRun({ iteration: 1, durationSec: 100, reviseCycles: 0, cost: { builderUsd: 0.1, adversaryUsd: 0, ideationUsd: 0, totalUsd: 0.1 } }),
      makeRun({ iteration: 2, durationSec: 300, reviseCycles: 2, cost: { builderUsd: 0.3, adversaryUsd: 0, ideationUsd: 0, totalUsd: 0.3 } }),
    ];
    const s = summarize(runs);
    expect(s.avgCycleTimeSec).toBe(200);
    expect(s.avgReviseCycles).toBe(1);
    expect(s.totalCostUsd).toBeCloseTo(0.4);
  });

  it('latestCoveragePct は iteration 最大の run を採用する（配列順に依存しない）', () => {
    const runs = [
      makeRun({ iteration: 5, verify: { testsPassed: true, coveragePct: 91 } }),
      makeRun({ iteration: 2, verify: { testsPassed: true, coveragePct: 70 } }),
    ];
    expect(summarize(runs).latestCoveragePct).toBe(91);
  });
});

describe('coverageTrend', () => {
  it('iteration 昇順に整列して返す', () => {
    const runs = [
      makeRun({ iteration: 3, verify: { testsPassed: true, coveragePct: 88 } }),
      makeRun({ iteration: 1, verify: { testsPassed: true, coveragePct: 80 } }),
    ];
    expect(coverageTrend(runs)).toEqual([
      { iteration: 1, value: 80 },
      { iteration: 3, value: 88 },
    ]);
  });
});

describe('costTrend', () => {
  it('累積コストを iteration 昇順で返す', () => {
    const runs = [
      makeRun({ iteration: 1, cost: { builderUsd: 0, adversaryUsd: 0, ideationUsd: 0, totalUsd: 0.1 } }),
      makeRun({ iteration: 2, cost: { builderUsd: 0, adversaryUsd: 0, ideationUsd: 0, totalUsd: 0.2 } }),
    ];
    const t = costTrend(runs);
    expect(t[0].value).toBeCloseTo(0.1);
    expect(t[1].value).toBeCloseTo(0.3);
  });
});
```

- [ ] **Step 6: テストを実行して失敗を確認**

Run: `cd dashboard && npx vitest run src/lib/aggregate.test.ts`
Expected: FAIL — `Failed to resolve import "./aggregate"`

- [ ] **Step 7: `dashboard/src/lib/aggregate.ts` を実装**

```typescript
import type { RunRecord } from './types';

export interface Summary {
  totalRuns: number;
  mergedRuns: number;
  /** adversary が approve した割合 0..1 */
  approvalRate: number;
  /** develop にマージされた割合 0..1 */
  mergeRate: number;
  avgCycleTimeSec: number;
  avgReviseCycles: number;
  totalCostUsd: number;
  /** 最新 iteration のカバレッジ */
  latestCoveragePct: number;
}

export interface TrendPoint {
  iteration: number;
  value: number;
}

function mean(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

function byIterationAsc(runs: RunRecord[]): RunRecord[] {
  return [...runs].sort((a, b) => a.iteration - b.iteration);
}

export function summarize(runs: RunRecord[]): Summary {
  if (runs.length === 0) {
    return {
      totalRuns: 0,
      mergedRuns: 0,
      approvalRate: 0,
      mergeRate: 0,
      avgCycleTimeSec: 0,
      avgReviseCycles: 0,
      totalCostUsd: 0,
      latestCoveragePct: 0,
    };
  }

  const sorted = byIterationAsc(runs);
  const latest = sorted[sorted.length - 1];
  const mergedRuns = runs.filter((r) => r.verdict === 'merged').length;
  const approvedRuns = runs.filter((r) => r.adversary.approved).length;

  return {
    totalRuns: runs.length,
    mergedRuns,
    approvalRate: approvedRuns / runs.length,
    mergeRate: mergedRuns / runs.length,
    avgCycleTimeSec: mean(runs.map((r) => r.durationSec)),
    avgReviseCycles: mean(runs.map((r) => r.reviseCycles)),
    totalCostUsd: runs.reduce((sum, r) => sum + r.cost.totalUsd, 0),
    latestCoveragePct: latest.verify.coveragePct,
  };
}

export function coverageTrend(runs: RunRecord[]): TrendPoint[] {
  return byIterationAsc(runs).map((r) => ({
    iteration: r.iteration,
    value: r.verify.coveragePct,
  }));
}

export function costTrend(runs: RunRecord[]): TrendPoint[] {
  let cumulative = 0;
  return byIterationAsc(runs).map((r) => {
    cumulative += r.cost.totalUsd;
    return { iteration: r.iteration, value: cumulative };
  });
}
```

- [ ] **Step 8: テストを実行して合格を確認**

Run: `cd dashboard && npx vitest run src/lib/aggregate.test.ts`
Expected: PASS — 7 tests passed

- [ ] **Step 9: コミット**

```bash
git add dashboard
git commit -m "feat(dashboard): add pure aggregation layer with tests"
```

---

## Task 4: データ読み込み層

**Files:**
- Create: `dashboard/src/lib/loadData.ts`

集計層と分離した I/O 層。ビルド時に `../data` を読む（static export なので build 時 fs 読みで完結する）。

- [ ] **Step 1: `dashboard/src/lib/loadData.ts` を実装**

```typescript
import fs from 'node:fs';
import path from 'node:path';
import type { RunRecord, LoopStatus } from './types';

/** リポジトリ直下の data/ を指す（dashboard/ から見て 1 つ上） */
const DATA_DIR = path.join(process.cwd(), '..', 'data');

export function loadRuns(): RunRecord[] {
  const dir = path.join(DATA_DIR, 'runs');
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((f) => f.endsWith('.json'))
    .map((f) => JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')) as RunRecord)
    .sort((a, b) => a.iteration - b.iteration);
}

export function loadStatus(): LoopStatus {
  const file = path.join(DATA_DIR, 'status.json');
  if (!fs.existsSync(file)) {
    return {
      state: 'HALTED',
      reason: 'data/status.json が見つからない',
      actor: 'system',
      updatedAt: new Date().toISOString(),
      resumeHint: 'data/status.json を作成してください',
    };
  }
  return JSON.parse(fs.readFileSync(file, 'utf8')) as LoopStatus;
}
```

- [ ] **Step 2: コミット**

```bash
git add dashboard/src/lib/loadData.ts
git commit -m "feat(dashboard): add build-time data loading layer"
```

---

## Task 5: StatusBadge コンポーネント（TDD）

**Files:**
- Create: `dashboard/src/components/StatusBadge.tsx`
- Test: `dashboard/src/components/StatusBadge.test.tsx`

停止機構の可視化。spec §7 の「理由・停止主体・再開手順を常時表示」を満たす。

- [ ] **Step 1: 失敗するテストを書く**

`dashboard/src/components/StatusBadge.test.tsx`:

```tsx
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { StatusBadge } from './StatusBadge';
import type { LoopStatus } from '@/lib/types';

const base: LoopStatus = {
  state: 'RUNNING',
  reason: '正常稼働中',
  actor: 'system',
  updatedAt: '2026-07-20T10:00:00Z',
  resumeHint: 'n/a',
};

describe('StatusBadge', () => {
  it('状態文字列を表示する', () => {
    render(<StatusBadge status={base} />);
    expect(screen.getByText('RUNNING')).toBeInTheDocument();
  });

  it('停止時は理由・停止主体・再開手順をすべて表示する', () => {
    render(
      <StatusBadge
        status={{
          state: 'HALTED',
          reason: '連続3回ゲート失敗',
          actor: 'breaker:consecutive-failures',
          updatedAt: '2026-07-20T10:00:00Z',
          resumeHint: 'gh variable set LOOP_ENABLED --body true',
        }}
      />
    );
    expect(screen.getByText('HALTED')).toBeInTheDocument();
    expect(screen.getByText(/連続3回ゲート失敗/)).toBeInTheDocument();
    expect(screen.getByText(/breaker:consecutive-failures/)).toBeInTheDocument();
    expect(screen.getByText(/LOOP_ENABLED --body true/)).toBeInTheDocument();
  });

  it('状態ごとに異なる data-state を持つ', () => {
    const { rerender } = render(<StatusBadge status={base} />);
    expect(screen.getByTestId('status-badge')).toHaveAttribute('data-state', 'RUNNING');
    rerender(<StatusBadge status={{ ...base, state: 'PAUSED' }} />);
    expect(screen.getByTestId('status-badge')).toHaveAttribute('data-state', 'PAUSED');
  });
});
```

- [ ] **Step 2: テストを実行して失敗を確認**

Run: `cd dashboard && npx vitest run src/components/StatusBadge.test.tsx`
Expected: FAIL — `Failed to resolve import "./StatusBadge"`

- [ ] **Step 3: `dashboard/src/components/StatusBadge.tsx` を実装**

```tsx
import type { LoopStatus } from '@/lib/types';

const STATE_STYLES: Record<LoopStatus['state'], string> = {
  RUNNING: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/40',
  PAUSED: 'bg-amber-500/15 text-amber-400 border-amber-500/40',
  HALTED: 'bg-rose-500/15 text-rose-400 border-rose-500/40',
};

export function StatusBadge({ status }: { status: LoopStatus }) {
  return (
    <section
      data-testid="status-badge"
      data-state={status.state}
      className={`rounded-xl border p-6 ${STATE_STYLES[status.state]}`}
    >
      <div className="flex items-baseline gap-4">
        <span className="text-3xl font-bold tracking-tight">{status.state}</span>
        <span className="text-sm opacity-70">
          updated {new Date(status.updatedAt).toISOString()}
        </span>
      </div>
      <dl className="mt-4 grid gap-2 text-sm">
        <div className="flex gap-2">
          <dt className="w-28 shrink-0 opacity-60">理由</dt>
          <dd>{status.reason}</dd>
        </div>
        <div className="flex gap-2">
          <dt className="w-28 shrink-0 opacity-60">停止主体</dt>
          <dd>{status.actor}</dd>
        </div>
        <div className="flex gap-2">
          <dt className="w-28 shrink-0 opacity-60">再開手順</dt>
          <dd className="font-mono text-xs">{status.resumeHint}</dd>
        </div>
      </dl>
    </section>
  );
}
```

- [ ] **Step 4: テストを実行して合格を確認**

Run: `cd dashboard && npx vitest run src/components/StatusBadge.test.tsx`
Expected: PASS — 3 tests passed

- [ ] **Step 5: コミット**

```bash
git add dashboard/src/components
git commit -m "feat(dashboard): add StatusBadge showing stop reason and resume hint"
```

---

## Task 6: MetricCards / TrendChart / IterationTimeline

**Files:**
- Create: `dashboard/src/components/MetricCards.tsx`
- Create: `dashboard/src/components/TrendChart.tsx`
- Create: `dashboard/src/components/IterationTimeline.tsx`
- Test: `dashboard/src/components/MetricCards.test.tsx`

チャートは外部依存を足さず SVG を自前で描く（依存が増えると agent の verify が遅く・脆くなるため）。

- [ ] **Step 1: MetricCards の失敗するテストを書く**

`dashboard/src/components/MetricCards.test.tsx`:

```tsx
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MetricCards } from './MetricCards';
import type { Summary } from '@/lib/aggregate';

const summary: Summary = {
  totalRuns: 12,
  mergedRuns: 9,
  approvalRate: 0.75,
  mergeRate: 0.75,
  avgCycleTimeSec: 420,
  avgReviseCycles: 1.5,
  totalCostUsd: 1.234,
  latestCoveragePct: 87.5,
};

describe('MetricCards', () => {
  it('反復数を表示する', () => {
    render(<MetricCards summary={summary} />);
    expect(screen.getByText('12')).toBeInTheDocument();
  });

  it('割合をパーセント表記にする', () => {
    render(<MetricCards summary={summary} />);
    expect(screen.getByText('75%')).toBeInTheDocument();
  });

  it('コストをドル2桁で表示する', () => {
    render(<MetricCards summary={summary} />);
    expect(screen.getByText('$1.23')).toBeInTheDocument();
  });

  it('サイクルタイムを分表記にする', () => {
    render(<MetricCards summary={summary} />);
    expect(screen.getByText('7.0分')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: テストを実行して失敗を確認**

Run: `cd dashboard && npx vitest run src/components/MetricCards.test.tsx`
Expected: FAIL — `Failed to resolve import "./MetricCards"`

- [ ] **Step 3: `dashboard/src/components/MetricCards.tsx` を実装**

```tsx
import type { Summary } from '@/lib/aggregate';

function Card({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/5 p-5">
      <div className="text-xs uppercase tracking-wider opacity-60">{label}</div>
      <div className="mt-2 text-3xl font-semibold tabular-nums">{value}</div>
      {sub && <div className="mt-1 text-xs opacity-50">{sub}</div>}
    </div>
  );
}

export function MetricCards({ summary }: { summary: Summary }) {
  return (
    <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-6">
      <Card label="反復数" value={String(summary.totalRuns)} sub={`${summary.mergedRuns} merged`} />
      <Card label="承認率" value={`${Math.round(summary.approvalRate * 100)}%`} sub="adversary approve" />
      <Card label="マージ率" value={`${Math.round(summary.mergeRate * 100)}%`} sub="develop 到達" />
      <Card label="サイクルタイム" value={`${(summary.avgCycleTimeSec / 60).toFixed(1)}分`} sub="平均" />
      <Card label="累計コスト" value={`$${summary.totalCostUsd.toFixed(2)}`} sub={`平均 revise ${summary.avgReviseCycles.toFixed(1)}回`} />
      <Card label="カバレッジ" value={`${summary.latestCoveragePct.toFixed(1)}%`} sub="最新反復" />
    </div>
  );
}
```

- [ ] **Step 4: テストを実行して合格を確認**

Run: `cd dashboard && npx vitest run src/components/MetricCards.test.tsx`
Expected: PASS — 4 tests passed

- [ ] **Step 5: `dashboard/src/components/TrendChart.tsx` を実装**

```tsx
import type { TrendPoint } from '@/lib/aggregate';

export function TrendChart({
  title,
  points,
  unit,
}: {
  title: string;
  points: TrendPoint[];
  unit: string;
}) {
  const width = 640;
  const height = 160;
  const pad = 24;

  if (points.length === 0) {
    return (
      <div className="rounded-xl border border-white/10 bg-white/5 p-5">
        <div className="text-xs uppercase tracking-wider opacity-60">{title}</div>
        <p className="mt-4 text-sm opacity-50">データなし</p>
      </div>
    );
  }

  const values = points.map((p) => p.value);
  const maxValue = Math.max(...values);
  const minValue = Math.min(...values);
  const span = maxValue - minValue || 1;
  const stepX = points.length > 1 ? (width - pad * 2) / (points.length - 1) : 0;

  const path = points
    .map((p, i) => {
      const x = pad + stepX * i;
      const y = height - pad - ((p.value - minValue) / span) * (height - pad * 2);
      return `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(' ');

  return (
    <div className="rounded-xl border border-white/10 bg-white/5 p-5">
      <div className="flex items-baseline justify-between">
        <span className="text-xs uppercase tracking-wider opacity-60">{title}</span>
        <span className="text-sm tabular-nums opacity-80">
          {values[values.length - 1].toFixed(1)}
          {unit}
        </span>
      </div>
      <svg viewBox={`0 0 ${width} ${height}`} className="mt-3 w-full" role="img" aria-label={title}>
        <path d={path} fill="none" stroke="currentColor" strokeWidth={2} className="text-sky-400" />
      </svg>
    </div>
  );
}
```

- [ ] **Step 6: `dashboard/src/components/IterationTimeline.tsx` を実装**

```tsx
import type { RunRecord } from '@/lib/types';

const VERDICT_STYLES: Record<RunRecord['verdict'], string> = {
  merged: 'text-emerald-400',
  'needs-human': 'text-amber-400',
  paused: 'text-sky-400',
  failed: 'text-rose-400',
};

export function IterationTimeline({ runs }: { runs: RunRecord[] }) {
  const recent = [...runs].sort((a, b) => b.iteration - a.iteration).slice(0, 20);

  return (
    <div className="rounded-xl border border-white/10 bg-white/5 p-5">
      <div className="text-xs uppercase tracking-wider opacity-60">直近の反復</div>
      <ul className="mt-4 divide-y divide-white/5">
        {recent.map((run) => (
          <li key={run.id} className="flex items-center gap-4 py-3 text-sm">
            <span className="w-10 shrink-0 tabular-nums opacity-50">#{run.iteration}</span>
            <span className={`w-28 shrink-0 font-medium ${VERDICT_STYLES[run.verdict]}`}>
              {run.verdict}
            </span>
            <span className="min-w-0 flex-1 truncate">{run.issue.title}</span>
            <span className="shrink-0 tabular-nums opacity-50">
              revise {run.reviseCycles} / ${run.cost.totalUsd.toFixed(2)}
            </span>
          </li>
        ))}
        {recent.length === 0 && <li className="py-3 text-sm opacity-50">まだ反復がありません</li>}
      </ul>
    </div>
  );
}
```

- [ ] **Step 7: `dashboard/src/components/BacklogPanel.tsx` を実装**

spec §8 の「直近の改善 issue とバックログ」。各反復が生成した次 issue を GitHub へのリンクとして並べる。

```tsx
import type { RunRecord } from '@/lib/types';

export function BacklogPanel({ runs, repoUrl }: { runs: RunRecord[]; repoUrl: string }) {
  const recent = [...runs]
    .sort((a, b) => b.iteration - a.iteration)
    .filter((run) => run.nextIssues.length > 0)
    .slice(0, 10);

  return (
    <div className="rounded-xl border border-white/10 bg-white/5 p-5">
      <div className="text-xs uppercase tracking-wider opacity-60">
        ループが生成した改善バックログ
      </div>
      <ul className="mt-4 space-y-2 text-sm">
        {recent.map((run) => (
          <li key={run.id} className="flex flex-wrap items-center gap-2">
            <span className="tabular-nums opacity-50">#{run.iteration} から</span>
            {run.nextIssues.map((number) => (
              <a
                key={number}
                href={`${repoUrl}/issues/${number}`}
                className="rounded-md border border-sky-500/40 bg-sky-500/10 px-2 py-0.5 font-mono text-xs text-sky-300 hover:bg-sky-500/20"
              >
                #{number}
              </a>
            ))}
          </li>
        ))}
        {recent.length === 0 && (
          <li className="opacity-50">まだ改善 issue が生成されていません</li>
        )}
      </ul>
    </div>
  );
}
```

- [ ] **Step 8: コミット**

```bash
git add dashboard/src/components
git commit -m "feat(dashboard): add metric cards, trend chart, timeline and backlog panel"
```

---

## Task 7: トップページの組み立てと static export 設定

**Files:**
- Modify: `dashboard/src/app/page.tsx`
- Create: `dashboard/next.config.ts`（create-next-app が生成済みなら上書き）

- [ ] **Step 1: `dashboard/next.config.ts` を作成**

GitHub Pages はリポジトリ名のサブパス配信になるため、CI 時のみ `basePath` を付ける。

```typescript
import type { NextConfig } from 'next';

const repo = 'demo-auto-spec-driven-development';
const isCI = process.env.GITHUB_ACTIONS === 'true';

const nextConfig: NextConfig = {
  output: 'export',
  images: { unoptimized: true },
  basePath: isCI ? `/${repo}` : '',
  assetPrefix: isCI ? `/${repo}/` : '',
};

export default nextConfig;
```

- [ ] **Step 2: `dashboard/src/app/page.tsx` を置き換え**

```tsx
import { loadRuns, loadStatus } from '@/lib/loadData';
import { summarize, coverageTrend, costTrend } from '@/lib/aggregate';
import { StatusBadge } from '@/components/StatusBadge';
import { MetricCards } from '@/components/MetricCards';
import { TrendChart } from '@/components/TrendChart';
import { IterationTimeline } from '@/components/IterationTimeline';
import { BacklogPanel } from '@/components/BacklogPanel';

const REPO_URL =
  process.env.NEXT_PUBLIC_REPO_URL ??
  'https://github.com/yut0takagi/demo-auto-spec-driven-development';

export default function Home() {
  const runs = loadRuns();
  const status = loadStatus();
  const summary = summarize(runs);

  return (
    <main className="mx-auto max-w-6xl px-6 py-12">
      <header className="mb-8">
        <h1 className="text-2xl font-bold tracking-tight">自己観測ダッシュボード</h1>
        <p className="mt-1 text-sm opacity-60">
          このリポジトリを無人で開発し続けているループの稼働状況
        </p>
      </header>

      <div className="space-y-6">
        <StatusBadge status={status} />
        <MetricCards summary={summary} />
        <div className="grid gap-6 lg:grid-cols-2">
          <TrendChart title="カバレッジ推移" points={coverageTrend(runs)} unit="%" />
          <TrendChart title="累計コスト" points={costTrend(runs)} unit="USD" />
        </div>
        <IterationTimeline runs={runs} />
        <BacklogPanel runs={runs} repoUrl={REPO_URL} />
      </div>
    </main>
  );
}
```

- [ ] **Step 3: verify を実行して全体が緑になることを確認**

Run: `cd dashboard && npm run verify`
Expected: lint / typecheck / unit(14 tests) / build がすべて成功し `dashboard/out/` が生成される。

- [ ] **Step 4: コミット**

```bash
git add dashboard
git commit -m "feat(dashboard): assemble home page and configure static export"
```

---

## Task 8: Playwright E2E

**Files:**
- Create: `dashboard/playwright.config.ts`
- Test: `dashboard/e2e/dashboard.spec.ts`

- [ ] **Step 1: Playwright を導入**

```bash
cd dashboard && npm install -D @playwright/test && npx playwright install --with-deps chromium
```

- [ ] **Step 2: `dashboard/playwright.config.ts` を作成**

static export の成果物を `npx serve` 相当で配信せず、Next の dev サーバで検証する（CI での依存を減らすため）。

```typescript
import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  timeout: 30_000,
  use: { baseURL: 'http://127.0.0.1:3000' },
  webServer: {
    command: 'npm run dev',
    url: 'http://127.0.0.1:3000',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
```

- [ ] **Step 3: `dashboard/e2e/dashboard.spec.ts` を作成**

```typescript
import { test, expect } from '@playwright/test';

test('ダッシュボードが稼働ステータスと主要メトリクスを表示する', async ({ page }) => {
  await page.goto('/');

  await expect(page.getByRole('heading', { name: '自己観測ダッシュボード' })).toBeVisible();

  const badge = page.getByTestId('status-badge');
  await expect(badge).toBeVisible();
  await expect(badge).toHaveAttribute('data-state', /RUNNING|PAUSED|HALTED/);

  await expect(page.getByText('反復数')).toBeVisible();
  await expect(page.getByText('承認率')).toBeVisible();
  await expect(page.getByText('直近の反復')).toBeVisible();
});
```

- [ ] **Step 4: E2E を実行して合格を確認**

Run: `cd dashboard && npm run test:e2e`
Expected: PASS — 1 test passed

- [ ] **Step 5: コミット**

```bash
git add dashboard
git commit -m "test(dashboard): add Playwright E2E covering status and metrics"
```

---

## Task 9: CI ワークフロー

**Files:**
- Create: `.github/workflows/ci.yml`

spec §14 のとおり、これは**人間 PR 用の二次的セーフティネット**（ボット PR では `GITHUB_TOKEN` の仕様で発火しない前提）。

- [ ] **Step 1: `.github/workflows/ci.yml` を作成**

```yaml
name: ci

on:
  pull_request:
  push:
    branches: [main, develop]

jobs:
  verify:
    runs-on: ubuntu-latest
    defaults:
      run:
        working-directory: dashboard
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '24'
          cache: npm
          cache-dependency-path: dashboard/package-lock.json
      - run: npm ci
      - run: npm run verify
      - run: npx playwright install --with-deps chromium
      - run: npm run test:e2e
      - uses: actions/upload-artifact@v4
        if: failure()
        with:
          name: playwright-report
          path: dashboard/playwright-report/
          retention-days: 7
```

- [ ] **Step 2: コミット & push して CI が緑になることを確認**

```bash
git add .github/workflows/ci.yml
git commit -m "ci: add lint/typecheck/unit/build/e2e workflow"
git push
gh run watch
```

Expected: `ci` workflow が success。

---

## Task 10: GitHub Pages デプロイ

**Files:**
- Create: `.github/workflows/pages.yml`

- [ ] **Step 1: `.github/workflows/pages.yml` を作成**

```yaml
name: pages

on:
  push:
    branches: [develop]
  workflow_dispatch:

permissions:
  contents: read
  pages: write
  id-token: write

concurrency:
  group: pages
  cancel-in-progress: true

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '24'
          cache: npm
          cache-dependency-path: dashboard/package-lock.json
      - run: npm ci
        working-directory: dashboard
      - run: npm run build
        working-directory: dashboard
      - uses: actions/configure-pages@v5
      - uses: actions/upload-pages-artifact@v3
        with:
          path: dashboard/out

  deploy:
    needs: build
    runs-on: ubuntu-latest
    environment:
      name: github-pages
      url: ${{ steps.deployment.outputs.page_url }}
    steps:
      - id: deployment
        uses: actions/deploy-pages@v4
```

- [ ] **Step 2: GitHub Pages を Actions ソースで有効化**

```bash
gh api -X POST repos/{owner}/{repo}/pages -f build_type=workflow
```

Expected: Pages が有効化される（既に有効なら 409 が返るので `-X PUT` で更新）。

- [ ] **Step 3: コミット & push してデプロイを確認**

```bash
git add .github/workflows/pages.yml
git commit -m "ci: deploy dashboard to GitHub Pages on develop"
git push
gh run watch
```

Expected: `pages` workflow が success し、`https://<owner>.github.io/demo-auto-spec-driven-development/` でダッシュボードが表示される。

---

## Task 11: main ブランチ保護（人間ゲート）

**Files:** なし（GitHub 設定）

spec §6「main は人間のみがマージ」を強制する。

- [ ] **Step 1: `main` にブランチ保護を設定**

```bash
gh api -X PUT repos/{owner}/{repo}/branches/main/protection \
  -H "Accept: application/vnd.github+json" \
  -F "required_pull_request_reviews[required_approving_review_count]=1" \
  -F "required_status_checks[strict]=true" \
  -F "required_status_checks[contexts][]=verify" \
  -F "enforce_admins=false" \
  -F "restrictions=null" \
  -F "allow_force_pushes=false" \
  -F "allow_deletions=false"
```

Expected: `main` が保護され、PR + 1 approve なしにはマージできない。

- [ ] **Step 2: 保護が効いているか確認**

```bash
gh api repos/{owner}/{repo}/branches/main/protection -q '.required_pull_request_reviews.required_approving_review_count'
```

Expected: `1`

---

## Plan 1 完了条件

- [ ] `cd dashboard && npm run verify` が緑
- [ ] `cd dashboard && npm run test:e2e` が緑
- [ ] `ci` workflow が `develop` push で success
- [ ] `pages` workflow が success し、公開 URL でダッシュボードが表示される
- [ ] `main` がブランチ保護されている
- [ ] `data/status.json` と `data/runs/0001.json` が存在し、ダッシュボードに反映されている

**次:** Plan 2（Orchestrator）— この `npm run verify` が agent の越えるゲートになる。
