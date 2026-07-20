import fs from 'node:fs';
import path from 'node:path';
import type { RunRecord, LoopStatus, Verdict } from './types';

/** リポジトリ直下の data/ を指す（dashboard/ から見て 1 つ上） */
const DATA_DIR = path.join(process.cwd(), '..', 'data');

const VALID_VERDICTS: readonly Verdict[] = ['merged', 'needs-human', 'paused', 'dry-run', 'failed'];

function clampCoveragePct(value: number): number {
  if (Number.isNaN(value)) return 0;
  return Math.min(100, Math.max(0, value));
}

/**
 * `data/runs/*.json` は無人稼働の Python が書き、誰もレビューしないまま着地する。
 * `JSON.parse(...) as RunRecord` はコンパイル時にしか効かず実行時には消えるため、
 * ビルド時（static export）に壊れたレコードを検出して失敗させる。
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

  requireString('id');
  requireNumber('iteration');
  if (typeof r.issue !== 'object' || r.issue === null) {
    throw new Error(`${file}: フィールド "issue" が不正`);
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
  if (typeof r.models !== 'object' || r.models === null) {
    throw new Error(`${file}: フィールド "models" が不正`);
  }
  if (!Array.isArray(r.nextIssues)) {
    throw new Error(`${file}: フィールド "nextIssues" は配列である必要がある`);
  }
}

export function loadRuns(dataDir: string = DATA_DIR): RunRecord[] {
  const dir = path.join(dataDir, 'runs');
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((f) => f.endsWith('.json'))
    .map((f) => {
      const file = path.join(dir, f);
      const raw: unknown = JSON.parse(fs.readFileSync(file, 'utf8'));
      assertValidRunRecord(raw, file);
      return {
        ...raw,
        verify: { ...raw.verify, coveragePct: clampCoveragePct(raw.verify.coveragePct) },
      };
    })
    .sort((a, b) => a.iteration - b.iteration);
}

export function loadStatus(dataDir: string = DATA_DIR): LoopStatus {
  const file = path.join(dataDir, 'status.json');
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
