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

/**
 * 1 反復の最終結果。
 * - `merged`      ゲートを通過し develop にマージされた
 * - `abandoned`   ゲートを再試行しても満たせず、人間に振らず自動で見送った（issue はクローズ）
 * - `needs-human` 旧経路。ゲート不通過を人間に委ねていた（現行ループは発行しない）
 * - `paused`      キルスイッチによりマージ直前で停止した（PR は開いている）
 * - `dry-run`     ドライラン。マージ以外は実行した
 * - `failed`      反復が例外で異常終了した
 *
 * `paused` と `dry-run` を分けているのは、前者が「人間が止めた」、後者が
 * 「最初からマージしない設定だった」という別事象だから。`needs-human` は既存 record が
 * 持つため型としては残すが、現行ループは `abandoned` を出す。
 */
export type Verdict = 'merged' | 'abandoned' | 'needs-human' | 'paused' | 'dry-run' | 'failed';

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
  /**
   * ゲートを通過しなかった理由。通過した場合は空配列。
   * これが無いと `needs-human` の反復をダッシュボードが説明できない。
   */
  gateReasons: string[];
  /** この反復が開いた PR 番号。PR 到達前に終了した場合は null */
  prNumber: number | null;
  adversary: {
    approved: boolean;
    summary: string;
  };
  /**
   * 検証結果。`npm run verify`（lint/typecheck/unit/build）と
   * `npm run test:e2e` はゲート上も別条件なので、別々に記録する。
   */
  verify: {
    unitPassed: boolean;
    e2ePassed: boolean;
    /** 0..100 */
    coveragePct: number;
  };
  changedLines: number;
  cost: {
    builderUsd: number;
    adversaryUsd: number;
    ideationUsd: number;
    plannerUsd?: number;
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
