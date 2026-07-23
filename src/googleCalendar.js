import { google } from "googleapis";
import { getAuthorizedClient } from "./googleAuth.js";

const TIME_ZONE = "Asia/Tokyo";

function pad2(n) {
  return String(n).padStart(2, "0");
}

function toDateOnlyString(date) {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
}

function toEventResource(parsed) {
  const timeFields = parsed.allDay
    ? {
        // 終日予定はGoogle Calendarの仕様上、end.dateは翌日(排他的)にする
        start: { date: toDateOnlyString(parsed.start) },
        end: { date: toDateOnlyString(new Date(parsed.end.getFullYear(), parsed.end.getMonth(), parsed.end.getDate() + 1)) },
      }
    : {
        start: { dateTime: parsed.start.toISOString(), timeZone: TIME_ZONE },
        end: { dateTime: parsed.end.toISOString(), timeZone: TIME_ZONE },
      };

  return {
    summary: parsed.title,
    location: parsed.venue ?? undefined,
    description: parsed.description || undefined,
    ...timeFields,
    extendedProperties: { private: { eventKey: parsed.eventKey } },
  };
}

export async function getCalendarClient() {
  const auth = await getAuthorizedClient();
  return google.calendar({ version: "v3", auth });
}

/**
 * eventKey(タイトル+日程)が一致する既存イベントを探す。
 * state.json に記録が無い場合でも、Google Calendar側の extendedProperties から検索してフォールバックする。
 */
async function findExistingEventId(calendar, calendarId, eventKey, stateEventId) {
  if (stateEventId) {
    try {
      const res = await calendar.events.get({ calendarId, eventId: stateEventId });
      if (res.data && res.data.status !== "cancelled") return stateEventId;
    } catch {
      // 見つからなければ検索にフォールバック
    }
  }

  const res = await calendar.events.list({
    calendarId,
    privateExtendedProperty: [`eventKey=${eventKey}`],
    maxResults: 1,
    singleEvents: true,
  });
  const found = res.data.items?.[0];
  return found ? found.id : null;
}

// 「ライブ予定（新宿）」のように手動で入れておいた仮予定を検出する。
// 『』などの外側の囲み文字は問わず、"ライブ予定(キーワード)" の形さえ含んでいればよい。
const PLACEHOLDER_RE = /ライブ予定[（(]([^）)]+)[）)]/;

// 会場名がローマ字表記(例: 「BLAZE GOTANDA」)のとき、日本語の地名キーワード(例: 「五反田」)と
// 一致させるための対応表。東京の主要なライブハウス街を中心によく使うものを登録している。
const PLACE_ROMAJI = {
  五反田: "gotanda",
  渋谷: "shibuya",
  新宿: "shinjuku",
  大塚: "otsuka",
  下北沢: "shimokitazawa",
  池袋: "ikebukuro",
  原宿: "harajuku",
  秋葉原: "akihabara",
  上野: "ueno",
  六本木: "roppongi",
  恵比寿: "ebisu",
  中野: "nakano",
  吉祥寺: "kichijoji",
  高円寺: "koenji",
  浅草: "asakusa",
  銀座: "ginza",
  赤坂: "akasaka",
  代々木: "yoyogi",
  目黒: "meguro",
  品川: "shinagawa",
};

function venueMatchesKeyword(venue, keyword) {
  if (!venue || !keyword) return false;
  const v = venue.toLowerCase();
  const k = keyword.toLowerCase();
  if (v.includes(k)) return true;
  const romaji = PLACE_ROMAJI[keyword];
  return Boolean(romaji && v.includes(romaji));
}

/**
 * parsed.start と同じ日に、手動で入れておいた「ライブ予定(キーワード)」の仮予定があり、
 * かつそのキーワードが今回の会場名に含まれていれば(ローマ字表記のゆらぎも考慮)、
 * 削除してeventIdを返す。無ければnull。
 * (今回upsert対象の予定自身は excludeEventId で除外する)
 */
async function deleteMatchingPlaceholder(calendar, calendarId, parsed, excludeEventId) {
  if (!parsed.venue) return null;

  const dayStart = new Date(parsed.start);
  dayStart.setHours(0, 0, 0, 0);
  const dayEnd = new Date(parsed.start);
  dayEnd.setHours(23, 59, 59, 999);

  const res = await calendar.events.list({
    calendarId,
    timeMin: dayStart.toISOString(),
    timeMax: dayEnd.toISOString(),
    singleEvents: true,
  });

  for (const ev of res.data.items ?? []) {
    if (ev.id === excludeEventId) continue;
    const m = (ev.summary || "").match(PLACEHOLDER_RE);
    if (m && venueMatchesKeyword(parsed.venue, m[1])) {
      await calendar.events.delete({ calendarId, eventId: ev.id });
      return ev.id;
    }
  }
  return null;
}

/**
 * パース済みのライブ情報をGoogleカレンダーに登録/更新する。
 * 同じ eventKey (タイトル+日程) の予定があれば上書き更新し、なければ新規作成する。
 * 新規作成・更新のどちらの場合も、同じ日に会場名が一致する「ライブ予定(キーワード)」の
 * 仮予定があれば削除する(既存イベントが仮予定追加より前に作られたケースにも対応するため)。
 *
 * @param {ReturnType<typeof import('./parseTweet.js').parseLiveInfoTweet>} parsed
 * @param {object} opts
 * @param {string} opts.calendarId
 * @param {object} opts.state - state.js の state オブジェクト (events マップを直接更新する)
 */
export async function upsertCalendarEvent(parsed, { calendarId, state }) {
  const calendar = await getCalendarClient();
  const existing = state.events[parsed.eventKey];
  const existingEventId = await findExistingEventId(calendar, calendarId, parsed.eventKey, existing?.calendarEventId);

  const resource = toEventResource(parsed);
  const deletedPlaceholderId = await deleteMatchingPlaceholder(calendar, calendarId, parsed, existingEventId);

  if (existingEventId) {
    // 時刻指定⇔終日の間で切り替わることがあるため、部分更新のpatchではなく
    // 全体を置き換えるupdateを使う(patchだと date/dateTime の型変更で失敗することがある)
    const res = await calendar.events.update({ calendarId, eventId: existingEventId, requestBody: resource });
    state.events[parsed.eventKey] = { calendarEventId: res.data.id, updatedAt: new Date().toISOString() };
    return { action: "updated", eventId: res.data.id, replacedPlaceholderId: deletedPlaceholderId };
  }

  const res = await calendar.events.insert({ calendarId, requestBody: resource });
  state.events[parsed.eventKey] = { calendarEventId: res.data.id, updatedAt: new Date().toISOString() };
  return { action: "created", eventId: res.data.id, replacedPlaceholderId: deletedPlaceholderId };
}
