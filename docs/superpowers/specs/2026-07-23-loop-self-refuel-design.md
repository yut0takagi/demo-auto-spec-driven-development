# 設計: ループを枯れさせない自己給油（loop self-refuel）

- **日付**: 2026-07-23
- **状態**: 承認済み（ユーザー「任せる全部」）
- **スコープ**: A（枯れない・最小）
- **ブランチ**: `feat/loop-self-refuel` → develop へ PR

## 背景 / 問題

自己駆動ループの ideation（次の `loop:ready` issue を生成する燃料補給）は、
`run_iteration` の **マージ成功後（[loop.py:236-242]）にしか走らない**。制御フローは:

```
ready が空        → 即 return no-work（136-138 行）   … ideation に到達しない
gate 不通過       → _abandon（182 行）                … ideation に到達しない
dry-run / paused → return                            … ideation に到達しない
merge 成功        → ここで初めて ideation（236 行）     … 燃料生成
```

結果、**バックログが 0 になると 138 行で即 return し、ideation に永遠に到達しない** →
燃料 0 のまま二度と復活しない。abandon が続いても燃料は減る一方で補充されず、
じわじわ枯れて「run は success に見えるのに no-work 永久ループ」で静かに死ぬ。

2026-07-23 に実観測: バックログを 0 にした直後、以降のスケジュール run はすべて no-work。

## ゴール（スコープ A）

ideation を merge から切り離し、**バックログが薄くなったら反復先頭で先回り給油**することで、
ループが構造的に枯れない（＝止まったように見えない）ようにする。

## 非ゴール（今回やらない / YAGNI）

- ブレーカ halt からの自動再開（スコープ B）
- 外部 cron トリガー化（GitHub schedule 間引き対策は別件）
- ideation の目標変更（「自己観測ダッシュボード改善」の baked-in goal は維持）
- develop→main の自動昇格（**main 昇格は人間ゲートのまま**）

## 設計

### 1. 設定追加（`orchestrator/config.py`）

- `ideation_low_water: int = 2`（env `IDEATION_LOW_WATER`）— `len(ready) < low_water` で給油
- 既存の `ideation_max_issues=3` / `ideation_model="claude-haiku-4-5"` はそのまま
- **開き過ぎ防止は構造で担保**: 給油は閾値未満のときだけ実行するため、
  open な `loop:ready` の総数は自然に `low_water - 1 + max_issues ≈ 4` に収束。別キャップ不要。

### 2. 制御フロー変更（`orchestrator/loop.py` `run_iteration`）

136-138 行を次で差し替える:

```python
ready = gh.list_ready_issues(cfg.ready_label)
ideation_cost, next_issues = 0.0, []
if len(ready) < cfg.ideation_low_water:                  # 低水位で先回り給油
    open_titles = {i.title for i in ready}
    proposals, ideation_cost = ideation_runner(
        context=_refuel_context(ready), cfg=cfg, cwd=repo_root
    )
    proposals = [p for p in proposals if p["title"] not in open_titles]  # dedup
    next_issues = [
        gh.create_issue(title=p["title"], body=p["body"], labels=[cfg.ready_label])
        for p in proposals
    ]
    ready = gh.list_ready_issues(cfg.ready_label)         # 再取得
if not ready:                                            # 給油しても 0 件
    return IterationResult(status="no-work", iteration=iteration)  # graceful, 次 cron で再試行
issue = ready[0]
# 以降の 着手 → commit → gate → push → PR → merge は既存のまま
```

- **merge 後 ideation（236-242 行）は削除**。給油点を反復先頭の 1 箇所に一本化。
- `context` は「直前に完了した issue」に依存しないもの（例: 現在の ready 件数 / リポジトリ状態を読ませる）。
  ideation プロンプトは元々 `cwd=repo_root` でリポジトリを読めるため、context は薄くてよい。

### 3. コスト会計の引き回し

ideation を先頭に移したので、`ideation_cost` / `next_issues` は反復冒頭で確定する。
これを **全 exit パス（merged / abandoned / paused / dry-run）の `_record` と `_abandon` に引き回して記録**する。
（従来 `_abandon` は `ideation_cost=0.0` 固定だった。給油した反復が abandon で終わっても
コストが記録から消えないようにする。）方式1の唯一の地味な作業。

### 4. dedup（重複提案の抑止）

給油前に現在オープンな `loop:ready` の題名集合を取り、**同名提案はスキップ**。
枯れ際に同じ issue を再生成する事故を防ぐ。閉じ済み（実装済み）の焼き直しは、
既存プロンプトの「既存機能の焼き直しではなく」に委ねる（最小構成）。

### 5. エラー処理

- ideation が例外 / 0 件 → 「新燃料なし」として扱い、ready がまだ空なら `no-work`（**クラッシュさせない**・次 cron 再挑戦）
- `loop:ready` ラベルは GitHub 上に実在（確認済み）→ `create_issue` は失敗しない
- 予算は haiku で数セント / 既存の日次予算ブレーカが引き続き支配。**自動再開は入れない（スコープ A）**

## テスト（`tests/test_loop.py` 流・FakeGh + fake ideation_runner 注入）

1. `ready < low_water` → ideation が 1 回呼ばれ `ready_label` 付きで作成 → `ready[0]` に着手
2. `ready >= low_water` → ideation は**呼ばれない**（呼び出し 0 を assert）
3. 枯渇 + ideation が `[]` → `no-work`・例外なし
4. dedup: 既存オープンと同名提案はスキップ（作成されない）
5. コスト会計: 冒頭給油の `ideation_cost` が **abandoned 反復でも**記録される

## ロールアウト

feature ブランチ `feat/loop-self-refuel` → PR → **develop にマージ**（main 昇格は従来どおり人間）。
develop CI（dashboard verify/e2e）はこの変更に無関係だが緑を確認。orchestrator の pytest は
ローカル検証が唯一のゲート（CI では走らない）ため、ローカルで全通過を必須とする。
