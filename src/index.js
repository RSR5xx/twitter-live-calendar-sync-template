import { loadConfig, loadTwitterBearerToken } from "./config.js";
import { loadState, saveState } from "./state.js";
import { getUserId, fetchOwnTweets } from "./twitterApi.js";
import { parseLiveInfoTweet } from "./parseTweet.js";
import { upsertCalendarEvent } from "./googleCalendar.js";

async function main() {
  const config = loadConfig();
  if (!config.twitterUsername) {
    throw new Error("config.json の twitterUsername を設定してください。");
  }
  const bearerToken = loadTwitterBearerToken();

  const state = loadState();
  if (!state.twitterUserId) {
    state.twitterUserId = await getUserId(config.twitterUsername, bearerToken);
    saveState(state);
  }

  console.log(`@${config.twitterUsername} のツイートをX APIから取得しています...`);
  const tweets = await fetchOwnTweets(
    state.twitterUserId,
    config.twitterUsername,
    bearerToken,
    config.lookbackTweetCount
  );

  if (tweets.length === 0) {
    console.log("ツイートが取得できませんでした。");
    return;
  }

  const lastId = state.lastProcessedTweetId ? BigInt(state.lastProcessedTweetId) : null;
  const newTweets = lastId ? tweets.filter((t) => BigInt(t.id) > lastId) : tweets;

  console.log(`新規ツイート: ${newTweets.length}件 (取得総数: ${tweets.length}件)`);

  // 古い順に処理する(タイムテーブル更新が告知より後になるように)
  const chronological = [...newTweets].reverse();

  let created = 0;
  let updated = 0;
  let skipped = 0;

  for (const tweet of chronological) {
    const parsed = parseLiveInfoTweet(tweet.text, {
      tweetUrl: tweet.url,
      format: config.format,
      // 「今日」ではなく「ツイートが投稿された日」を基準に年を推定する。
      // これにより、過去の告知ツイートを後からまとめて処理しても
      // (今日から見て過去の日付だからと)年を繰り上げてしまう誤判定を防ぐ。
      referenceDate: tweet.createdAt ? new Date(tweet.createdAt) : undefined,
    });

    if (!parsed) {
      skipped++;
      continue;
    }

    const result = await upsertCalendarEvent(parsed, { calendarId: config.calendarId, state });
    if (result.action === "created") created++;
    else updated++;

    const placeholderNote = result.replacedPlaceholderId ? " (仮予定を置き換え)" : "";
    console.log(
      `[${result.action === "created" ? "新規" : "更新"}] ${parsed.title} / ${parsed.date.year}-${parsed.date.month}-${parsed.date.day} (${parsed.timeSource})${placeholderNote}`
    );
  }

  if (tweets.length > 0) {
    const newestId = tweets.reduce((max, t) => (BigInt(t.id) > BigInt(max) ? t.id : max), tweets[0].id);
    state.lastProcessedTweetId = newestId;
  }
  saveState(state);

  console.log(`\n完了: 新規登録 ${created}件 / 更新 ${updated}件 / 対象外 ${skipped}件`);
}

main().catch((err) => {
  console.error("エラーが発生しました:", err);
  process.exit(1);
});
