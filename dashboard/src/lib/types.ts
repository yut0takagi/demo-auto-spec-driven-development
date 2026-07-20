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
