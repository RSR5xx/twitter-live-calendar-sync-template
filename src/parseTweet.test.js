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

const a = parseLiveInfoTweet(announcementTweet, { referenceDate });
assert.equal(a.type, "open-start");
assert.equal(a.title, "アイドル甲子園in Spotify O-nest");
assert.equal(a.venue, "Spotify O-nest");
assert.equal(a.date.year, 2026);
assert.equal(a.date.month, 7);
assert.equal(a.date.day, 25);
assert.equal(a.start.getHours(), 9);
assert.equal(a.start.getMinutes(), 15);
assert.equal(a.timeSource, "OPEN/START");
console.log("announcement OK:", a);

const t = parseLiveInfoTweet(timetableTweet, { referenceDate, tweetUrl: "https://x.com/foo/status/123" });
assert.equal(t.type, "stage-time");
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
console.log("timetable OK:", t);

const nonMatch = parseLiveInfoTweet("今日も配信頑張るぞ〜！");
assert.equal(nonMatch, null);
console.log("non-match OK");

// 表記ゆれ: スラッシュ区切り "OPEN/13:25 START/13:40"
const slashTweet = `LIVE INFO\n\n「PLEASURE TIME#58」\n日程｜7/29（水）\n時間｜OPEN/13:25　START/13:40\n会場｜SHIBUYA PLEASURE`;
const slashResult = parseLiveInfoTweet(slashTweet, { referenceDate });
assert.equal(slashResult.start.getHours(), 13);
assert.equal(slashResult.start.getMinutes(), 25);
assert.equal(slashResult.timeSource, "OPEN/START");
console.log("slash format OK:", slashResult.start, slashResult.title);

// 表記ゆれ: 略記 "op17:30 st18:00"
const abbrevTweet = `LIVE INFO\n\n「トナリア 3周年記念EVENT\n「N.F.D.」 LIVE STAGE」\n日程｜8/17（月）\n時間｜op17:30 st18:00\n会場｜トナリア`;
const abbrevResult = parseLiveInfoTweet(abbrevTweet, { referenceDate });
assert.equal(abbrevResult.start.getHours(), 17);
assert.equal(abbrevResult.start.getMinutes(), 30);
assert.equal(abbrevResult.title, "トナリア 3周年記念EVENT\n「N.F.D.」 LIVE STAGE");
console.log("abbrev format + nested quote title OK:", abbrevResult.title);

// 「タイムテーブル」見出しが無くても「出番」があればそちらを優先する
const stageWithoutHeaderTweet = `LIVE INFO\n\n「Tribu presents Deep Thursday」\n日程｜8/20（木）\n出番｜20:35~21:00\n物販｜21:30~22:00\n会場｜Tribu`;
const stageResult = parseLiveInfoTweet(stageWithoutHeaderTweet, { referenceDate });
assert.equal(stageResult.timeSource, "出番");
assert.equal(stageResult.start.getHours(), 20);
assert.equal(stageResult.start.getMinutes(), 35);
// 終了時刻は物販の終了(22:00)を優先する
assert.equal(stageResult.end.getHours(), 22);
assert.equal(stageResult.end.getMinutes(), 0);
console.log("stage-time without タイムテーブル header OK:", stageResult.timeSource);

// 出番もOPEN/STARTも無く「時間｜未定」等で時刻が決まっていない場合は終日予定にする
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
