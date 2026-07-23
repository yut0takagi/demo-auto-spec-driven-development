This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## ダッシュボードの見方

トップページ (`src/app/page.tsx`) に並ぶ各グラフ・パネルの意味は以下の通りです。

- **直近の反復サマリー**: 最新反復の判定 (verdict) を吹き出し形式で表示したもの。merged/abandoned/needs-human/paused/dry-run/failed で見出し・色分けが切り替わり、Adversary のレビューコメント（またはゲート不通過理由）を本文に表示する。
- **カバレッジ推移**: 各反復のユニットテストカバレッジ(%)の時系列推移。
- **累計コスト**: 各反復にかかった Builder/Adversary/Ideation 合計費用(USD)の推移。
- **承認率推移**: Adversary レビューが承認 (approved) した割合(%)の推移。
- **マージ率推移**: 反復した PR が実際にマージされた割合(%)の推移。
- **E2E失敗率推移**: verify に到達した反復のうち `npm run test:e2e` が失敗した割合(%)の累積推移。failed（クラッシュ）反復は verify に到達しておらず未測定のため含めない。
- **変更行数推移**: 各反復でコミットされた diff の変更行数(changedLines)の時系列推移。failed（クラッシュ）反復はコミット前に終了しており未測定のため含めない。
- **Builder改善の前反復比較**: 直近2件の測定済み(verify到達済み)反復について、revise回数・変更行数・カバレッジ・builderコストを前反復と比較し、各指標が改善/悪化/変化なしのいずれかを表示する。測定済み反復が2件未満の場合は「データなし」を表示する。
- **モデルコストの内訳**: 全反復の累計コストを Builder/Adversary/Ideation の役割別、および実際に使われたモデル名別に集計した内訳。failed（クラッシュ）反復も実際に費用が発生しているため含める。
- **revise 回数の分布**: 各反復の revise 回数を棒グラフで示し、中央値（実線）と外れ値の閾値（破線）を重ねたもの。閾値を超えるバーは赤色で強調される。
- **直近の反復**: 直近 20 件の反復を新しい順に並べ、判定 (verdict)・revise 回数・コストを一覧表示したもの。
- **ループが生成した改善バックログ**: 各反復の完了時にループが自動生成した次の issue 候補の一覧。

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
