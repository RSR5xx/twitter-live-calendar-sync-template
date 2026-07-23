# twitter-live-calendar-sync

自分のX(Twitter)アカウントの「LIVE INFO」ツイートを解析し、Googleカレンダーに自動反映するツール。
X公式API(従量課金)を使うため、BANのリスクなく安全に動作する。

このリポジトリはセルフホスト用のテンプレート。共有サーバーは無く、各自が自分のX APIキー・
Google認証情報を使って、自分のフォークで動かす。ラベルや日付/時刻の書式も`config.json`で
自分のアカウントの投稿フォーマットに合わせて変更できる。

## 対応フォーマット

**告知パターン**
```
☔️LIVE INFO☔️

「タイトル」
日程｜7/25（土）
時間｜OPEN 9:15 START 10:00
会場｜会場名
料金｜前売り¥4,000

入場特典🎁：チェキ券
https://...

#ハッシュタグ
```

**出番(タイムテーブル)パターン**（同じライブの続報。見出しが無くても「出番」があればこちら扱い）
```
☔️LIVE INFO☔️
🕰️タイムテーブル公開！！🕰️
「タイトル」
日程｜7/25（土）
出番｜16:40~17:05
物販｜17:25~18:45
会場｜会場名
料金｜前売り¥4,000

入場特典🎁：チェキ券
https://...

#ハッシュタグ
```

ラベル文字列(トリガーマーカー・日程・会場・料金・特典・出番・物販)、タイトルの囲み文字、
日付・時刻の書き方(正規表現)は `config.json` の `format` で自由にカスタマイズできる(後述)。

### カレンダー登録のルール

- **「出番」の時間が確定して初めて時刻指定の予定にする**。OPEN/STARTしか出ていない(出番がまだ未確定な)告知段階では、本人の出演時間として正確ではないため、その日の**終日予定**として登録する。
- 「出番」が確定した時刻指定の予定では、**開始時刻**は出番の開始、**終了時刻**は「物販」の終了 > 「出番」の終了、の優先順で決める。
- **タイトル＋日程が同じ**ツイートは同一イベントとみなし、後から来たツイート(出番の続報など)で既存の予定を上書き更新する(重複登録しない)。終日予定→時刻指定の予定への更新もこの仕組みで行われる。
- **説明欄**にはタイトルの括弧から始まる元ツイートの内容をそのまま使う(先頭の「☔️LIVE INFO☔️」等の前置きや「元ツイート」リンクは含めない)。
- 手動で入れておいた「**ライブ予定（キーワード）**」のような仮予定は、同じ日付・会場名(ローマ字表記のゆらぎも一部考慮)にキーワードが含まれる予定が同期されたタイミングで自動的に削除される(新規作成時・更新時どちらでも動作)。

## セットアップ

事前にNode.js(18以上)が必要。

### 0. このリポジトリを自分用に用意する

このリポジトリをフォークするか、`git clone`した上で自分のGitHubアカウントに新規リポジトリとして
push し直す。自動実行(後述)を使う場合、`data/state.json`にツイートIDやカレンダーイベントIDが
記録されるため、**非公開(Private)リポジトリを推奨**。

### 1. 依存パッケージのインストール

```bash
cd twitter-live-calendar-sync
npm install
```

### 2. config.json の作成

```bash
cp config.example.json config.json
```

- `twitterUsername`: 自分のXのユーザー名（@なし）
- `format`: ツイートのラベルや日付/時刻の書き方を変えたい場合のみ上書き(未指定ならデフォルトのまま)

### 3. X API の Bearer Token を用意する

1. [developer.x.com](https://developer.x.com/) で開発者アカウントを作成
2. [console.x.com](https://console.x.com) の「Projects & Apps」でProject/Appを作成し、支払い方法を登録して従量課金(Pay Per Use)を有効化
   - 登録時に「利用目的」を聞かれる場合は、「自分自身の公開ツイートを取得し個人のGoogleカレンダーに転記するための個人利用ツール。第三者データの収集・再配布は行わない」という趣旨で回答する
3. 作成したAppの「Keys and tokens」タブ→「アプリ専用認証」の「ベアラートークン」を生成
4. プロジェクト直下に `twitter-credentials.json` を作成し、以下の形式で保存(Gitの管理対象外):
   ```json
   { "bearerToken": "取得したBearer Token" }
   ```

このBearer Tokenは公開アカウントであれば任意のユーザーのツイートを読み取れる(投稿はできない、読み取り専用)。

**費用の目安**: ツイート読み取りは1件$0.005。`lookbackTweetCount`件を毎回取得するので、
1日4回・30件取得なら月間約3,600件 ≈ 月$18程度。同期頻度を下げるほど安くなる(週1回なら月1ドル未満)。

### 4. Google Calendar API の認証情報を用意する

1. [Google Cloud Console](https://console.cloud.google.com/) で新規プロジェクトを作成(または既存のものを選択)
2. 「APIとサービス」→「ライブラリ」から **Google Calendar API** を有効化
3. 「APIとサービス」→「OAuth同意画面」を設定
   - ユーザータイプは「外部」
   - 「テストユーザー」に、**実際にカレンダーへ反映させたいGoogleアカウント**のメールアドレスを追加
     (プロジェクトを作るアカウントと、実際に認証でログインするアカウントは別でもよい)
4. 「認証情報」→「認証情報を作成」→「OAuthクライアントID」→ アプリケーションの種類は **デスクトップアプリ**
5. 作成したクライアントのJSONをダウンロードし、このプロジェクト直下に `credentials.json` という名前で保存

### 5. Google認証

```bash
npm run auth:google
```

ブラウザが開くので、**カレンダーに反映させたいGoogleアカウント**でログインして権限を許可する。トークンは `token.json` に保存される。

## 実行

```bash
npm run sync
```

- 前回処理したツイートID以降の新しいツイートのみを解析してカレンダーに反映する(`data/state.json` に記録)。
- 初回実行時は `lookbackTweetCount` 件のツイートをすべて処理する。

パーサーの単体テストは以下で実行できる:
```bash
npm run test:parser
```

## 定期実行(GitHub Actions)

パソコンを開いていなくても、GitHub Actionsで自動実行できる。`.github/workflows/sync.yml` に
サンプルのスケジュール(毎週火曜15:00 JST = 06:00 UTC)が入っているので、`cron`の値を好きな
曜日・時間に書き換える(GitHub Actionsのcronは常にUTC基準)。`workflow_dispatch`により手動実行も可能。

GitHub Actionsで自動化する場合、以下の追加設定が必要:

1. **`.gitignore`から `config.json` と `data/` を削除する**(コメントアウトでも可)。
   Actionsが `data/state.json` の更新を都度コミットして状態を引き継ぐ必要があるため。
2. `config.json` を自分の設定でコミットする(ユーザー名など。秘密情報は含まれない)。
3. 自分のリポジトリの Settings → Secrets and variables → Actions で、以下を登録する:

   | Secret名 | 内容 |
   |---|---|
   | `GOOGLE_CREDENTIALS_JSON` | `credentials.json` の中身そのまま |
   | `GOOGLE_TOKEN_JSON` | `token.json` の中身そのまま |
   | `TWITTER_CREDENTIALS_JSON` | `twitter-credentials.json` の中身そのまま |

4. リポジトリの Settings → Actions → General → Workflow permissions で
   「Read and write permissions」を有効にする(ワークフローが `data/state.json` をpushできるようにするため)。

## ファイル構成

- `src/twitterApi.js`: X API v2でのツイート取得(App-only Bearer Token)
- `src/parseTweet.js`: ツイート本文の解析(フォーマット設定駆動)
- `src/googleCalendar.js`: Googleカレンダーへのupsert・仮予定の自動置き換え
- `src/index.js`: 全体のオーケストレーション
- `.github/workflows/sync.yml`: 自動実行用のGitHub Actionsワークフロー(サンプル)
- `data/state.json`: 前回処理したツイートID・eventKeyとカレンダーイベントIDの対応(既定ではGit管理対象外)
- `config.json`: 個人の設定(既定ではGit管理対象外、`config.example.json`をコピーして作成)
- `credentials.json` / `token.json` / `twitter-credentials.json`: 秘密情報(常にGit管理対象外、GitHub Actionsでは上記Secretsから復元)

## 既知の制約

- 現状は1アカウント・1つのツイートフォーマットを前提に動作する。複数アカウント/複数フォーマットに対応する場合は `config.json` を複製して別プロセスとして動かす想定。
- 「ライブ予定（キーワード）」の仮予定置き換えは、同じ日付内でキーワードが会場名の部分文字列として一致するかで判定している。キーワードが曖昧すぎる/複数の会場に一致しうる場合は誤爆の可能性がある。
