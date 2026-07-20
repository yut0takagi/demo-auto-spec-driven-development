# 完全自走ループ: 自己観測ダッシュボードを育てる自律開発リポジトリ

- **日付**: 2026-07-20
- **リポジトリ**: `yut0takagi/demo-auto-spec-driven-development`（public）
- **主軸SDK**: [h5i-python](https://github.com/h5i-dev/h5i-python)（多エージェント敵対オーケストレーション）

## 1. 目的

GitHub 上に、**issue を自分で立て → 自分で実装 → 敵対的レビュー → PR → develop へ自動マージ → 改善 issue を立てる…** を無人で無限に繰り返すリポジトリを作る。ループが育てる題材は **「ループ自身の稼働を可視化する Web アプリ（自己観測ダッシュボード）」**。データソースがループの実行ログと GitHub API なので、ネタが自動で増え続けループが枯れない。

### 成功条件
- `workflow_dispatch` / cron で起動した GitHub Actions が、人間の介入なしに 1 反復（issue選定→実装→敵対レビュー→PR→develop自動マージ→次issue生成）を完走する。
- 実装物は毎回 CI（lint/type/unit/E2E）を通過し、adversary エージェントの approve を得たものだけが develop にマージされる。
- 人間はいつでも確実にループを停止でき、停止時に不可逆な状態（マージ済みの壊れた変更）が残らない。
- `main` は常に安全（develop→main は人間ゲート）。

### 非目標（YAGNI / v1では扱わない）
- ループによる **orchestrator 自身・CI 定義の自己改変**（保護パスとして禁止。将来検討）。
- 複数リポジトリ・複数プロダクトの同時育成。
- Codex など Claude 以外のランタイム（後から追加できる設計にはするが v1 は Claude 2 役）。

## 2. 主要な決定事項

| 論点 | 決定 | 理由 |
|---|---|---|
| 実行エンジン | **GitHub Actions**（cron + workflow_dispatch） | PC 電源 off でも回る。GitHub 上で完結し再現可能 |
| エージェント構成 | **Claude 2 役**（builder / adversary）。OAuth トークン | 追加課金なしで開始。セットアップ最小。Codex は後から追加可能に |
| モデル | **builder=Sonnet / adversary=Haiku / ideation=Haiku**（Opus 不使用） | コスト最小化で無限に回す。安全は CI ゲートが担保 |
| 題材 | **自己観測ダッシュボード**（Next.js + TS） | データが自動で増えループが枯れない。リポを見た人に一発でコンセプトが伝わる |
| h5i の役割 | **内側の敵対ラウンドのエンジン**（案A） | 「h5i-python を使う」を正直に満たしつつ tmux を回避 |
| 安全境界 | **develop=全自動マージ / main=人間ゲート** | 完全自走と「壊れても main は安全」を両立 |
| 自己改変 | **v1では禁止**（orchestrator/workflows は保護パス） | 暴走で安全装置を壊すのを防ぐ |

## 3. アーキテクチャ（2層 + 3面）

```
┌─ GitHub Actions (cron 30min + 手動) ──────────────────────────┐
│  外側ループ = Python conductor + gh CLI                        │
│    issue選定 → branch → [内側ラウンド] → gate → PR → 自動マージ │
│                            │                    → 次issue生成    │
│                            ▼                                    │
│  内側ラウンド = h5i-python (launcher="client")                  │
│    builder.work → freeze → adversary.review → revise           │
│                 → verify(npm) → judge                           │
│      on_turn ─shellout─▶ claude -p (Claude Code CLI, 2役)       │
└────────────────────────────────────────────────────────────────┘
        │ 各反復が data/runs/*.json を追記
        ▼
  自己観測ダッシュボード (Next.js静的export → GitHub Pages)
```

3つの構成物：
- **`app/`** — 育てられるプロダクト（Next.js App Router + TypeScript）。ループ自身の稼働を可視化。
- **`orchestrator/`** — ループの脳（Python）。
- **`.github/workflows/`** — 実行基盤。

### ブランチ戦略
- `main`: 保護ブランチ。develop→main の昇格のみ、人間がマージ。
- `develop`: ループがゲート通過時に自動マージで無限に回す統合ブランチ。
- `loop/<issue#>-<slug>`: 各反復の作業ブランチ（develop から分岐）。

## 4. コンポーネント: orchestrator/

| ファイル | 役割 | 主な依存 |
|---|---|---|
| `loop.py` | 外側ループ本体。1 実行 = 1 反復。停止チェックポイントを持つ | 下記すべて |
| `github_ops.py` | `gh` CLI ラッパ（issue / branch / PR / merge / comment / label） | gh |
| `round.py` | 内側の敵対ラウンド。h5i-python 経路 + native フォールバック | h5i-orchestra, claude CLI |
| `ideation.py` | 次の改善 issue を 1〜3 件生成（永続化の心臓） | claude CLI |
| `record.py` | `data/runs/<id>.json` を書いてダッシュボードへ供給 | — |
| `gates.py` | 安全ゲート判定・保護パス判定・キルスイッチ読取 | — |
| `config.py` | 環境変数・予算・上限値の集中管理 | — |

### 既定パラメータ（config.py、環境変数で上書き可）
| 名前 | 既定値 | 意味 |
|---|---|---|
| `MAX_REVISE_CYCLES` (N) | 2 | adversary 棄却時に builder が revise する最大回数 |
| `MAX_CHANGED_LINES` | 400 | 自動マージを許す変更行数の上限 |
| `CIRCUIT_BREAKER_FAILS` (K) | 3 | 連続ゲート失敗でループを自動 halt するしきい値 |
| `DAILY_COST_BUDGET_USD` | 5 | 1 日あたりのトークンコスト上限（超過で halt）。Sonnet/Haiku 前提で低め |
| `PER_ITER_COST_BUDGET_USD` | 0.5 | 1 反復あたりのコスト上限（超過でその反復を中断） |
| `IDEATION_MAX_ISSUES` | 3 | 1 反復で生成する改善 issue の最大数 |
| `LOOP_CRON` | `*/30 * * * *` | cron 間隔 |

### round.py の要点
h5i を `launcher="client"` + `on_turn` コールバックで駆動し、コールバック内で `claude -p --model <model>` にシェルアウトする。これにより **tmux 不要**で GitHub 管理ランナー上で動く。

- 環境変数 `ORCHESTRATOR=h5i|native` で経路を切替。
- `native` 経路は同じ流れ（work→freeze→review→revise→verify→judge）を純 Python + `git worktree` で実装。h5i バイナリが CI で動かない場合のフォールバック。
- **立ち上げは native を先に緑化 → h5i 経路を有効化**、の順で確実に進める。

### エージェントの役割（敵対性の担保）
- **builder**: タスクを実装する。
- **adversary**: builder の成果物を **棄却を狙う敵対的プロンプト**でレビューする（「このエッジケースが漏れている」「このテストは実質を検証していない」等を具体的に指摘）。approve を出すのは本当に問題が無いときだけ。

### モデル構成（コスト最小化・無限稼働前提）
**Opus は使わない。** 役割ごとに最安の割り当て。すべて env で上書き可。

| 役割 | 既定モデル | 環境変数 | 理由 |
|---|---|---|---|
| builder | **Sonnet**（`claude-sonnet-5`） | `BUILDER_MODEL` | CI と adversary を突破する実装が要る。品質/コストのスイートスポット。Haiku 単体だと revise 増で逆に高コスト |
| adversary | **Haiku**（`claude-haiku-4-5`） | `ADVERSARY_MODEL` | 「棄却を狙い穴を探す」役。安いモデルでも敵対プロンプト＋具体的失敗証拠の要求で機能。甘く approve しても **CI(verify) が最終ゲート**なので安全側 |
| ideation | **Haiku**（`claude-haiku-4-5`） | `IDEATION_MODEL` | issue 生成は軽い。最安で十分 |

- **Opus へのエスカレーションは行わない**（明示的に除外）。revise が `MAX_REVISE_CYCLES` 尽きたら `loop:needs-human` に落とす。
- 運用で adversary の approve が甘すぎると判明したら `ADVERSARY_MODEL=claude-sonnet-5` に引き上げ可能。

## 5. 1 反復のライフサイクル（loop.py）

1. **停止チェック①**: キルスイッチ無効なら何もせず終了。
2. **選定**: `loop:ready` ラベルの最優先 open issue を 1 件取得。無ければ終了（次反復で ideation 分が来る）。
3. **branch**: `develop` から `loop/<issue#>-<slug>` を作成。
4. **内側ラウンド**: `builder.work(task)` → `freeze()` → `adversary.review()` → 棄却なら `builder.revise()` を最大 N 回 → `verify(["npm","run","verify"])`（lint+type+unit を中立 sandbox で）→ `judge()`。
5. **停止チェック②**: 無効ならブランチだけ残して終了（マージなし・コスト確定なし）。
6. **ゲート判定**（gates.py、§6）。
7. **PR + マージ**: `develop` へ PR を作成、adversary のレビューを **PR レビューコメントとして投稿**。**停止チェック③（マージ直前）**: 無効なら PR を開いたまま `loop:paused` を付けて終了。ゲート通過なら squash 自動マージ。ゲート不通過なら PR は開いたまま `loop:needs-human` を付けて反復終了。
8. **記録**: `data/runs/<id>.json` を追記（issue, cost, cycles, verdict, coverage, timing, agent別トークン）。
9. **次を発想**（ideation.py）: 現状（ダッシュボードの状態・カバレッジ穴・adversary が指摘した未対応点・バックログ）から改善 issue を 1〜3 件生成し `loop:ready` を付与。→ ループが尽きない。

## 6. 安全ゲート（gates.py）

### develop 自動マージの条件（すべて必須）
1. 全 CI グリーン（lint / typecheck / Vitest unit / Playwright E2E）。
2. adversary が approve。
3. 変更行数 ≤ 400（超過は `loop:needs-human`）。
4. **保護パス無変更**。

### 保護パス（ボットが触ったら即ブロック → `loop:needs-human`）
- `.github/workflows/**`（CI・ループ定義）
- `orchestrator/**`（ループの脳）
- `**/*.secret`, `.loop/**`（制御ファイル）
- ブランチ保護設定

→ **ループは自分の脳と安全装置を自己改変できない**。v1 では改善対象を実質 `app/` と `data/`・`docs/` に限定。将来ここは緩められる。

### main の保護
- 保護ブランチ。develop→main は人間のみがマージ。
- `release.yml` が定期的に develop→main の PR を開いて人間に判断を促す。

### 可逆性・封じ込め
- 全マージは squash で 1 コミット化 → revert 一発。
- develop の post-merge CI が赤なら **revert PR を自動生成**。
- `concurrency` により同時に 1 ループのみ。

## 7. 停止機構（人間介入で確実に止まる）

止め方を「速さ × 手段」で 4 層に。上ほど即時・強制、下ほど自動。

| 層 | 手段 | 効果 | 誰が / どうやって |
|---|---|---|---|
| **L1 即時ハード停止** | `gh workflow disable loop.yml`（＋ `gh run cancel <id>`） | cron が二度と発火しない。実行中も即 kill | 人間・1 コマンド。`enable` で復帰 |
| **L1' UI ボタン停止** | `control.yml`（workflow_dispatch, inputs: `pause/resume/halt`） | Actions 画面のボタンだけで停止 / 再開。CLI 不要 | 人間・GitHub UI |
| **L2 キルスイッチ** | リポ変数 `LOOP_ENABLED` ＋ ファイル `.loop/control.json` | 実行中の反復はマージ前に安全に離脱。cron は回るが即 no-op | 人間 `gh variable set LOOP_ENABLED --body false`、またはファイル commit |
| **L3 スコープ封じ込め** | main 人間ゲート（既存） | 自走被害は develop に限定・常に revert 可能 | 設計で常時 ON |
| **L4 自動サーキットブレーカ** | 連続失敗 K 回 / 日次コスト超過 / develop post-merge CI 赤 | 自動で `LOOP_ENABLED=false` にし `loop:halted` issue 発行＋ revert PR | 人間不要・自動 |

### 半端な状態を残さない 3 チェックポイント（§5 と対応）
1. 反復開始時 → 無効なら何もせず終了。
2. 内側ラウンド完了後・PR 作成前 → 無効ならブランチだけ残して終了。
3. 自動マージ直前 → 無効なら PR を開いたまま `loop:paused` を付けて終了。

→ 人間が途中でスイッチを切っても、最悪でも「レビュー待ちの open PR」が残るだけ＝**不可逆な操作は一切走らない**。

### 可視化・再開
- ダッシュボードに大きなステータスバッジ `RUNNING / PAUSED / HALTED` と _理由・停止主体・再開手順_ を常時表示。
- README 最上部に「🛑 今すぐ止める: `gh workflow disable loop.yml`」を明記。
- 再開: `LOOP_ENABLED=true` に戻す or `control.yml` の resume。halted からの復帰は人間が理由確認後。

## 8. Web アプリ（app/）

- **技術**: Next.js（App Router）+ TypeScript、`output: 'export'` で静的化。
- **データソース**: (a) リポジトリにコミットされた `data/runs/*.json`（各反復の記録）、(b) GitHub REST/GraphQL API（issue/PR/CI 実行、public リポなので未認証読取で可）。
- **主要ビュー**:
  - 稼働ステータスバッジ（RUNNING / PAUSED / HALTED）。
  - 反復タイムライン（issue → 実装 → レビュー → マージ）。
  - メトリクス推移: 反復数、adversary approve/reject 率、1 反復あたりコスト、サイクルタイム、テストカバレッジ。
  - 直近の改善 issue とバックログ。
- **デプロイ**: GitHub Pages（`pages.yml`）。外部アカウント・Secret 不要で自己完結。

## 9. GitHub Actions

| workflow | trigger | 内容 |
|---|---|---|
| `loop.yml` | cron(30min) + workflow_dispatch | node / h5i / claude をセットアップ → `python -m orchestrator.loop`。Secrets: `CLAUDE_CODE_OAUTH_TOKEN`。`concurrency: loop`（同時 1）。`if: vars.LOOP_ENABLED != 'false'` |
| `ci.yml` | PR / push | lint → typecheck → Vitest → Playwright（= verify ゲート） |
| `pages.yml` | push(develop) | Next.js を static export → GitHub Pages デプロイ |
| `control.yml` | workflow_dispatch(pause/resume/halt) | `LOOP_ENABLED` 変数と `.loop/control.json` を操作する UI 停止ボタン |
| `release.yml` | 手動 / 定期 | develop→main の PR を開き人間に昇格を促す |

## 10. テスト戦略（脳を先に信頼する）

- **orchestrator は先に pytest で固める**（gh / claude をモック）→ 自走させる前にループの脳（選定・ゲート・停止チェックポイント・記録）が正しいことを保証。
- **app は Vitest(unit) + Playwright(E2E)** → これが agent が越えるべき verify ゲート。
- **`LOOP_DRY_RUN=1`**: マージ以外を全部やるドライラン → 初回の live 検証に使う。

## 11. 立ち上げ順序（確実に緑にする）

1. リポジトリ + 空アプリ + CI 緑。
2. orchestrator を native 経路で pytest 緑。
3. `workflow_dispatch` で dry-run 1 反復。
4. develop 自動マージを 1 反復実走。
5. h5i 経路を有効化。
6. cron ON で自走開始。

## 12. 必要な事前準備（人間側）

- `CLAUDE_CODE_OAUTH_TOKEN` を `claude setup-token` で発行し、リポジトリ Secret に登録。
- GitHub Pages を有効化（Actions ソース）。
- `main` にブランチ保護（PR 必須・人間レビュー必須）を設定。
- リポ変数 `LOOP_ENABLED=true` を初期登録。

## 13. リスクと緩和

| リスク | 緩和策 |
|---|---|
| h5i バイナリが CI で headless 動作しない | native 経路をフォールバックとして同梱、`ORCHESTRATOR` で切替。先に native で緑化 |
| エージェントの暴走・無限コスト | 日次/反復コスト予算、L4 サーキットブレーカ、concurrency=1 |
| 安全装置の自己破壊 | orchestrator/workflows を保護パス化（自己改変禁止） |
| 壊れた変更が main に到達 | main 人間ゲート、develop post-merge 赤で revert PR 自動生成 |
| 途中停止で半端な状態 | 3 チェックポイントでマージ直前に離脱、最悪でも open PR のみ |
| OAuth トークンの期限切れ | ループが認証失敗を検知したら halt + issue 発行（人間に通知） |

## 14. GitHub Actions の制限に関する設計上の前提

- **public リポジトリを維持する** → GitHub-hosted runner の実行時間が無料・無制限。private にすると月 2000 分無料枠を 30 分 cron が即枯渇させるため、private 化する場合は self-hosted runner か有料枠が前提になる。
- **cron はベストエフォート**（高負荷時は遅延・稀にスキップ）。ループは issue 駆動で冪等なので、遅延・スキップしても次回起動で続きから安全に再開する。
- **60 日無活動で scheduled workflow が自動停止**する仕様があるが、ループは常時 commit するため該当しない。
- **`GITHUB_TOKEN` は他の workflow を連鎖トリガーしない**（無限再帰防止）。したがってボット作成 PR では `ci.yml` が発火しない前提で設計する: **verify（lint/type/unit/E2E）はループジョブ内で `c.verify()` として直接実行**し、別 workflow の発火に依存しない。`ci.yml` は人間 PR 用の二次的セーフティネットと位置づける。
- 真に監視すべき上限は GHA ではなく **Claude 側の利用量/コスト**。§13 の日次/反復コスト予算と L4 サーキットブレーカで自動停止する。
