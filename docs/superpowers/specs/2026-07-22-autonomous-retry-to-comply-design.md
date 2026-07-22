# 全自動ループ: retry-to-comply と needs-human 廃止

- 日付: 2026-07-22
- 状態: 承認済み（実装へ）
- 背景: ループが gate 不通過時に `needs-human` を出して人間に判断を委ねていた。
  ユーザー要件は「**絶対に needs-human を出さない。AI が全自動で開発し続ける**」。

## 目的

gate（verify / e2e / adversary / 400行 / 保護パス）は品質バーとして**維持**したまま、
不通過時に人間へ振らず、**AI に再試行させて満たす（retry-to-comply）**。満たせない場合は
人間に振らず**自動で見送り（abandoned）て次の issue へ**進む。

## 振る舞いの変更

### 1. round を「緑になるまで直す」ループに（core: `orchestrator/round.py`）

現状 `run_native_round` の revise ループは adversary 棄却のみに反応し、verify / e2e は末尾で
1回測るだけで builder に戻さない。これを次に変える:

- builder が初回実装 → 以後サイクルごとに `npm run verify` → `npm run test:e2e` を実行し、
  両方緑のときだけ adversary レビューを回す（壊れたコードのレビューは無駄なので回さない）。
- verify / e2e / adversary のいずれかが不通過なら、その**失敗出力を REVISE プロンプトに載せて**
  builder に修正させ、次サイクルへ。3つ全部緑になったら終了。
- `max_revise_cycles`（既定 2 → **3**）を使い切ったら諦めて現状の outcome を返す。
- `RoundOutcome` の形（verify_passed / e2e_passed / adversary / revise_cycles / cost）は不変。
  `revise_cycles` の意味は「adversary 起因の revise 回数」から「gate 起因の revise 回数」へ拡張。

### 2. `loop.py`: needs-human を廃止、gate 判定を PR より前へ

- **gate を push / PR の前に評価**する。現状は PR を開いてから gate を見るため needs-human でも
  PR が残っていた。新設計では **gate 通過時のみ push → PR → merge**。
- gate **不通過**（verify/e2e/adversary 不通過、>400行、保護パス変更）→ **abandoned**:
  人間に振らず `_abandon_issue` を呼ぶ。push も PR も作らない。
- builder が無変更（`commit_all` が False）→ **abandoned**。
- `paused`（キルスイッチ）は据え置き（人間起点の停止。gate は通過済みで PR あり）。
- `dry-run` は据え置き。

`_abandon_issue(gh, issue, reasons, cfg)`:
1. `gh.remove_label(issue, loop:ready)`（再拾い防止）
2. `gh.close_issue(issue, comment)` — コメント例:
   「🤖 gate を {n} 回の再試行で満たせず自動見送り（needs-human は出さない方針）。理由: {reasons}」
   `loop:abandoned` ラベルを付けてから close（観測用に closed でフィルタ可能に）。
3. record を書く（`verdict="abandoned"`, `pr_number=None`, `gate_reasons=reasons`）。
4. `IterationResult(status="abandoned", ...)` を返す。

### 3. データ契約に `abandoned` を追加（言語跨ぎ: Python ↔ TS）

- `models.py` `Verdict`: `"abandoned"` を追加。**`"needs-human"` は既存 record（0007/0008 等）が
  持つため型としては残す**（新規発行はしない）。
- `dashboard/src/lib/types.ts` `Verdict` / `loadData.ts` `VALID_VERDICTS`: `'abandoned'` を追加。
- ブレーカの「失敗」集合に `abandoned` を追加:
  - `orchestrator/gates.py` `BREAKER_FAILURE_VERDICTS` = `{failed, needs-human, abandoned}`
  - `dashboard/src/lib/aggregate.ts` `BREAKER_TRIP_VERDICTS` = `[failed, needs-human, abandoned]`
  （abandoned は needs-human が担っていた「連続非マージ」の役割を継ぐ。ブレーカは toothless の
  ままなので停止はせず、観測シグナルとしてのみ機能）
- `dashboard/src/components/IterationTimeline.tsx`: `abandoned` の表示色を追加。

### 4. 保護パス

保護パス（`.github/` / `orchestrator/` / `tests/` / `.loop/`）は**触らせない**まま。
そういう issue は gate（保護パス検出）で不通過 → abandoned で自動見送り。AI が自分の
ガードレール（gate / loop / tests / CI）を書き換える事故を防ぐ。

## 影響を受けるユニット

| ファイル | 変更 |
|---|---|
| `orchestrator/round.py` | comply ループ、REVISE プロンプト拡張 |
| `orchestrator/loop.py` | gate を PR 前へ、needs-human → `_abandon_issue`、GhLike に close_issue |
| `orchestrator/github_ops.py` | `close_issue` 追加 |
| `orchestrator/models.py` | Verdict に `abandoned` |
| `orchestrator/gates.py` | BREAKER_FAILURE_VERDICTS に `abandoned` |
| `orchestrator/config.py` | `abandoned_label`、`max_revise_cycles` 既定 3 |
| `dashboard/src/lib/types.ts` `loadData.ts` `aggregate.ts` | `abandoned` 追加 |
| `dashboard/src/components/IterationTimeline.tsx` | `abandoned` 色 |

## テスト

- `tests/test_round.py`: verify/e2e 失敗 → revise → 緑、緑になるまで再試行、上限打ち切りを検証。
- `tests/test_loop.py`: needs-human 系テストを abandoned（close_issue 呼ぶ / PR 作らない /
  verdict abandoned / ready 除去）へ置換。gate 通過 → merge は維持。FakeGh に close_issue 追加。
- `tests/test_github_ops.py`: `close_issue` のコマンド形。
- dashboard: `aggregate.test.ts`（breaker に abandoned）、`IterationTimeline.test.tsx`
  （abandoned 描画）、`loadData` の VALID_VERDICTS。

## 非目標（YAGNI）

- h5i 経路（`h5i_round.py`）の comply 化は対象外（native のみ。ORCHESTRATOR=native が現行）。
- 1 run = 1 issue のまま（「連続開発」は cron が担う）。複数 issue の一括処理はしない。
- カバレッジ計測の実装（本番 record は coveragePct=0.0 のまま。別イシュー）。
- 予算ブレーカを停止機構にする改修（toothless のまま。予算無視方針）。

## 運用

- 実装中はループを一時停止（`LOOP_ENABLED=false`）。マージ後に `true` で再開。
