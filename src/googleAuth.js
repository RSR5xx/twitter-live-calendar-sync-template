// Google Calendar API への OAuth 認証。
// 事前に Google Cloud Console で OAuth クライアント(デスクトップアプリ)を作成し、
// credentials.json としてプロジェクト直下に置いておく必要がある(README参照)。

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { google } from "googleapis";
import http from "node:http";
import open from "open";
import { paths } from "./config.js";

const SCOPES = ["https://www.googleapis.com/auth/calendar.events"];
const REDIRECT_PORT = 3577;
const REDIRECT_URI = `http://localhost:${REDIRECT_PORT}/oauth2callback`;

function loadCredentials() {
  if (!existsSync(paths.credentials)) {
    throw new Error(
      "credentials.json が見つかりません。Google Cloud Console で作成したOAuthクライアント(デスクトップアプリ)のJSONを、プロジェクト直下に credentials.json として保存してください。詳細はREADME参照。"
    );
  }
  const raw = JSON.parse(readFileSync(paths.credentials, "utf-8"));
  return raw.installed ?? raw.web;
}

async function promptForNewToken(oAuth2Client) {
  const authUrl = oAuth2Client.generateAuthUrl({
    access_type: "offline",
    scope: SCOPES,
    prompt: "consent",
  });

  console.log("\nブラウザでGoogleの認可画面を開きます。表示されない場合は以下のURLを開いてください:");
  console.log(authUrl, "\n");

  const code = await new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      const url = new URL(req.url, REDIRECT_URI);
      if (url.pathname !== "/oauth2callback") return;
      const code = url.searchParams.get("code");
      res.end("認可が完了しました。このタブは閉じて構いません。");
      server.close();
      if (code) resolve(code);
      else reject(new Error("認可コードが取得できませんでした"));
    });
    server.listen(REDIRECT_PORT, () => {
      open(authUrl).catch(() => {});
    });
  });

  const { tokens } = await oAuth2Client.getToken(code);
  oAuth2Client.setCredentials(tokens);
  writeFileSync(paths.token, JSON.stringify(tokens, null, 2), "utf-8");
  console.log(`トークンを ${paths.token} に保存しました。`);
  return oAuth2Client;
}

export async function getAuthorizedClient() {
  const creds = loadCredentials();
  const oAuth2Client = new google.auth.OAuth2(creds.client_id, creds.client_secret, REDIRECT_URI);

  // アクセストークンが自動更新されたら token.json にも書き戻しておく
  oAuth2Client.on("tokens", (tokens) => {
    const merged = { ...(existsSync(paths.token) ? JSON.parse(readFileSync(paths.token, "utf-8")) : {}), ...tokens };
    writeFileSync(paths.token, JSON.stringify(merged, null, 2), "utf-8");
  });

  if (existsSync(paths.token)) {
    const token = JSON.parse(readFileSync(paths.token, "utf-8"));
    oAuth2Client.setCredentials(token);
    return oAuth2Client;
  }

  return promptForNewToken(oAuth2Client);
}

// `npm run auth:google` で直接実行された場合は認可フローだけを走らせる
if (import.meta.url === `file://${process.argv[1]}`) {
  getAuthorizedClient()
    .then(() => console.log("Google認証が完了しました。"))
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}
