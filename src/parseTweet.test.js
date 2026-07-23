import assert from "node:assert/strict";
import { parseLiveInfoTweet } from "./parseTweet.js";

const referenceDate = new Date(2026, 6, 22); // 2026-07-22

const announcementTweet = `☔️LIVE INFO☔️

「アイドル甲子園in Spotify O-nest」
日程｜7/25（土）
時間｜OPEN 9:15 START 10:00
会場｜Spotify O-nest
料金｜前売り¥4,000

入場特典🎁：チェキ券
https://user.my-th.jp/tickets/event/aikou13th_nest

#イルプル`;

const timetableTweet = `☔️LIVE INFO☔️
🕰️タイムテーブル公開！！🕰️
「アイドル甲子園in Spotify O-nest」
日程｜7/25（土）
出番｜16:40~17:05
物販｜17:25~18:45
会場｜Spotify O-nest
料金｜前売り¥4,000

入場特典🎁：チェキ券
https://user.my-th.jp/tickets/event/aikou13th_nest

#イルプル`;

// OPEN/STARTしか無い段階(出番未確定)では、出演時間として不正確なため終日予定にする
const a = parseLiveInfoTweet(announcementTweet, { referenceDate });
assert.equal(a.type, "all-day");
assert.equal(a.allDay, true);
assert.equal(a.timeSource, "終日");
assert.equal(a.title, "アイドル甲子園in Spotify O-nest");
assert.equal(a.venue, "Spotify O-nest");
assert.equal(a.date.year, 2026);
assert.equal(a.date.month, 7);
assert.equal(a.date.day, 25);
console.log("OPEN/START only -> all-day OK:", a);

// 「出番」が確定したら時刻指定の予定にする
const t = parseLiveInfoTweet(timetableTweet, { referenceDate, tweetUrl: "https://x.com/foo/status/123" });
assert.equal(t.type, "stage-time");
assert.equal(t.allDay, false);
assert.equal(t.start.getHours(), 16);
assert.equal(t.start.getMinutes(), 40);
// 終了時刻は「物販」の終了(18:45)を優先する(「出番」の終了17:05ではない)
assert.equal(t.end.getHours(), 18);
assert.equal(t.end.getMinutes(), 45);
assert.equal(t.timeSource, "出番");
assert.equal(t.eventKey, a.eventKey, "同じタイトル+日程なら同じeventKeyになるべき");
// 説明欄はタイトルの「」から始まる(先頭の「☔️LIVE INFO☔️」等の前置きは含めない)
assert.ok(t.description.startsWith("「アイドル甲子園in Spotify O-nest」"), "説明欄はタイトルの括弧から始まるべき");
assert.ok(!t.description.includes("LIVE INFO"), "説明欄に前置きのLIVE INFO行を含めない");
assert.ok(!t.description.includes("元ツイート"), "説明欄に元ツイートリンクの付記を含めない");
console.log("timetable (出番確定) OK:", t);

const nonMatch = parseLiveInfoTweet("今日も配信頑張るぞ〜！");
assert.equal(nonMatch, null);
console.log("non-match OK");

// 表記ゆれ: スラッシュ区切り "OPEN/13:25 START/13:40" でも出番が無ければ終日予定
const slashTweet = `LIVE INFO\n\n「PLEASURE TIME#58」\n日程｜7/29（水）\n時間｜OPEN/13:25　START/13:40\n会場｜SHIBUYA PLEASURE`;
const slashResult = parseLiveInfoTweet(slashTweet, { referenceDate });
assert.equal(slashResult.allDay, true);
assert.equal(slashResult.timeSource, "終日");
console.log("slash format (no 出番) -> all-day OK:", slashResult.title);

// 入れ子の鉤括弧を含むタイトルの解析(出番が無いので終日予定になるケース)
const abbrevTweet = `LIVE INFO\n\n「トナリア 3周年記念EVENT\n「N.F.D.」 LIVE STAGE」\n日程｜8/17（月）\n時間｜op17:30 st18:00\n会場｜トナリア`;
const abbrevResult = parseLiveInfoTweet(abbrevTweet, { referenceDate });
assert.equal(abbrevResult.allDay, true);
assert.equal(abbrevResult.title, "トナリア 3周年記念EVENT\n「N.F.D.」 LIVE STAGE");
console.log("nested quote title (no 出番) OK:", abbrevResult.title);

// 「タイムテーブル」見出しが無くても「出番」があればそちらを優先する(時刻指定)
const stageWithoutHeaderTweet = `LIVE INFO\n\n「Tribu presents Deep Thursday」\n日程｜8/20（木）\n出番｜20:35~21:00\n物販｜21:30~22:00\n会場｜Tribu`;
const stageResult = parseLiveInfoTweet(stageWithoutHeaderTweet, { referenceDate });
assert.equal(stageResult.allDay, false);
assert.equal(stageResult.timeSource, "出番");
assert.equal(stageResult.start.getHours(), 20);
assert.equal(stageResult.start.getMinutes(), 35);
// 終了時刻は物販の終了(22:00)を優先する
assert.equal(stageResult.end.getHours(), 22);
assert.equal(stageResult.end.getMinutes(), 0);
console.log("stage-time without タイムテーブル header OK:", stageResult.timeSource);

// 出番が無く「時間｜未定」の場合も終日予定にする
const noTimeTweet = `LIVE INFO\n\n「未定ライブ」\n日程｜9/1（火）\n時間｜未定\n会場｜どこか`;
const noTimeResult = parseLiveInfoTweet(noTimeTweet, { referenceDate });
assert.equal(noTimeResult.allDay, true);
assert.equal(noTimeResult.type, "all-day");
assert.equal(noTimeResult.timeSource, "終日");
assert.equal(noTimeResult.start.getFullYear(), 2026);
assert.equal(noTimeResult.start.getMonth(), 8);
assert.equal(noTimeResult.start.getDate(), 1);
console.log("no time -> all-day OK:", noTimeResult.type);

console.log("\nAll parser tests passed.");
