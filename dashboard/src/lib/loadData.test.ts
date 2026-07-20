import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { loadRuns, loadStatus } from './loadData';

const VALID_RECORD = {
  id: '20260720T000000Z-1',
  iteration: 1,
  issue: { number: 1, title: 't', labels: [] },
  branch: 'loop/1-x',
  startedAt: '2026-07-20T00:00:00Z',
  finishedAt: '2026-07-20T00:05:00Z',
  durationSec: 300,
  reviseCycles: 0,
  verdict: 'merged',
  gateReasons: [],
  prNumber: 11,
  adversary: { approved: true, summary: '' },
  verify: { unitPassed: true, e2ePassed: true, coveragePct: 80 },
  changedLines: 10,
  cost: { builderUsd: 0.1, adversaryUsd: 0.01, ideationUsd: 0.01, totalUsd: 0.12 },
  models: { builder: 'claude-sonnet-5', adversary: 'claude-haiku-4-5', ideation: 'claude-haiku-4-5' },
  nextIssues: [],
};

function writeRun(dir: string, filename: string, record: unknown) {
  fs.mkdirSync(path.join(dir, 'runs'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'runs', filename), JSON.stringify(record));
}

describe('loadRuns', () => {
  let dir: string;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'loaddata-test-'));
  });

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('正しい形の record は読み込める', () => {
    writeRun(dir, '0001.json', VALID_RECORD);
    const runs = loadRuns(dir);
    expect(runs).toHaveLength(1);
    expect(runs[0].id).toBe('20260720T000000Z-1');
  });

  it('verdict が欠けている record は、そのファイル名を含むエラーで落ちる', () => {
    const broken: Record<string, unknown> = { ...VALID_RECORD };
    delete broken.verdict;
    writeRun(dir, '0002.json', broken);
    expect(() => loadRuns(dir)).toThrowError(/0002\.json/);
  });

  it('coveragePct が 100 を超えていたら 100 にクランプする', () => {
    writeRun(dir, '0001.json', {
      ...VALID_RECORD,
      verify: { ...VALID_RECORD.verify, coveragePct: 150 },
    });
    const runs = loadRuns(dir);
    expect(runs[0].verify.coveragePct).toBe(100);
  });

  it('coveragePct が 0 未満だったら 0 にクランプする', () => {
    writeRun(dir, '0001.json', {
      ...VALID_RECORD,
      verify: { ...VALID_RECORD.verify, coveragePct: -5 },
    });
    const runs = loadRuns(dir);
    expect(runs[0].verify.coveragePct).toBe(0);
  });

  it('runs ディレクトリが無い場合は空配列を返す', () => {
    expect(loadRuns(dir)).toEqual([]);
  });

  it('iteration 昇順に整列して返す（ファイル名順に依存しない）', () => {
    writeRun(dir, 'b.json', { ...VALID_RECORD, id: 'x-3', iteration: 3 });
    writeRun(dir, 'a.json', { ...VALID_RECORD, id: 'x-1', iteration: 1 });
    expect(loadRuns(dir).map((r) => r.iteration)).toEqual([1, 3]);
  });
});

describe('loadStatus', () => {
  let dir: string;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'loadstatus-test-'));
  });

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('status.json を読み込める', () => {
    fs.writeFileSync(
      path.join(dir, 'status.json'),
      JSON.stringify({
        state: 'RUNNING',
        reason: '正常稼働中',
        actor: 'system',
        updatedAt: '2026-07-20T10:00:00Z',
        resumeHint: 'n/a',
      })
    );
    expect(loadStatus(dir).state).toBe('RUNNING');
  });

  it('status.json が無い場合は HALTED を返す（不明を稼働中と誤認しない）', () => {
    const status = loadStatus(dir);
    expect(status.state).toBe('HALTED');
    expect(status.reason).toContain('status.json');
  });
});
