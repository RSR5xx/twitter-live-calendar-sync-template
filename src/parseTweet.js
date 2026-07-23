// LIVE INFO 形式のツイートを解析してカレンダー登録用のイベント情報に変換する。
//
// ラベル文字列(トリガーマーカー・日程・会場・料金・特典・出番・物販・OPEN/START)、
// タイトルの囲み文字、日付・時刻の書き方(正規表現)は format オプションで差し替え可能。
// 他アカウント/他フォーマットへの流用を想定した設計。
//
// トリガーマーカー・タイトル・日程のいずれかが見つからないツイートは null を返す。
//
// カレンダーの説明欄には、タイトルの括弧から始まる元ツイートの内容をそのまま使う
// (先頭の「☔️LIVE INFO☔️」等の前置きは含めない)。
// 「出番」の時間が確定して初めて時刻指定の予定にする(終了時刻は「物販」の終了を優先し、
// 無ければ「出番」の終了)。OPEN/STARTしか無い(出番がまだ未確定な)段階では、
// 本人の出演時間として正確ではないため終日予定として登録する。

export const DEFAULT_FORMAT = {
  triggerMarker: "LIVE INFO",
  dateLabel: "日程",
  venueLabel: "会場",
  priceLabel: "料金",
  benefitLabel: "入場特典",
  stageTimeLabel: "出番",
  merchTimeLabel: "物販",
  titleOpenBracket: "「",
  titleCloseBracket: "」",
  // 日付: 年が無ければ referenceDate から前後3日以内の未来として推定する
  dateRegex: "(?<month>\\d{1,2})\\/(?<day>\\d{1,2})",
  // 時刻の範囲(出番/物販用)
  timeRangeRegex:
    "(?<startHour>\\d{1,2}):(?<startMinute>\\d{2})\\s*[~〜\\-ー]\\s*(?<endHour>\\d{1,2}):(?<endMinute>\\d{2})",
};

function escapeRegex(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function extractLine(text, label) {
  // ラベルと区切り文字(｜|:：)の間に絵文字が挟まるケース(例: 「入場特典🎁：」)にも対応する
  const re = new RegExp(`${label}[^｜|:：\\n]*[｜|:：]\\s*(.+)`);
  const m = text.match(re);
  return m ? m[1].trim() : null;
}

function extractTimeRange(text, label, timeRangeRegex) {
  const re = new RegExp(`${label}\\s*[｜|:：]\\s*${timeRangeRegex}`);
  const m = text.match(re);
  if (!m?.groups) return null;
  return {
    start: { hour: Number(m.groups.startHour), minute: Number(m.groups.startMinute) },
    end: { hour: Number(m.groups.endHour), minute: Number(m.groups.endMinute) },
  };
}

function extractDate(dateLine, dateRegex, referenceDate) {
  const m = dateLine.match(new RegExp(dateRegex));
  if (!m?.groups?.month || !m?.groups?.day) return null;
  const month = Number(m.groups.month);
  const day = Number(m.groups.day);
  const year = m.groups.year ? Number(m.groups.year) : resolveYear(month, day, referenceDate);
  return { year, month, day };
}

function resolveYear(month, day, referenceDate) {
  const now = referenceDate ?? new Date();
  const currentYear = now.getFullYear();
  const candidate = new Date(currentYear, month - 1, day, 0, 0, 0);
  const threeDaysAgo = new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000);
  if (candidate < threeDaysAgo) {
    return currentYear + 1;
  }
  return currentYear;
}

function toDate(year, month, day, time) {
  return new Date(year, month - 1, day, time.hour, time.minute, 0);
}

function pad2(n) {
  return String(n).padStart(2, "0");
}

export function makeEventKey(title, year, month, day) {
  const normalizedTitle = title.trim().replace(/\s+/g, " ");
  return `${normalizedTitle}__${year}-${pad2(month)}-${pad2(day)}`;
}

/**
 * @param {string} tweetText
 * @param {object} [opts]
 * @param {Date} [opts.referenceDate] - 年を推定する基準日 (省略時は現在時刻、dateRegexにyearが含まれる場合は未使用)
 * @param {string} [opts.tweetUrl] - 元ツイートへのリンク (戻り値のtweetUrlに入るだけで、説明欄には含めない)
 * @param {Partial<typeof DEFAULT_FORMAT>} [opts.format] - ラベル・日付/時刻書式のカスタマイズ
 * @returns {object|null}
 */
export function parseLiveInfoTweet(tweetText, opts = {}) {
  const { referenceDate, tweetUrl = null, format = {} } = opts;
  const f = { ...DEFAULT_FORMAT, ...format };

  if (!tweetText || !tweetText.includes(f.triggerMarker)) return null;

  const dateLine = extractLine(tweetText, f.dateLabel);
  if (!dateLine) return null;

  const date = extractDate(dateLine, f.dateRegex, referenceDate);
  if (!date) return null;
  const { year, month, day } = date;

  // タイトルは指定の括弧で囲まれるが、中に「N.F.D.」のような入れ子の括弧が
  // 含まれることがあるため、日程行の直前にある閉じ括弧までを丸ごとタイトルとみなす
  const open = escapeRegex(f.titleOpenBracket);
  const close = escapeRegex(f.titleCloseBracket);
  const dateLabelRe = new RegExp(f.dateLabel);
  const titleMatch =
    tweetText.match(new RegExp(`${open}([\\s\\S]+?)${close}\\s*\\n\\s*(?=${dateLabelRe.source})`)) ??
    tweetText.match(new RegExp(`${open}(.+?)${close}`));
  if (!titleMatch) return null;

  // 「「タイトル」」のように全体が二重に括弧で囲まれている場合は一段だけ剥がす
  let titleRaw = titleMatch[1].trim();
  while (titleRaw.startsWith(f.titleOpenBracket) && titleRaw.endsWith(f.titleCloseBracket)) {
    titleRaw = titleRaw.slice(f.titleOpenBracket.length, -f.titleCloseBracket.length).trim();
  }

  const title = titleRaw;
  const venue = extractLine(tweetText, f.venueLabel);
  const price = extractLine(tweetText, f.priceLabel);
  const benefit = extractLine(tweetText, f.benefitLabel);
  const urlMatch = tweetText.match(/(https?:\/\/\S+)/);
  const ticketUrl = urlMatch ? urlMatch[1] : null;

  const stageRange = extractTimeRange(tweetText, f.stageTimeLabel, f.timeRangeRegex);
  const merchRange = extractTimeRange(tweetText, f.merchTimeLabel, f.timeRangeRegex);

  let start;
  let end;
  let timeSource;
  let allDay = false;

  // 「出番」の時間が確定して初めて時刻指定の予定にする。OPEN/STARTしか無い(まだ出番が
  // 未確定な)段階では、本人の出演時間として正確ではないため終日予定として登録する。
  if (stageRange) {
    start = toDate(year, month, day, stageRange.start);
    timeSource = f.stageTimeLabel;
    // 終了時刻は「物販」の終了時刻を優先し、無ければ「出番」の終了時刻を使う。
    end = merchRange ? toDate(year, month, day, merchRange.end) : toDate(year, month, day, stageRange.end);
  } else {
    allDay = true;
    timeSource = "終日";
    start = new Date(year, month - 1, day);
    end = new Date(year, month - 1, day);
  }

  return {
    type: allDay ? "all-day" : "stage-time",
    title,
    venue,
    price,
    benefit,
    ticketUrl,
    tweetUrl,
    date: { year, month, day },
    start,
    end,
    timeSource,
    allDay,
    // 「☔️LIVE INFO☔️」等の前置き行は含めず、タイトルの開き括弧から末尾までを説明欄にする
    description: tweetText.slice(titleMatch.index).trim(),
    eventKey: makeEventKey(title, year, month, day),
  };
}
