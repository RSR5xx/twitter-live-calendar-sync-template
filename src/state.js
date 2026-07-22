import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";

const STATE_PATH = new URL("../data/state.json", import.meta.url).pathname;

const DEFAULT_STATE = {
  lastProcessedTweetId: null,
  twitterUserId: null,
  // eventKey -> { calendarEventId, updatedAt }
  events: {},
};

export function loadState() {
  if (!existsSync(STATE_PATH)) return structuredClone(DEFAULT_STATE);
  try {
    const raw = readFileSync(STATE_PATH, "utf-8");
    return { ...structuredClone(DEFAULT_STATE), ...JSON.parse(raw) };
  } catch {
    return structuredClone(DEFAULT_STATE);
  }
}

export function saveState(state) {
  mkdirSync(dirname(STATE_PATH), { recursive: true });
  writeFileSync(STATE_PATH, JSON.stringify(state, null, 2), "utf-8");
}
