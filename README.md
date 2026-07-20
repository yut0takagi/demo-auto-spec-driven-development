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
