import {
  USER_API_KEY_STORAGE, PROVIDER_STORAGE, BASE_URL_STORAGE,
  FAST_MODEL_STORAGE, THINKING_MODEL_STORAGE,
  USER_NICKNAME_STORAGE, USER_AVATAR_STORAGE,
  MODEL_CONTEXT_CACHE_STORAGE, CHAT_SESSIONS_STORAGE, CHAT_ACTIVE_SESSION_STORAGE,
  DEFAULT_CONTEXT_WINDOW_TOKENS,
  MODEL_CONFIGS, readRuntimeEnv, getDefaultModelForProvider,
} from "./config.js";

// ── 会话 ID ──
let currentSessionId = "";

export function buildSessionId() {
  return `session_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

export function setCurrentSessionId(sessionId) {
  currentSessionId = sessionId || "";
  try {
    if (currentSessionId) {
      localStorage.setItem(CHAT_ACTIVE_SESSION_STORAGE, currentSessionId);
    } else {
      localStorage.removeItem(CHAT_ACTIVE_SESSION_STORAGE);
    }
  } catch { }
}

export function getCurrentSessionIdValue() {
  return currentSessionId;
}

export function getActiveSessionId() {
  try {
    return localStorage.getItem(CHAT_ACTIVE_SESSION_STORAGE) || "";
  } catch {
    return "";
  }
}

// ── 时间格式化 ──
export function formatTime() {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  const hh = String(now.getHours()).padStart(2, "0");
  const mm = String(now.getMinutes()).padStart(2, "0");
  return `${y}/${m}/${d} ${hh}:${mm}`;
}

// ── 会话存储 ──
export function getStoredSessions() {
  try {
    const records = JSON.parse(localStorage.getItem(CHAT_SESSIONS_STORAGE) || "[]");
    if (!Array.isArray(records)) return [];
    return records.map((item) => ({
      id: item?.id || buildSessionId(),
      title: (item?.title || "新的对话").trim() || "新的对话",
      createdAt: item?.createdAt || formatTime(),
      updatedAt: item?.updatedAt || item?.createdAt || formatTime(),
      messages: Array.isArray(item?.messages)
        ? item.messages
            .filter((msg) => msg && (msg.role === "user" || msg.role === "assistant"))
            .map((msg) => ({ role: msg.role, text: String(msg.text || "").trim(), time: msg.time || formatTime() }))
            .filter((msg) => msg.text)
        : [],
    }));
  } catch {
    return [];
  }
}

function trimSessionPayload(sessions, maxCharsPerMessage = 4000) {
  return (Array.isArray(sessions) ? sessions : []).map((session) => ({
    ...session,
    messages: Array.isArray(session.messages)
      ? session.messages
          .map((msg) => ({ ...msg, text: String(msg?.text || "").slice(-maxCharsPerMessage) }))
          .filter((msg) => msg.text)
      : [],
  }));
}

export function saveSessions(sessions) {
  const normalizedSessions = trimSessionPayload(
    Array.isArray(sessions) ? sessions.slice(-40) : [], 4000,
  );
  try {
    localStorage.setItem(CHAT_SESSIONS_STORAGE, JSON.stringify(normalizedSessions));
    return;
  } catch { }

  const working = normalizedSessions.map((session) => ({
    ...session,
    messages: Array.isArray(session.messages) ? [...session.messages] : [],
  }));
  const charLimits = [2500, 1500, 800, 400, 200];

  while (working.length) {
    try {
      localStorage.setItem(CHAT_SESSIONS_STORAGE, JSON.stringify(working));
      return;
    } catch { }

    const newest = working[working.length - 1];
    if (newest?.messages?.length > 8) {
      newest.messages = newest.messages.slice(-8);
      newest.updatedAt = formatTime();
      continue;
    }
    let compressed = false;
    for (const limit of charLimits) {
      const nextMessages = (newest?.messages || []).map((msg) => ({
        ...msg, text: String(msg?.text || "").slice(-limit),
      }));
      if (JSON.stringify(nextMessages) !== JSON.stringify(newest?.messages || [])) {
        newest.messages = nextMessages;
        newest.updatedAt = formatTime();
        compressed = true;
        break;
      }
    }
    if (compressed) continue;
    if (newest?.messages?.length > 2) {
      newest.messages = newest.messages.slice(-2);
      newest.updatedAt = formatTime();
      continue;
    }
    working.shift();
  }

  try {
    localStorage.removeItem(CHAT_SESSIONS_STORAGE);
    localStorage.setItem(CHAT_SESSIONS_STORAGE, "[]");
  } catch { }
}

export function getSessionSortTimestamp(session) {
  const raw = String(session?.updatedAt || session?.createdAt || "").trim();
  if (raw) {
    const parsed = Date.parse(raw.replace(/\//g, "-"));
    if (!Number.isNaN(parsed)) return parsed;
  }
  const idMatch = String(session?.id || "").match(/^session_(\d+)_/);
  return idMatch ? Number(idMatch[1]) : 0;
}

export function updateSession(sessionId, updater) {
  const sessions = getStoredSessions();
  const idx = sessions.findIndex((item) => item.id === sessionId);
  if (idx === -1) return null;
  const next = updater({ ...sessions[idx] });
  if (!next) return null;
  sessions[idx] = next;
  saveSessions(sessions);
  return next;
}

// ── 用户设置 ──
export function getUserApiKey(provider) {
  const envKeyMap = {
    native_deepseek: "DEEPSEEK_API_KEY",
    deepseek: "DEEPSEEK_API_KEY",
    native_gemini: "GEMINI_API_KEY",
    native_claude: "CLAUDE_API_KEY",
    moonshot: "KIMI_API_KEY",
  };
  const envKey = provider && envKeyMap[provider];
  if (envKey) {
    const envValue = readRuntimeEnv(envKey);
    if (envValue) return envValue;
  }
  try {
    return localStorage.getItem(USER_API_KEY_STORAGE)?.trim() || "";
  } catch {
    return "";
  }
}

export function getProvider() {
  try {
    const p = localStorage.getItem(PROVIDER_STORAGE);
    if (p === "proxy_default") return "native_gemini";
    return p || "native_gemini";
  } catch {
    return "native_gemini";
  }
}

export function getConfiguredModeModel(mode) {
  const provider = getProvider();
  const defaultModel = getDefaultModelForProvider(provider, mode);
  const storageKey = mode === "thinking" ? THINKING_MODEL_STORAGE : FAST_MODEL_STORAGE;
  try {
    const val = localStorage.getItem(storageKey)?.trim();
    if (!val) return defaultModel;
    if (provider === "proxy") return MODEL_CONFIGS[val] ? val : defaultModel;
    if (provider === "native_gemini") return /^gemini/i.test(val) ? val : defaultModel;
    if (provider === "native_claude") return /^claude/i.test(val) ? val : defaultModel;
    if (provider === "native_deepseek" || provider === "deepseek") return /^deepseek/i.test(val) ? val : defaultModel;
    return val;
  } catch {
    return defaultModel;
  }
}

export function setConfiguredModeModel(mode, modelKey) {
  const storageKey = mode === "thinking" ? THINKING_MODEL_STORAGE : FAST_MODEL_STORAGE;
  if (!modelKey) return;
  try { localStorage.setItem(storageKey, modelKey.trim()); } catch { }
}

export function getUserNickname() {
  try { return localStorage.getItem(USER_NICKNAME_STORAGE)?.trim() || "你"; } catch { return "你"; }
}

export function getGreetingTargetName() {
  const nickname = getUserNickname();
  return (!nickname || nickname === "你") ? "华生" : nickname;
}

export function getUserAvatar() {
  try { return localStorage.getItem(USER_AVATAR_STORAGE)?.trim() || ""; } catch { return ""; }
}

// ── 上下文窗口缓存 ──
export function getContextWindowCache() {
  try {
    const cache = JSON.parse(localStorage.getItem(MODEL_CONTEXT_CACHE_STORAGE) || "{}");
    return cache && typeof cache === "object" ? cache : {};
  } catch { return {}; }
}

export function setContextWindowCache(key, tokens) {
  if (!key || !tokens) return;
  try {
    const cache = getContextWindowCache();
    cache[key] = { tokens: Math.max(1024, Number(tokens) || DEFAULT_CONTEXT_WINDOW_TOKENS), updatedAt: Date.now() };
    localStorage.setItem(MODEL_CONTEXT_CACHE_STORAGE, JSON.stringify(cache));
  } catch { }
}

export function getContextWindowFromCache(key) {
  if (!key) return 0;
  const hit = getContextWindowCache()[key];
  return hit?.tokens ? Number(hit.tokens) : 0;
}
