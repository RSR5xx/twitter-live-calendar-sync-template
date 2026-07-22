// 公式X API v2 を使って、指定ユーザーの直近ツイートを取得する(読み取り専用、App-only認証)。

const API_BASE = "https://api.twitter.com/2";

async function apiGet(path, bearerToken) {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { Authorization: `Bearer ${bearerToken}` },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`X API エラー (${res.status} ${path}): ${body}`);
  }
  return res.json();
}

export async function getUserId(username, bearerToken) {
  const data = await apiGet(`/users/by/username/${encodeURIComponent(username)}`, bearerToken);
  if (!data.data?.id) throw new Error(`ユーザーID取得に失敗しました: @${username}`);
  return data.data.id;
}

/**
 * @param {string} userId
 * @param {string} bearerToken
 * @param {number} maxResults - 5〜100
 * @returns {Promise<Array<{id: string, url: string, text: string, createdAt: string}>>}
 */
export async function fetchOwnTweets(userId, username, bearerToken, maxResults = 30) {
  const clamped = Math.min(Math.max(maxResults, 5), 100);
  const data = await apiGet(
    `/users/${userId}/tweets?max_results=${clamped}&exclude=retweets,replies&tweet.fields=created_at`,
    bearerToken
  );
  const tweets = data.data ?? [];
  return tweets.map((t) => ({
    id: t.id,
    url: `https://x.com/${username}/status/${t.id}`,
    text: t.text,
    createdAt: t.created_at,
  }));
}
