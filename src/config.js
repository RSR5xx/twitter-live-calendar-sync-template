import { readFileSync, existsSync } from "node:fs";

const CONFIG_PATH = new URL("../config.json", import.meta.url).pathname;
const CREDENTIALS_PATH = new URL("../credentials.json", import.meta.url).pathname;
const TOKEN_PATH = new URL("../token.json", import.meta.url).pathname;
const TWITTER_CREDENTIALS_PATH = new URL("../twitter-credentials.json", import.meta.url).pathname;

export function loadConfig() {
  if (!existsSync(CONFIG_PATH)) {
    throw new Error(
      "config.json が見つかりません。config.example.json をコピーして config.json を作成し、twitterUsername 等を設定してください。"
    );
  }
  const raw = JSON.parse(readFileSync(CONFIG_PATH, "utf-8"));
  return {
    twitterUsername: raw.twitterUsername,
    calendarId: raw.calendarId ?? "primary",
    lookbackTweetCount: raw.lookbackTweetCount ?? 30,
    // ツイートのラベル文字列(日程・会場・料金など)をカスタマイズしたい場合に上書きする。
    // 未指定のキーは parseTweet.js の DEFAULT_FORMAT が使われる。
    format: raw.format ?? {},
  };
}

export function loadTwitterBearerToken() {
  if (!existsSync(TWITTER_CREDENTIALS_PATH)) {
    throw new Error(
      "twitter-credentials.json が見つかりません。X Developer PortalでBearer Tokenを取得し、{ \"bearerToken\": \"...\" } の形式で保存してください。"
    );
  }
  const raw = JSON.parse(readFileSync(TWITTER_CREDENTIALS_PATH, "utf-8"));
  if (!raw.bearerToken) throw new Error("twitter-credentials.json に bearerToken がありません。");
  return raw.bearerToken;
}

export const paths = {
  credentials: CREDENTIALS_PATH,
  token: TOKEN_PATH,
};
