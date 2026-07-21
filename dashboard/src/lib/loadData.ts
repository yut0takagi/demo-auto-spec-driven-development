import fs from 'node:fs';
import path from 'node:path';
import type { RunRecord, LoopStatus, LoopState, Verdict } from './types';

/** リポジトリ直下の data/ を指す（dashboard/ から見て 1 つ上） */
const DATA_DIR = path.join(process.cwd(), '..', 'data');

const VALID_VERDICTS: readonly Verdict[] = ['merged', 'needs-human', 'paused', 'dry-run', 'failed'];
const VALID_STATES: readonly LoopState[] = ['RUNNING', 'PAUSED', 'HALTED'];

export interface LoadError {
  file: string;
  message: string;
}

export interface LoadRunsResult {
  runs: RunRecord[];
  errors: LoadError[];
}

function clampCoveragePct(value: number, file: string): number {
  if (Number.isNaN(value)) {
    console.warn(`[loadRuns] ${file}: coveragePct が NaN のため 0 にクランプした`);
    return 0;
  }
  const clamped = Math.min(100, Math.max(0, value));
  if (clamped !== value) {
    console.warn(`[loadRuns] ${file}: coveragePct=${value} は範囲外のため ${clamped} にクランプした`);
  }
  return clamped;
}

/**
 * `data/runs/*.json` は無人稼働の Python が書き、誰もレビューしないまま着地する。
 * `JSON.parse(...) as RunRecord` はコンパイル時にしか効かず実行時には消えるため、
 * ここでフィールド単位の実行時検証を行う。検証に落ちたレコードは呼び出し元の
 * `loadRuns` がスキップし、ビルドは止めない（詳細は loadRuns のコメント参照）。
 */
function assertValidRunRecord(data: unknown, file: string): asserts data is RunRecord {
  if (typeof data !== 'object' || data === null) {
    throw new Error(`${file}: RunRecord は object である必要がある`);
  }
  const r = data as Record<string, unknown>;

  const requireString = (key: string) => {
    if (typeof r[key] !== 'string') {
      throw new Error(`${file}: フィールド "${key}" は string である必要がある`);
    }
  };
  const requireNumber = (key: string) => {
    if (typeof r[key] !== 'number') {
      throw new Error(`${file}: フィールド "${key}" は number である必要がある`);
    }
  };
  const requireNumberIn = (obj: Record<string, unknown>, parent: string, key: string) => {
    if (typeof obj[key] !== 'number') {
      throw new Error(`${file}: フィールド "${parent}.${key}" は number である必要がある`);
    }
  };
  const requireStringIn = (obj: Record<string, unknown>, parent: string, key: string) => {
    if (typeof obj[key] !== 'string') {
      throw new Error(`${file}: フィールド "${parent}.${key}" は string である必要がある`);
    }
  };

  requireString('id');
  requireNumber('iteration');

  if (typeof r.issue !== 'object' || r.issue === null) {
    throw new Error(`${file}: フィールド "issue" が不正`);
  }
  const issue = r.issue as Record<string, unknown>;
  requireNumberIn(issue, 'issue', 'number');
  requireStringIn(issue, 'issue', 'title');
  if (!Array.isArray(issue.labels)) {
    throw new Error(`${file}: フィールド "issue.labels" は配列である必要がある`);
  }

  requireString('branch');
  requireString('startedAt');
  requireString('finishedAt');
  requireNumber('durationSec');
  requireNumber('reviseCycles');
  if (typeof r.verdict !== 'string' || !VALID_VERDICTS.includes(r.verdict as Verdict)) {
    throw new Error(`${file}: フィールド "verdict" が不正な値または欠落している: ${JSON.stringify(r.verdict)}`);
  }
  if (!Array.isArray(r.gateReasons)) {
    throw new Error(`${file}: フィールド "gateReasons" は配列である必要がある`);
  }
  if (r.prNumber !== null && typeof r.prNumber !== 'number') {
    throw new Error(`${file}: フィールド "prNumber" は number か null である必要がある`);
  }

  if (typeof r.adversary !== 'object' || r.adversary === null) {
    throw new Error(`${file}: フィールド "adversary" が不正`);
  }
  const adversary = r.adversary as Record<string, unknown>;
  if (typeof adversary.approved !== 'boolean') {
    throw new Error(`${file}: フィールド "adversary.approved" は boolean である必要がある`);
  }
  requireStringIn(adversary, 'adversary', 'summary');

  if (typeof r.verify !== 'object' || r.verify === null) {
    throw new Error(`${file}: フィールド "verify" が不正`);
  }
  const verify = r.verify as Record<string, unknown>;
  if (
    typeof verify.unitPassed !== 'boolean' ||
    typeof verify.e2ePassed !== 'boolean' ||
    typeof verify.coveragePct !== 'number'
  ) {
    throw new Error(`${file}: フィールド "verify" の形が不正`);
  }
  requireNumber('changedLines');

  if (typeof r.cost !== 'object' || r.cost === null) {
    throw new Error(`${file}: フィールド "cost" が不正`);
  }
  const cost = r.cost as Record<string, unknown>;
  for (const k of ['builderUsd', 'adversaryUsd', 'ideationUsd', 'totalUsd']) {
    requireNumberIn(cost, 'cost', k);
  }

  if (typeof r.models !== 'object' || r.models === null) {
    throw new Error(`${file}: フィールド "models" が不正`);
  }
  const models = r.models as Record<string, unknown>;
  for (const k of ['builder', 'adversary', 'ideation']) {
    requireStringIn(models, 'models', k);
  }

  if (!Array.isArray(r.nextIssues)) {
    throw new Error(`${file}: フィールド "nextIssues" は配列である必要がある`);
  }
}

/**
 * 1 件の破損レコードで全体を落とさない。落とすと static export のビルドが失敗し、
 * GitHub Pages のデプロイが止まって「最後の正常ビルド」に凍りつく。RUNNING/PAUSED/HALTED
 * バッジもそこに表示できなくなり、まさに異常が起きている瞬間に人間が状態を見られなくなる。
 * そのため不正レコードはスキップし、理由を `errors` として呼び出し側（UI）に返す。
 */
export function loadRuns(dataDir: string = DATA_DIR): LoadRunsResult {
  const dir = path.join(dataDir, 'runs');
  if (!fs.existsSync(dir)) return { runs: [], errors: [] };

  const runs: RunRecord[] = [];
  const errors: LoadError[] = [];

  for (const name of fs.readdirSync(dir).filter((f) => f.endsWith('.json'))) {
    const file = path.join(dir, name);
    try {
      let raw: unknown;
      try {
        raw = JSON.parse(fs.readFileSync(file, 'utf8'));
      } catch (e) {
        // Python 側は json.dumps の既定で NaN/Infinity を出しうる（不正な JSON）。
        // 途中で kill されて切り詰められたファイルもここに来る。
        throw new Error(`JSON として解析できない: ${e instanceof Error ? e.message : String(e)}`);
      }
      assertValidRunRecord(raw, file);
      runs.push({
        ...raw,
        verify: { ...raw.verify, coveragePct: clampCoveragePct(raw.verify.coveragePct, file) },
      });
    } catch (e) {
      errors.push({ file: name, message: e instanceof Error ? e.message : String(e) });
      console.error(`[loadRuns] skipped ${name}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  runs.sort((a, b) => a.iteration - b.iteration);
  return { runs, errors };
}

function isValidStatus(data: unknown): data is LoopStatus {
  if (typeof data !== 'object' || data === null) return false;
  const s = data as Record<string, unknown>;
  return (
    typeof s.state === 'string' &&
    (VALID_STATES as readonly string[]).includes(s.state) &&
    typeof s.reason === 'string' &&
    typeof s.actor === 'string' &&
    typeof s.updatedAt === 'string' &&
    typeof s.resumeHint === 'string'
  );
}

/**
 * `state` は人間が見る主指標（RUNNING/PAUSED/HALTED バッジ）を直接駆動するため、
 * ここは絶対に例外を投げない。壊れたデータから「稼働中」を誤って推測することは
 * 決してせず、常に安全側の HALTED にフォールバックする。
 */
export function loadStatus(dataDir: string = DATA_DIR): LoopStatus {
  const file = path.join(dataDir, 'status.json');
  const fallback = (reason: string): LoopStatus => ({
    state: 'HALTED',
    reason,
    actor: 'system',
    updatedAt: new Date().toISOString(),
    resumeHint: `${file} の内容を確認してください`,
  });

  if (!fs.existsSync(file)) return fallback('data/status.json が見つからない');

  let parsed: unknown;
  try {
    parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return fallback('data/status.json を JSON として解析できない');
  }
  if (!isValidStatus(parsed)) return fallback('data/status.json の形式が不正');
  return parsed;
}
