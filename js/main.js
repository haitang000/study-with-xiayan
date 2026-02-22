const fileInput = document.getElementById("fileInput");
const pickBtn = document.getElementById("pickBtn");
const explainBtn = document.getElementById("explainBtn");
const clearBtn = document.getElementById("clearBtn");
const previewImg = document.getElementById("previewImg");
const previewBox = document.getElementById("previewBox");
const placeholder = document.getElementById("placeholder");
const chatFeed = document.getElementById("chatFeed");
const askForm = document.getElementById("askForm");
const askInput = document.getElementById("askInput");
const draftInput = document.getElementById("draft");
const draftPreview = document.getElementById("draftPreview");
const draftBox = document.querySelector(".draft-box");
const exportMdBtn = document.getElementById("exportMdBtn");
const timeTip = document.getElementById("timeTip");
const ctxRing = document.getElementById("ctxRing");
const ctxPct = document.getElementById("ctxPct");
const ctxText = document.getElementById("ctxText");
const questionCard = document.getElementById("questionCard");
const characterBubble = document.getElementById("characterBubble");
const askSubmitBtn = askForm.querySelector('button[type="submit"]');
const cameraBtn = document.getElementById("cameraBtn");
const cameraInput = document.getElementById("cameraInput");
const scrollBottomBtn = document.getElementById("scrollBottomBtn");
const mobileTabButtons = Array.from(document.querySelectorAll(".mobile-tabbar .tab-btn"));
const modeSwitch = document.getElementById("modeSwitch");
const modeButtons = Array.from(document.querySelectorAll(".mode-btn"));
const moreBtn = document.getElementById("moreBtn");
const chatPanel = document.querySelector("main.chat");
const draftPanel = document.querySelector("aside.draft");
const sidebarOverlay = document.getElementById("sidebarOverlay");
const sidebarDrawer = document.getElementById("sidebarDrawer");
const sidebarCloseBtn = document.getElementById("sidebarCloseBtn");
const openSettingsBtn = document.getElementById("openSettingsBtn");
const historyList = document.getElementById("historyList");
const clearHistoryBtn = document.getElementById("clearHistoryBtn");
const settingsModal = document.getElementById("settingsModal");
const apiKeyInput = document.getElementById("apiKeyInput");
const saveApiKeyBtn = document.getElementById("saveApiKeyBtn");
const resetDefaultModelsBtn = document.getElementById("resetDefaultModelsBtn");
const clearApiKeyBtn = document.getElementById("clearApiKeyBtn");
const closeSettingsBtn = document.getElementById("closeSettingsBtn");
const providerSelect = document.getElementById("providerSelect");
const baseUrlInput = document.getElementById("baseUrlInput");
const fastModelInput = document.getElementById("fastModelInput");
const thinkingModelInput = document.getElementById("thinkingModelInput");
const nicknameInput = document.getElementById("nicknameInput");
const avatarUrlInput = document.getElementById("avatarUrlInput");
const settingsAvatarPreview = document.getElementById("settingsAvatarPreview");
const uploadAvatarBtn = document.getElementById("uploadAvatarBtn");
const clearAvatarBtn = document.getElementById("clearAvatarBtn");
const avatarFileInput = document.getElementById("avatarFileInput");
const modeToast = document.createElement("div");
const complianceModal = document.getElementById("complianceModal");
const agreeComplianceBtn = document.getElementById("agreeComplianceBtn");
const RUNTIME_ENV =
  typeof window !== "undefined" && window.__STUDY_ENV__
    ? window.__STUDY_ENV__
    : {};

function readRuntimeEnv(key) {
  const value = String(RUNTIME_ENV?.[key] || "").trim();
  // 若部署时未做变量替换（如 __API_URL__），按未配置处理
  if (/^__.+__$/.test(value)) return "";
  return value;
}

const PROXY_ENDPOINTS = {
  deepseek: readRuntimeEnv("PROXY_DEEPSEEK_URL"),
  kimi: readRuntimeEnv("PROXY_KIMI_URL"),
  gemini: readRuntimeEnv("PROXY_GEMINI_URL"),
  claude: readRuntimeEnv("PROXY_CLAUDE_URL"),
};

const USER_API_KEY_STORAGE = "moonshot_api_key";
const PROVIDER_STORAGE = "llm_provider";
const BASE_URL_STORAGE = "llm_base_url";
const FAST_MODEL_STORAGE = "fast_mode_model";
const THINKING_MODEL_STORAGE = "thinking_mode_model";
const USER_NICKNAME_STORAGE = "chat_user_nickname";
const USER_AVATAR_STORAGE = "chat_user_avatar";
const MODEL_CONTEXT_CACHE_STORAGE = "model_context_window_cache";
const CHAT_SESSIONS_STORAGE = "chat_session_records";
const CHAT_ACTIVE_SESSION_STORAGE = "chat_active_session_id";
let currentMode = "fast";
let currentSessionId = "";
const SIDEBAR_ANIM_DURATION = 220;
const DEFAULT_CONTEXT_WINDOW_TOKENS = 32768;
const CONTEXT_PROBE_TIMEOUT = 3500;
let sidebarCloseTimer = null;
let currentContextWindowTokens = DEFAULT_CONTEXT_WINDOW_TOKENS;
const contextProbePending = new Map();

function detectMobileLikeDevice() {
  const hasTouch =
    "ontouchstart" in window ||
    navigator.maxTouchPoints > 0 ||
    navigator.msMaxTouchPoints > 0;
  return window.matchMedia("(max-width: 980px)").matches && hasTouch;
}

function syncMobileUiClass() {
  document.body.classList.toggle("is-mobile", detectMobileLikeDevice());
}

modeToast.className = "mode-toast";
document.body.appendChild(modeToast);
syncMobileUiClass();
window.addEventListener("resize", syncMobileUiClass);

function buildSessionId() {
  return `session_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function formatContextWindowLabel(tokens) {
  const value = Math.max(1024, Number(tokens) || DEFAULT_CONTEXT_WINDOW_TOKENS);
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1).replace(/\.0$/, "")}M`;
  return `${Math.round(value / 1024)}k`;
}

function buildContextCacheKey(provider, modelName, requestUrl) {
  return `${provider || "unknown"}::${String(modelName || "").toLowerCase()}::${String(requestUrl || "")}`;
}

function getContextWindowCache() {
  try {
    const cache = JSON.parse(localStorage.getItem(MODEL_CONTEXT_CACHE_STORAGE) || "{}");
    return cache && typeof cache === "object" ? cache : {};
  } catch (e) {
    console.warn("[getContextWindowCache] 读取缓存失败", e);
    return {};
  }
}

function setContextWindowCache(key, tokens) {
  if (!key || !tokens) return;
  try {
    const cache = getContextWindowCache();
    cache[key] = {
      tokens: Math.max(1024, Number(tokens) || DEFAULT_CONTEXT_WINDOW_TOKENS),
      updatedAt: Date.now(),
    };
    localStorage.setItem(MODEL_CONTEXT_CACHE_STORAGE, JSON.stringify(cache));
  } catch (e) {
    console.warn("[setContextWindowCache] 写入缓存失败", e);
  }
}

function getContextWindowFromCache(key) {
  if (!key) return 0;
  const cache = getContextWindowCache();
  const hit = cache[key];
  return hit?.tokens ? Number(hit.tokens) : 0;
}

function inferContextWindowByModelName(modelName) {
  const name = String(modelName || "").toLowerCase();
  if (!name) return DEFAULT_CONTEXT_WINDOW_TOKENS;

  const numK = name.match(/(\d{1,4})k/);
  if (numK) return Number(numK[1]) * 1024;

  if (name.includes("gpt-4.1") || name.includes("o1") || name.includes("o3")) return 200_000;
  if (name.includes("gpt-4o") || name.includes("claude")) return 128 * 1024;
  if (name.includes("gemini") && (name.includes("1.5") || name.includes("2.5"))) return 1_000_000;
  if (name.includes("deepseek-reasoner")) return 64 * 1024;
  if (name.includes("deepseek-chat")) return 64 * 1024;
  if (name.includes("moonshot-v1-32k")) return 32 * 1024;
  if (name.includes("moonshot-v1-8k")) return 8 * 1024;
  if (name.includes("qwen") || name.includes("kimi")) return 128 * 1024;

  return DEFAULT_CONTEXT_WINDOW_TOKENS;
}

function getActiveModelRuntimeInfo(targetMode = currentMode) {
  const provider = getProvider();
  const isProxy = provider === "proxy";
  const modelKey = getConfiguredModeModel(targetMode);
  const proxyFallbackKey = getProxyModelByMode(targetMode);
  const config = MODEL_CONFIGS[modelKey] || MODEL_CONFIGS[proxyFallbackKey] || null;
  const modelName = isProxy ? config?.model || modelKey : modelKey;
  const requestUrl = isProxy ? config?.url || "" : getProviderBaseUrl(provider);
  return { provider, modelName, requestUrl };
}

function guessModelsEndpoint(requestUrl) {
  const url = String(requestUrl || "").trim();
  if (!url) return "";
  if (url.includes("/chat/completions")) return url.replace(/\/chat\/completions.*$/i, "/models");
  if (/\/v\d+\/?$/i.test(url)) return `${url.replace(/\/?$/, "")}/models`;
  return "";
}

async function probeContextWindowFromApi(provider, modelName, requestUrl) {
  const modelsUrl = guessModelsEndpoint(requestUrl);
  if (!modelsUrl) return 0;

  const noAuthProviders = new Set(["proxy"]);
  const requiresApiKey = !noAuthProviders.has(provider);
  const userApiKey = getUserApiKey(provider);
  if (requiresApiKey && !userApiKey) return 0;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), CONTEXT_PROBE_TIMEOUT);
  try {
    const headers = {};
    if (requiresApiKey) headers.Authorization = `Bearer ${userApiKey}`;
    const res = await fetch(modelsUrl, { headers, signal: controller.signal });
    if (!res.ok) return 0;
    const data = await res.json().catch(() => ({}));
    const list = Array.isArray(data?.data) ? data.data : [];
    const target =
      list.find((item) => item?.id === modelName) ||
      list.find((item) => String(item?.id || "").toLowerCase().includes(String(modelName || "").toLowerCase())) ||
      null;
    const candidate = target || data || {};
    const fields = [
      candidate.context_window,
      candidate.max_context_length,
      candidate.input_token_limit,
      candidate.max_input_tokens,
      candidate.max_tokens,
    ];
    const fromApi = fields.find((v) => Number(v) > 0);
    return fromApi ? Number(fromApi) : 0;
  } catch {
    return 0;
  } finally {
    clearTimeout(timer);
  }
}

async function updateModelContextWindow(targetMode = currentMode) {
  const { provider, modelName, requestUrl } = getActiveModelRuntimeInfo(targetMode);
  const cacheKey = buildContextCacheKey(provider, modelName, requestUrl);
  const cached = getContextWindowFromCache(cacheKey);
  if (cached) {
    currentContextWindowTokens = cached;
    refreshContextMeter(askInput?.value || "");
  } else {
    currentContextWindowTokens = inferContextWindowByModelName(modelName);
    refreshContextMeter(askInput?.value || "");
  }

  if (!requestUrl || !modelName) return;
  if (contextProbePending.has(cacheKey)) return;

  const task = (async () => {
    const probed = await probeContextWindowFromApi(provider, modelName, requestUrl);
    if (probed > 0) {
      currentContextWindowTokens = probed;
      setContextWindowCache(cacheKey, probed);
      refreshContextMeter(askInput?.value || "");
    }
  })();

  contextProbePending.set(cacheKey, task);
  try {
    await task;
  } finally {
    contextProbePending.delete(cacheKey);
  }
}

function triggerContextWindowRefresh(targetMode = currentMode) {
  updateModelContextWindow(targetMode).catch(() => { });
}

function getStoredSessions() {
  try {
    const records = JSON.parse(localStorage.getItem(CHAT_SESSIONS_STORAGE) || "[]");
    if (!Array.isArray(records)) return [];
    return records
      .map((item) => ({
        id: item?.id || buildSessionId(),
        title: (item?.title || "新的对话").trim() || "新的对话",
        createdAt: item?.createdAt || formatTime(),
        updatedAt: item?.updatedAt || item?.createdAt || formatTime(),
        messages: Array.isArray(item?.messages)
          ? item.messages
            .filter((msg) => msg && (msg.role === "user" || msg.role === "assistant"))
            .map((msg) => ({
              role: msg.role,
              text: String(msg.text || "").trim(),
              time: msg.time || formatTime(),
            }))
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
        .map((msg) => ({
          ...msg,
          text: String(msg?.text || "").slice(-maxCharsPerMessage),
        }))
        .filter((msg) => msg.text)
      : [],
  }));
}

function saveSessions(sessions) {
  const normalizedSessions = trimSessionPayload(
    Array.isArray(sessions) ? sessions.slice(-40) : [],
    4000,
  );
  try {
    localStorage.setItem(CHAT_SESSIONS_STORAGE, JSON.stringify(normalizedSessions));
    return;
  } catch { }

  // 存储空间不足时，逐步压缩最新会话内容，再移除更早会话，尽可能保留最近记录。
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
        ...msg,
        text: String(msg?.text || "").slice(-limit),
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

function setCurrentSessionId(sessionId) {
  currentSessionId = sessionId || "";
  try {
    if (currentSessionId) {
      localStorage.setItem(CHAT_ACTIVE_SESSION_STORAGE, currentSessionId);
    } else {
      localStorage.removeItem(CHAT_ACTIVE_SESSION_STORAGE);
    }
  } catch { }
}

function getActiveSessionId() {
  try {
    return localStorage.getItem(CHAT_ACTIVE_SESSION_STORAGE) || "";
  } catch {
    return "";
  }
}

function getSessionSortTimestamp(session) {
  const raw = String(session?.updatedAt || session?.createdAt || "").trim();
  if (raw) {
    const parsed = Date.parse(raw.replace(/\//g, "-"));
    if (!Number.isNaN(parsed)) return parsed;
  }
  const idMatch = String(session?.id || "").match(/^session_(\d+)_/);
  return idMatch ? Number(idMatch[1]) : 0;
}

function createSession(initialTitle = "新的对话") {
  const sessions = getStoredSessions();
  const session = {
    id: buildSessionId(),
    title: initialTitle,
    createdAt: formatTime(),
    updatedAt: formatTime(),
    messages: [],
  };
  sessions.push(session);
  saveSessions(sessions);
  setCurrentSessionId(session.id);
  renderHistoryList();
  return session;
}

function getCurrentSession(createIfMissing = true) {
  const sessions = getStoredSessions();
  if (currentSessionId) {
    const existing = sessions.find((item) => item.id === currentSessionId);
    if (existing) return existing;
  }
  const activeId = getActiveSessionId();
  if (activeId) {
    const activeSession = sessions.find((item) => item.id === activeId);
    if (activeSession) {
      setCurrentSessionId(activeSession.id);
      return activeSession;
    }
  }
  if (sessions.length) {
    const latest = sessions
      .slice()
      .sort((a, b) => getSessionSortTimestamp(b) - getSessionSortTimestamp(a))[0];
    setCurrentSessionId(latest.id);
    return latest;
  }
  if (!createIfMissing) return null;
  return createSession();
}

function updateSession(sessionId, updater) {
  const sessions = getStoredSessions();
  const idx = sessions.findIndex((item) => item.id === sessionId);
  if (idx === -1) return null;
  const next = updater({ ...sessions[idx] });
  if (!next) return null;
  sessions[idx] = next;
  saveSessions(sessions);
  return next;
}

function appendSessionMessage(role, text) {
  const content = String(text || "").trim().slice(-4000);
  if (!content) return;
  const session = getCurrentSession();
  if (!session) return;
  updateSession(session.id, (item) => {
    item.messages = item.messages || [];
    item.messages.push({ role, text: content, time: formatTime() });
    item.updatedAt = formatTime();
    return item;
  });
  renderHistoryList();
}

async function summarizeSessionTitle(sessionId) {
  const session = getStoredSessions().find((item) => item.id === sessionId);
  if (!session || session.messages.length < 2) return;
  if (session.title && session.title !== "新的对话") return;

  const sample = session.messages
    .slice(0, 6)
    .map((item) => `${item.role === "user" ? "用户" : "AI"}：${item.text}`)
    .join("\n");

  let title = "";
  try {
    const stream = callModelStream(
      [
        {
          role: "system",
          content:
            "请把对话总结成一个简短标题，只输出标题本身，不超过18个中文字符，不要标点和引号。",
        },
        { role: "user", content: sample },
      ],
      getConfiguredModeModel("fast"),
      { modeOverride: "fast" },
    );
    for await (const chunk of stream) {
      if (chunk.content) title += chunk.content;
    }
  } catch (e) {
    console.warn("[summarizeSessionTitle] 生成标题失败", e);
  }

  title = title.replace(/[\n\r"'“”‘’]/g, "").trim();
  if (!title) {
    const firstUser = session.messages.find((item) => item.role === "user")?.text || "新的对话";
    title = firstUser.slice(0, 18);
  }
  const finalTitle = title.slice(0, 18) || "新的对话";
  updateSession(sessionId, (item) => {
    item.title = finalTitle;
    return item;
  });
  renderHistoryList();
}

function loadSession(sessionId) {
  const session = getStoredSessions().find((item) => item.id === sessionId);
  if (!session) return;
  setCurrentSessionId(session.id);
  chatFeed.innerHTML = "";
  conversation.length = 0;
  session.messages.forEach((item) => {
    appendMsg(item.text, { role: item.role });
    conversation.push({ role: item.role, content: item.text });
  });
  renderHistoryList();
  setSidebarOpen(false);
}

function renameSession(sessionId) {
  const session = getStoredSessions().find((item) => item.id === sessionId);
  if (!session) return;
  const nextTitle = window.prompt("重命名对话", session.title || "新的对话");
  if (nextTitle === null) return;
  const finalTitle = nextTitle.trim().slice(0, 24);
  if (!finalTitle) {
    showModeTip("名称不能为空");
    return;
  }
  updateSession(sessionId, (item) => {
    item.title = finalTitle;
    item.updatedAt = formatTime();
    return item;
  });
  renderHistoryList();
  showModeTip("已重命名");
}

function deleteSession(sessionId) {
  const sessions = getStoredSessions();
  const target = sessions.find((item) => item.id === sessionId);
  if (!target) return;
  const ok = window.confirm(`确认删除“${target.title || "新的对话"}”吗？`);
  if (!ok) return;

  const remaining = sessions.filter((item) => item.id !== sessionId);
  saveSessions(remaining);

  if (sessionId !== currentSessionId) {
    renderHistoryList();
    showModeTip("已删除对话");
    return;
  }

  if (remaining.length) {
    const latest = remaining
      .slice()
      .sort((a, b) => getSessionSortTimestamp(b) - getSessionSortTimestamp(a))[0];
    loadSession(latest.id);
    showModeTip("已删除对话");
    return;
  }

  chatFeed.innerHTML = "";
  clearPreview();
  const newSession = createSession("新的对话");
  loadSession(newSession.id);
  initGreeting();
  showModeTip("已删除对话");
}

function renderHistoryList() {
  if (!historyList) return;
  const sessions = getStoredSessions();
  historyList.innerHTML = "";
  if (!sessions.length) {
    const empty = document.createElement("div");
    empty.className = "history-empty";
    empty.textContent = "还没有记录，开始一段新对话吧。";
    historyList.appendChild(empty);
    return;
  }

  sessions
    .slice()
    .sort((a, b) => getSessionSortTimestamp(b) - getSessionSortTimestamp(a))
    .forEach((item) => {
      const row = document.createElement("div");
      row.className = "history-item";
      row.setAttribute("role", "button");
      row.tabIndex = 0;
      if (item.id === currentSessionId) row.classList.add("active");

      const meta = document.createElement("div");
      meta.className = "history-meta";
      meta.textContent = `${item.updatedAt || item.createdAt} · ${item.messages.length} 条`;

      const title = document.createElement("div");
      title.className = "history-title";
      title.textContent = item.title || "新的对话";

      const preview = document.createElement("div");
      preview.className = "history-text";
      preview.textContent = item.messages[item.messages.length - 1]?.text || "";

      const actions = document.createElement("div");
      actions.className = "history-actions";

      const renameBtn = document.createElement("button");
      renameBtn.type = "button";
      renameBtn.className = "history-action-btn";
      renameBtn.title = "重命名";
      renameBtn.setAttribute("aria-label", "重命名对话");
      renameBtn.innerHTML = '<i class="fa-solid fa-pen"></i>';
      renameBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        renameSession(item.id);
      });

      const deleteBtn = document.createElement("button");
      deleteBtn.type = "button";
      deleteBtn.className = "history-action-btn danger";
      deleteBtn.title = "删除";
      deleteBtn.setAttribute("aria-label", "删除对话");
      deleteBtn.innerHTML = '<i class="fa-solid fa-trash"></i>';
      deleteBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        deleteSession(item.id);
      });

      actions.append(renameBtn, deleteBtn);

      row.append(meta, title, preview, actions);
      row.addEventListener("click", () => loadSession(item.id));
      row.addEventListener("keydown", (e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          loadSession(item.id);
        }
      });
      historyList.appendChild(row);
    });
}

function setSidebarOpen(open) {
  if (!sidebarOverlay) return;
  const isShown = sidebarOverlay.classList.contains("show");
  if (open && isShown && !sidebarCloseTimer) return;
  if (!open && !isShown) return;

  if (sidebarCloseTimer) {
    clearTimeout(sidebarCloseTimer);
    sidebarCloseTimer = null;
  }

  const canAnimate =
    !!sidebarDrawer &&
    typeof sidebarOverlay.animate === "function" &&
    typeof sidebarDrawer.animate === "function";

  if (!canAnimate) {
    sidebarOverlay.classList.toggle("show", open);
    sidebarOverlay.setAttribute("aria-hidden", open ? "false" : "true");
    return;
  }

  if (open) {
    sidebarOverlay.classList.add("show");
    sidebarOverlay.setAttribute("aria-hidden", "false");
    sidebarOverlay.animate(
      [{ opacity: 0 }, { opacity: 1 }],
      {
        duration: SIDEBAR_ANIM_DURATION,
        easing: "ease",
      },
    );
    sidebarDrawer.animate(
      [
        { transform: "translateX(-100px)", opacity: 0 },
        { transform: "translateX(0)", opacity: 1 },
      ],
      {
        duration: SIDEBAR_ANIM_DURATION,
        easing: "cubic-bezier(0.22, 1, 0.36, 1)",
      },
    );
    return;
  }

  sidebarOverlay.setAttribute("aria-hidden", "true");
  sidebarOverlay.animate(
    [{ opacity: 1 }, { opacity: 0 }],
    {
      duration: SIDEBAR_ANIM_DURATION,
      easing: "ease",
    },
  );
  sidebarDrawer.animate(
    [
      { transform: "translateX(0)", opacity: 1 },
      { transform: "translateX(-80px)", opacity: 0 },
    ],
    {
      duration: SIDEBAR_ANIM_DURATION,
      easing: "cubic-bezier(0.4, 0, 1, 1)",
    },
  );
  sidebarCloseTimer = setTimeout(() => {
    sidebarOverlay.classList.remove("show");
    sidebarCloseTimer = null;
  }, SIDEBAR_ANIM_DURATION);
}

function openSettingsPanel() {
  const provider = getProvider();
  apiKeyInput.value = getUserApiKey();
  if (providerSelect) providerSelect.value = provider;
  if (baseUrlInput)
    baseUrlInput.value =
      provider === "custom" ? getProviderBaseUrl("custom") : "";
  if (fastModelInput) fastModelInput.value = getConfiguredModeModel("fast");
  if (thinkingModelInput)
    thinkingModelInput.value = getConfiguredModeModel("thinking");
  if (nicknameInput) nicknameInput.value = getUserNickname();
  const avatarUrl = getUserAvatar();
  if (avatarUrlInput) avatarUrlInput.value = avatarUrl;
  renderSettingsAvatarPreview(avatarUrl);
  setSettingsModalOpen(true);
  setTimeout(() => apiKeyInput?.focus(), 50);
}

marked.use({
  breaks: true,
  gfm: true,
});

const MODEL_CONFIGS = {
  "deepseek-chat": {
    url: PROXY_ENDPOINTS.deepseek,
    model: "deepseek-chat",
  },
  "kimi-latest": {
    url: PROXY_ENDPOINTS.kimi,
    model: "kimi-latest",
  },
  "kimi-k2.5": {
    url: PROXY_ENDPOINTS.kimi,
    model: "kimi-k2.5",
  },
  "moonshot-v1-32k": {
    url: PROXY_ENDPOINTS.kimi,
    model: "moonshot-v1-32k",
  },
};

const MODE_INSTRUCTIONS = {
  fast: "【快速模式】请直接给出答案，保持简洁明了。",
  thinking: "【深度思考模式】请一步步思考，详细展示推导过程，并分析关键细节。",
};

const PERSONA_REINFORCEMENT =
  "【人设锁定】你必须始终以夏彦身份回复，称呼用户为华生或我的华生；语气温柔、可靠、带一点熟悉感，不要跳出角色，不要提及设定来源。讲解时先用1句贴心引导，再进入知识内容。";

const MODE_DEFAULT_MODEL = {
  fast: "deepseek-chat",
  thinking: "kimi-k2.5",
};

const DEFAULT_SYSTEM_PROMPT = "";
let SYSTEM_PROMPT = DEFAULT_SYSTEM_PROMPT;

let uploaded = null;
let uploadedDataUrl = "";
let previewObjectUrl = "";
let isBusy = false;
const conversation = [];
const systemPromptReady = loadSystemPrompt();

async function loadSystemPrompt() {
  try {
    const response = await fetch("prompt.md", { cache: "no-store" });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const text = (await response.text()).trim();
    if (text) SYSTEM_PROMPT = text;
  } catch (error) {
    console.warn("加载 prompt.md 失败，已使用默认系统提示词。", error);
  }
}

function formatTime() {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  const hh = String(now.getHours()).padStart(2, "0");
  const mm = String(now.getMinutes()).padStart(2, "0");
  return `${y}/${m}/${d} ${hh}:${mm}`;
}

function estimateTokensFromText(text) {
  const source = String(text || "").trim();
  if (!source) return 0;
  try {
    const bytes = new TextEncoder().encode(source).length;
    return Math.max(1, Math.ceil(bytes / 4));
  } catch {
    return Math.max(1, Math.ceil(source.length / 2));
  }
}

function computeContextTokens(extraInput = "") {
  let total = 0;
  total += estimateTokensFromText(SYSTEM_PROMPT);
  total += estimateTokensFromText(MODE_INSTRUCTIONS[currentMode] || "");
  total += estimateTokensFromText(PERSONA_REINFORCEMENT);

  conversation.forEach((item) => {
    total += estimateTokensFromText(item?.content || "");
  });

  if (uploadedDataUrl) {
    // 图片输入在多模态模型中会占用额外 token，这里给出近似估算值。
    total += 1200;
  }

  total += estimateTokensFromText(extraInput);
  return Math.max(0, total);
}

function paintContextMeter(tokens) {
  if (!ctxText) return;
  const safeTokens = Math.max(0, Math.floor(tokens || 0));
  const windowSize = Math.max(1024, Number(currentContextWindowTokens) || DEFAULT_CONTEXT_WINDOW_TOKENS);
  const percent = Math.min(100, (safeTokens / windowSize) * 100);
  if (ctxRing) ctxRing.style.setProperty("--p", percent.toFixed(2));
  if (ctxPct) ctxPct.textContent = `${Math.round(percent)}%`;
  ctxText.textContent = `${safeTokens.toLocaleString("zh-CN")} / ${formatContextWindowLabel(windowSize)} tokens`;
}

function refreshContextMeter(extraInput = "") {
  paintContextMeter(computeContextTokens(extraInput));
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function updateCharacterBubble(text) {
  characterBubble.style.opacity = "0";
  characterBubble.style.transform = "translateY(5px)";
  setTimeout(() => {
    characterBubble.textContent = text;
    characterBubble.style.opacity = "1";
    characterBubble.style.transform = "translateY(0)";
  }, 300);
}

function syncModelWithMode() {
  return getConfiguredModeModel(currentMode);
}

function setMode(mode) {
  currentMode = mode;
  modeButtons.forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.mode === mode);
  });
  triggerContextWindowRefresh(mode);
}

function getUserApiKey(provider) {
  // 根据 provider 优先从 env.local.js (RUNTIME_ENV) 中读取对应 API Key
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
  // 回退到用户在设置面板中手动填写的 key
  try {
    return localStorage.getItem(USER_API_KEY_STORAGE)?.trim() || "";
  } catch {
    return "";
  }
}

function getConfiguredModeModel(mode) {
  const provider = getProvider();
  const defaultModel = getDefaultModelForProvider(provider, mode);
  const storageKey = mode === "thinking" ? THINKING_MODEL_STORAGE : FAST_MODEL_STORAGE;
  try {
    const val = localStorage.getItem(storageKey)?.trim();
    if (!val) return defaultModel;
    if (provider === "proxy")
      return MODEL_CONFIGS[val] ? val : defaultModel;
    if (provider === "native_gemini") {
      return /^gemini/i.test(val) ? val : defaultModel;
    }
    if (provider === "native_claude") {
      return /^claude/i.test(val) ? val : defaultModel;
    }
    if (provider === "native_deepseek" || provider === "deepseek") {
      return /^deepseek/i.test(val) ? val : defaultModel;
    }
    return val;
  } catch {
    return defaultModel;
  }
}

function setConfiguredModeModel(mode, modelKey) {
  const storageKey = mode === "thinking" ? THINKING_MODEL_STORAGE : FAST_MODEL_STORAGE;
  if (!modelKey) return;
  try {
    localStorage.setItem(storageKey, modelKey.trim());
  } catch { }
}

function getProvider() {
  try {
    const p = localStorage.getItem(PROVIDER_STORAGE);
    if (p === "proxy_default") return "native_gemini";
    return p || "native_gemini";
  } catch {
    return "native_gemini";
  }
}

function getProxyModelByMode(mode) {
  if (mode === "fast") return "deepseek-chat";
  if (mode === "thinking") return "kimi-k2.5";
  const preferred = MODE_DEFAULT_MODEL[mode] || MODE_DEFAULT_MODEL.fast;
  if (preferred && MODEL_CONFIGS[preferred]) return preferred;
  if (mode === "thinking" && MODEL_CONFIGS["kimi-k2.5"]) return "kimi-k2.5";
  if (MODEL_CONFIGS["kimi-latest"]) return "kimi-latest";
  return Object.keys(MODEL_CONFIGS)[0] || "";
}

function getDefaultModelForProvider(provider, mode) {
  if (provider === "proxy")
    return getProxyModelByMode(mode);
  const defaults = {
    native_gemini: { fast: "gemini-3-flash-preview-nothinking", thinking: "gemini-3.1-pro-preview" },
    native_claude: { fast: "claude-3-haiku-20240307", thinking: "claude-3-5-sonnet-20240620" },
    native_deepseek: { fast: "deepseek-chat", thinking: "deepseek-reasoner" },
    moonshot: { fast: "moonshot-v1-8k", thinking: "moonshot-v1-32k" },
    openai: { fast: "gpt-4o-mini", thinking: "gpt-4.1" },
    deepseek: { fast: "deepseek-chat", thinking: "deepseek-reasoner" },
    siliconflow: { fast: "Qwen/Qwen2.5-7B-Instruct", thinking: "deepseek-ai/DeepSeek-R1" },
    custom: { fast: "gpt-4o-mini", thinking: "gpt-4.1" },
  };
  const map = defaults[provider] || { fast: "gpt-4o-mini", thinking: "gpt-4.1" };
  return map[mode] || map.fast;
}

function getProviderBaseUrl(provider) {
  const map = {
    native_gemini: PROXY_ENDPOINTS.gemini,
    native_claude: PROXY_ENDPOINTS.claude,
    native_deepseek: PROXY_ENDPOINTS.deepseek,
    moonshot: "https://api.moonshot.cn/v1/chat/completions",
    openai: "https://api.openai.com/v1/chat/completions",
    deepseek: "https://api.deepseek.com/v1/chat/completions",
    siliconflow: "https://api.siliconflow.cn/v1/chat/completions",
  };
  if (provider === "custom") {
    try {
      return localStorage.getItem(BASE_URL_STORAGE)?.trim() || "";
    } catch {
      return "";
    }
  }
  return map[provider] || "";
}

function setSettingsModalOpen(open) {
  if (!settingsModal) return;
  settingsModal.classList.toggle("show", open);
  settingsModal.setAttribute("aria-hidden", open ? "false" : "true");
}

function getUserNickname() {
  try {
    return localStorage.getItem(USER_NICKNAME_STORAGE)?.trim() || "你";
  } catch {
    return "你";
  }
}

function getGreetingTargetName() {
  const nickname = getUserNickname();
  if (!nickname || nickname === "你") return "华生";
  return nickname;
}

function getUserAvatar() {
  try {
    return localStorage.getItem(USER_AVATAR_STORAGE)?.trim() || "";
  } catch {
    return "";
  }
}

function renderSettingsAvatarPreview(avatarUrl = getUserAvatar()) {
  const nextUrl = String(avatarUrl || "").trim();
  if (settingsAvatarPreview) {
    settingsAvatarPreview.src = nextUrl || "assets/img/user_avatar.png";
  }
  if (clearAvatarBtn) clearAvatarBtn.hidden = !nextUrl;
}

function applyUserIdentityToAvatar(avatarEl, role) {
  if (!avatarEl || role !== "user") return;
  const nickname = getUserNickname();
  const avatarUrl = getUserAvatar();
  avatarEl.title = nickname;
  if (avatarUrl) {
    avatarEl.style.backgroundImage = `url("${avatarUrl}")`;
    avatarEl.style.backgroundSize = "cover";
    avatarEl.style.backgroundPosition = "center";
    avatarEl.textContent = "";
    avatarEl.style.fontSize = "0";
    return;
  }

  avatarEl.style.backgroundImage = "none";
  avatarEl.style.background = "linear-gradient(160deg, #b2cdf7, #7fa8ed)";
  avatarEl.style.color = "#fff";
  avatarEl.style.fontSize = "15px";
  avatarEl.style.fontWeight = "700";
  avatarEl.textContent = nickname.slice(0, 1) || "你";
}

function refreshUserAvatarsInFeed() {
  chatFeed
    ?.querySelectorAll(".msg.user-msg .msg-avatar")
    .forEach((avatarEl) => applyUserIdentityToAvatar(avatarEl, "user"));
}

let toastTimer = null;
function showModeTip(text) {
  modeToast.textContent = text;
  modeToast.classList.add("show");
  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    modeToast.classList.remove("show");
  }, 1800);
}

function exportDraftAsMarkdown() {
  if (!draftInput) return;
  const content = draftInput.value.trim();
  if (!content) {
    showModeTip("笔记为空，暂无可导出内容");
    return;
  }
  const now = new Date();
  const stamp = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(
    now.getDate(),
  ).padStart(2, "0")}_${String(now.getHours()).padStart(2, "0")}${String(now.getMinutes()).padStart(2, "0")}`;
  const markdown = `# 学习笔记\n\n导出时间：${formatTime()}\n\n---\n\n${content}\n\n---\n💗 由 Study With Xiayan 生成`;
  const blob = new Blob([markdown], { type: "text/markdown;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `study-note_${stamp}.md`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
  showModeTip("已导出 Markdown 笔记");
}

function renderRichContent(element, text) {
  if (!element) return;
  element.innerHTML = marked.parse(text || "");
  if (typeof window.renderMathInElement === "function") {
    window.renderMathInElement(element, {
      delimiters: [
        { left: "$$", right: "$$", display: true },
        { left: "\\[", right: "\\]", display: true },
        { left: "$", right: "$", display: false },
        { left: "\\(", right: "\\)", display: false },
      ],
      throwOnError: false,
      ignoredTags: ["script", "noscript", "style", "textarea", "pre", "code"],
    });
  }
  element
    .querySelectorAll("pre code")
    .forEach((el) => hljs.highlightElement(el));
}

function renderDraftPreview() {
  if (!draftPreview || !draftInput) return;
  const source = String(draftInput.value || "").trim();
  if (!source) {
    draftPreview.innerHTML = '<p class="draft-empty">夏彦回答后会自动生成笔记...</p>';
    return;
  }
  renderRichContent(draftPreview, source);
}

function setDraftEditMode(editing) {
  if (!draftBox) return;
  draftBox.classList.toggle("draft-editing", !!editing);
}

function appendMsg(text, options = {}) {
  const {
    role = "assistant",
    thinking = false,
    isError = false,
  } = options;
  const article = document.createElement("article");
  article.className = "msg";
  const avatar = document.createElement("div");
  const isUser = role === "user";
  if (isUser) article.classList.add("user-msg");
  avatar.className = `msg-avatar ${isUser ? "user" : "ai"}`;
  avatar.textContent = isUser ? "你" : "";
  applyUserIdentityToAvatar(avatar, role);
  const body = document.createElement("div");
  body.className = "msg-body";
  if (isError) body.classList.add("error-box");
  if (thinking) {
    body.innerHTML = `
          <div class="skeleton" id="current-thinking">
            <div class="skeleton-bar"></div>
            <div class="skeleton-bar"></div>
            <div class="skeleton-bar"></div>
          </div>`;
  } else {
    renderRichContent(body, text);
  }
  article.appendChild(avatar);
  article.appendChild(body);
  chatFeed.appendChild(article);
  chatFeed.scrollTop = chatFeed.scrollHeight;
  return { article, body };
}

function increaseContext() {
  refreshContextMeter();
}

function setBusy(state) {
  isBusy = state;
  pickBtn.disabled = state;
  explainBtn.disabled = state;
  askInput.disabled = state;
  askSubmitBtn.disabled = state;
}

function updateContextByUsage(usage) {
  if (!ctxText) return;
  if (!usage || typeof usage.total_tokens !== "number") {
    refreshContextMeter();
    return;
  }
  paintContextMeter(usage.total_tokens);
}

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("图片读取失败，请重试。"));
    reader.readAsDataURL(file);
  });
}

function parseApiError(data, fallback) {
  if (data && data.error && data.error.message) return data.error.message;
  return fallback || "接口调用失败，请稍后重试。";
}

function extractChunkText(data) {
  const delta = data?.choices?.[0]?.delta || {};
  if (typeof delta.content === "string") return delta.content;
  if (Array.isArray(delta.content)) {
    return delta.content
      .map((item) => (typeof item === "string" ? item : item?.text || ""))
      .join("");
  }
  return "";
}

function createAssistantContentFilter() {
  let activeTagEnd = null;
  const tagMap = {
    "<think>": "</think>",
    "<thought>": "</thought>",
    "<thinking>": "</thinking>",
    "<reasoning>": "</reasoning>",
  };

  return (chunkText) => {
    if (!chunkText) return "";
    let text = String(chunkText);
    let output = "";

    while (text.length) {
      if (activeTagEnd) {
        const endIdx = text.indexOf(activeTagEnd);
        if (endIdx === -1) return "";
        text = text.slice(endIdx + activeTagEnd.length);
        activeTagEnd = null;
        continue;
      }

      let foundTag = null;
      let earliestIdx = -1;

      for (const tag in tagMap) {
        const idx = text.indexOf(tag);
        if (idx !== -1 && (earliestIdx === -1 || idx < earliestIdx)) {
          earliestIdx = idx;
          foundTag = tag;
        }
      }

      if (earliestIdx === -1) {
        output += text;
        break;
      }

      output += text.slice(0, earliestIdx);
      const afterStart = text.slice(earliestIdx + foundTag.length);
      activeTagEnd = tagMap[foundTag];
      const endIdx = afterStart.indexOf(activeTagEnd);

      if (endIdx === -1) {
        text = ""; // 剩下的都在思考中
        break;
      }

      text = afterStart.slice(endIdx + activeTagEnd.length);
      activeTagEnd = null;
    }

    return output;
  };
}

async function* callModelStream(
  messages,
  configKey = syncModelWithMode(),
  options = {},
) {
  const targetMode = options.modeOverride || currentMode;
  const provider = getProvider();
  const isProxy = provider === "proxy";
  // proxy 系列通过代理 URL 鉴权，不需要额外的 Authorization 头
  const noAuthProviders = new Set(["proxy"]);
  const requiresApiKey = !noAuthProviders.has(provider);
  const proxyFallbackKey = getProxyModelByMode(targetMode);
  const config = MODEL_CONFIGS[configKey] || MODEL_CONFIGS[proxyFallbackKey];
  if (isProxy && !config)
    throw new Error("内置代理模型配置缺失，请在设置中切换为可用模型");

  const requestUrl = isProxy ? config.url : getProviderBaseUrl(provider);

  if (!requestUrl) {
    if (provider.startsWith("native_")) {
      const envVarName = `PROXY_${provider.split('_')[1].toUpperCase()}_URL`;
      throw new Error(`内置代理地址未配置，请联系站长在环境变量中注入 ${envVarName}`);
    }
    throw new Error("请在设置中填写有效的 API Base URL");
  }
  const modelName = isProxy
    ? config.model
    : getConfiguredModeModel(targetMode);
  // 传入 provider 以便优先从 env.local.js 读取对应 API Key
  const userApiKey = getUserApiKey(provider);
  const payload = {
    model: modelName,
    messages,
    stream: true,
  };

  const headers = { "Content-Type": "application/json" };
  if (requiresApiKey && userApiKey) headers.Authorization = `Bearer ${userApiKey}`;

  if (requiresApiKey && !userApiKey)
    throw new Error("请先在设置中填写 API Key（或在 env.local.js 中配置对应的 API Key）");

  const response = await fetch(requestUrl, {
    method: "POST",
    headers,
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(
      parseApiError(errorData, `请求失败（HTTP ${response.status}）`),
    );
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder("utf-8");
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop();

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || !trimmed.startsWith("data: ")) continue;
      const dataStr = trimmed.slice(6);
      if (dataStr === "[DONE]") return;
      try {
        const data = JSON.parse(dataStr);
        const content = extractChunkText(data);
        if (content || data.usage) yield { content, usage: data.usage };
      } catch (e) {
        console.warn("[callModelStream] SSE chunk 解析失败", dataStr, e);
      }
    }
  }
}

async function summarizeToDraft(question, answer) {
  if (!draftInput || !answer?.trim()) return;
  try {
    const summaryMessages = [
      {
        role: "system",
        content:
          "你是学习笔记整理助手。请把问答整理成简洁笔记，不要<think>标签。结构：题目要点、核心思路、关键步骤、易错点。",
      },
      {
        role: "user",
        content: `问题：\n${question}\n\n回答：\n${answer}\n\n请整理为可直接抄写的学习笔记。`,
      },
    ];

    const filterAssistantChunk = createAssistantContentFilter();
    let summaryText = "";
    const stream = callModelStream(
      summaryMessages,
      getConfiguredModeModel("fast"),
      { modeOverride: "fast" },
    );

    for await (const chunk of stream) {
      const visibleContent = filterAssistantChunk(chunk.content);
      if (visibleContent) summaryText += visibleContent;
    }

    const note = summaryText.trim();
    if (!note) return;
    draftInput.value = draftInput.value.trim()
      ? `${draftInput.value.trim()}\n\n——\n${note}`
      : note;
    draftInput.scrollTop = draftInput.scrollHeight;
    renderDraftPreview();
  } catch (error) {
    console.error("[summarizeToDraft] 生成草稿笔记失败", error);
  }
}

async function initGreeting() {
  if (!getCurrentSession(false)) {
    createSession("日常对话");
  }
  await systemPromptReady;
  const userNickname = getGreetingTargetName();
  const { body: msgBody } = appendMsg("", { thinking: true });

  try {
    const messages = [
      { role: "system", content: SYSTEM_PROMPT },
      {
        role: "user",
        content:
          `你正在给华生发消息，华生昵称是“${userNickname}”。请自然地向 TA 打个招呼，并优先使用这个昵称称呼。记得保持你的性格特点，不要输出Markdown，不要解释设定，不要说明 Prompt，也不要用括号表示动作或表情，更不要代入场景，尽量简短，减少Token消耗。`,
      },
    ];

    let fullText = "";
    let displayedText = "";
    const filterAssistantChunk = createAssistantContentFilter();
    const stream = callModelStream(messages);

    for await (const chunk of stream) {
      const visibleContent = filterAssistantChunk(chunk.content);
      if (!visibleContent) continue;
      if (fullText === "") {
        msgBody.innerHTML = "";
        msgBody.classList.add("typing-active");
      }
      fullText += visibleContent;

      while (displayedText.length < fullText.length) {
        const charGap = fullText.length - displayedText.length;
        const step = charGap > 30 ? Math.ceil(charGap / 5) : 1;
        displayedText = fullText.substring(0, displayedText.length + step);
        msgBody.innerHTML = marked.parse(displayedText);
        chatFeed.scrollTop = chatFeed.scrollHeight;
        if (charGap < 50) await new Promise((r) => setTimeout(r, 15));
      }
    }
    msgBody.classList.remove("typing-active");
    renderRichContent(msgBody, fullText);
    conversation.push({ role: "assistant", content: fullText });
    appendSessionMessage("assistant", fullText);
  } catch (e) {
    console.error("[initGreeting] 初始化问候失败", e);
    msgBody.classList.add("error-box");
    msgBody.innerHTML =
      "嘿，华生，你来啦！刚才信号好像有点不稳定……（初始化失败）";
  }
}

function clearPreview(resetConversation = true) {
  uploaded = null;
  uploadedDataUrl = "";
  if (previewObjectUrl) {
    URL.revokeObjectURL(previewObjectUrl);
    previewObjectUrl = "";
  }
  previewImg.style.display = "none";
  previewImg.removeAttribute("src");
  placeholder.style.display = "block";
  characterBubble.textContent =
    "把题目发给我，我会先给你结论，再一步一步解释为什么这样做。";
  if (resetConversation) conversation.length = 0;
  refreshContextMeter();
}

function setActiveMobileTab(tab) {
  if (!mobileTabButtons.length) return;
  mobileTabButtons.forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.tab === tab);
  });
}

function scrollToTabSection(tab) {
  if (tab === "chat") {
    chatFeed?.scrollTo({ top: chatFeed.scrollHeight, behavior: "smooth" });
    chatPanel?.scrollIntoView({ behavior: "smooth", block: "start" });
    return;
  }
  if (tab === "question") {
    questionCard?.scrollIntoView({ behavior: "smooth", block: "start" });
    return;
  }
  if (tab === "draft") {
    draftPanel?.scrollIntoView({ behavior: "smooth", block: "start" });
  }
}

function updateScrollBottomBtnVisibility() {
  if (!scrollBottomBtn || !chatFeed) return;
  const distanceToBottom = chatFeed.scrollHeight - chatFeed.clientHeight - chatFeed.scrollTop;
  const hidden = distanceToBottom < 80;
  scrollBottomBtn.style.opacity = hidden ? "0" : "1";
  scrollBottomBtn.style.pointerEvents = hidden ? "none" : "auto";
}

async function handleImageFileSelection(file, options = {}) {
  const fromCamera = !!options.fromCamera;
  if (!file) return;

  if (!file.type.startsWith("image/")) {
    appendMsg("只支持图片文件，请重新选择。", { isError: true });
    return;
  }
  if (file.size > 8 * 1024 * 1024) {
    appendMsg("图片请控制在 8MB 以内，避免上传失败。", { isError: true });
    return;
  }

  uploaded = file;
  conversation.length = 0;
  createSession("图片题目讲解");

  if (previewObjectUrl) URL.revokeObjectURL(previewObjectUrl);
  previewObjectUrl = URL.createObjectURL(file);
  previewImg.src = previewObjectUrl;
  previewImg.style.display = "block";
  placeholder.style.display = "none";

  try {
    uploadedDataUrl = await fileToDataUrl(file);
  } catch (error) {
    clearPreview(false);
    appendMsg(error.message, { isError: true });
    return;
  }

  timeTip.textContent = formatTime();
  const sourceText = fromCamera ? "拍照" : "上传";
  updateCharacterBubble(`已收到${sourceText}题目《${file.name}》，点“讲解”开始。`);
  appendMsg(`收到你的题目：${file.name}。你可以点“讲解”，我会给你完整思路。`);
  explainBtn.classList.add("btn-pulse");
  setActiveMobileTab("question");
  questionCard?.scrollIntoView({ behavior: "smooth", block: "start" });
  refreshContextMeter();
}

pickBtn.addEventListener("click", () => fileInput.click());

cameraBtn?.addEventListener("click", () => cameraInput?.click());

fileInput.addEventListener("change", async (e) => {
  const file = e.target.files?.[0];
  await handleImageFileSelection(file, { fromCamera: false });
  fileInput.value = "";
});

cameraInput?.addEventListener("change", async (e) => {
  const file = e.target.files?.[0];
  await handleImageFileSelection(file, { fromCamera: true });
  cameraInput.value = "";
});

explainBtn.addEventListener("click", async () => {
  if (!uploaded) {
    appendMsg("请先上传题目图片，我才能开始讲解。", { isError: true });
    return;
  }
  if (!uploadedDataUrl) {
    appendMsg("图片尚未就绪，请重新上传后再试。", { isError: true });
    return;
  }
  if (isBusy) return;

  explainBtn.classList.remove("btn-pulse");
  appendSessionMessage("user", "请讲解我上传的题目图片");
  const { article: thinkingMsg, body: msgBody } = appendMsg("正在思考...", {
    thinking: true,
  });
  setBusy(true);
  try {
    await systemPromptReady;
    const modePrompt = MODE_INSTRUCTIONS[currentMode];
    const userPrompt = `${modePrompt}\n${PERSONA_REINFORCEMENT}\n请讲解这道题。先给最终结论，再给完整步骤推导（分点编号），最后给易错点和检查方法。`;
    const messages = [
      { role: "system", content: SYSTEM_PROMPT },
      ...conversation,
      {
        role: "user",
        content: [
          { type: "text", text: userPrompt },
          { type: "image_url", image_url: { url: uploadedDataUrl } },
        ],
      },
    ];

    let fullText = "";
    let displayedText = "";
    let lastUsage = null;
    const filterAssistantChunk = createAssistantContentFilter();
    const stream = callModelStream(messages);

    for await (const chunk of stream) {
      const visibleContent = filterAssistantChunk(chunk.content);
      if (!visibleContent) {
        if (chunk.usage) lastUsage = chunk.usage;
        continue;
      }
      if (fullText === "") {
        msgBody.innerHTML = ""; // 收到第一个块时清除骨架屏
        msgBody.classList.add("typing-active");
      }
      fullText += visibleContent;

      // 逐字平滑追赶逻辑
      while (displayedText.length < fullText.length) {
        const charGap = fullText.length - displayedText.length;
        const step = charGap > 30 ? Math.ceil(charGap / 5) : 1;
        displayedText = fullText.substring(0, displayedText.length + step);

        msgBody.innerHTML = marked.parse(displayedText);
        chatFeed.scrollTop = chatFeed.scrollHeight;
        if (charGap < 50) await new Promise((r) => setTimeout(r, 15));
      }
      if (chunk.usage) lastUsage = chunk.usage;
    }

    msgBody.classList.remove("typing-active");
    renderRichContent(msgBody, fullText);
    appendSessionMessage("assistant", fullText);
    summarizeSessionTitle(currentSessionId);
    conversation.push({
      role: "user",
      content: "我上传了一道题目图片，请你完整讲解。",
    });
    conversation.push({ role: "assistant", content: fullText });
    await summarizeToDraft("我上传了一道题目图片，请你完整讲解。", fullText);
    updateCharacterBubble("讲解完成。你可以继续追问“为什么这么做”。");
    if (lastUsage) updateContextByUsage(lastUsage);
  } catch (error) {
    console.error("[explainBtn] 讲解请求失败", error);
    thinkingMsg.remove();
    appendMsg(`讲解失败：${error.message}`, { isError: true });
  } finally {
    setBusy(false);
  }
});

clearBtn.addEventListener("click", () => {
  clearPreview();
  explainBtn.classList.remove("btn-pulse");
  fileInput.value = "";
  appendMsg("题目已清空。重新上传后我会继续讲解。");
  setActiveMobileTab("question");
});

askForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const q = askInput.value.trim();
  if (!q) return;
  if (isBusy) return;

  appendMsg(q, { role: "user" });
  appendSessionMessage("user", q);
  askInput.value = "";
  askInput.style.height = "auto";
  refreshContextMeter();
  setBusy(true);
  setActiveMobileTab("chat");
  scrollToTabSection("chat");

  let thinkingMsg = null;
  let msgBody = null;

  await sleep(500);

  ({ article: thinkingMsg, body: msgBody } = appendMsg("正在思考...", {
    thinking: true,
  }));
  try {
    await systemPromptReady;
    const modePrompt = MODE_INSTRUCTIONS[currentMode];
    const fullQuery = `${modePrompt}\n${PERSONA_REINFORCEMENT}\n${q}`;
    const messages = [
      { role: "system", content: SYSTEM_PROMPT },
      ...conversation,
      { role: "user", content: fullQuery },
    ];

    let fullText = "";
    let displayedText = "";
    let lastUsage = null;
    const filterAssistantChunk = createAssistantContentFilter();
    const stream = callModelStream(messages);

    for await (const chunk of stream) {
      const visibleContent = filterAssistantChunk(chunk.content);
      if (!visibleContent) {
        if (chunk.usage) lastUsage = chunk.usage;
        continue;
      }
      if (fullText === "") {
        msgBody.innerHTML = "";
        msgBody.classList.add("typing-active");
      }
      fullText += visibleContent;

      while (displayedText.length < fullText.length) {
        const charGap = fullText.length - displayedText.length;
        const step = charGap > 30 ? Math.ceil(charGap / 5) : 1;
        displayedText = fullText.substring(0, displayedText.length + step);

        msgBody.innerHTML = marked.parse(displayedText);
        chatFeed.scrollTop = chatFeed.scrollHeight;
        if (charGap < 50) await new Promise((r) => setTimeout(r, 15));
      }
      if (chunk.usage) lastUsage = chunk.usage;
    }

    msgBody.classList.remove("typing-active");
    renderRichContent(msgBody, fullText);
    appendSessionMessage("assistant", fullText);
    summarizeSessionTitle(currentSessionId);
    conversation.push({ role: "user", content: q });
    conversation.push({ role: "assistant", content: fullText });
    await summarizeToDraft(q, fullText);
    if (lastUsage) updateContextByUsage(lastUsage);
  } catch (error) {
    console.error("[askForm] 追问请求失败", error);
    if (thinkingMsg) thinkingMsg.remove();
    appendMsg(`追问失败：${error.message}`, { isError: true });
  } finally {
    setBusy(false);
  }
});

moreBtn?.addEventListener("click", () => setSidebarOpen(true));

sidebarCloseBtn?.addEventListener("click", () => setSidebarOpen(false));

sidebarOverlay?.addEventListener("click", (e) => {
  if (e.target === sidebarOverlay) setSidebarOpen(false);
});

scrollBottomBtn?.addEventListener("click", () => {
  chatFeed?.scrollTo({ top: chatFeed.scrollHeight, behavior: "smooth" });
});

chatFeed?.addEventListener("scroll", updateScrollBottomBtnVisibility);

mobileTabButtons.forEach((btn) => {
  btn.addEventListener("click", () => {
    const tab = btn.dataset.tab;
    if (!tab) return;
    if (tab === "settings") {
      setSidebarOpen(true);
      setActiveMobileTab("settings");
      return;
    }
    setSidebarOpen(false);
    setActiveMobileTab(tab);
    scrollToTabSection(tab);
  });
});

openSettingsBtn?.addEventListener("click", () => {
  setSidebarOpen(false);
  openSettingsPanel();
});

clearHistoryBtn?.addEventListener("click", () => {
  try {
    clearPreview();
    explainBtn.classList.remove("btn-pulse");
    fileInput.value = "";
    const session = createSession("新的对话");
    loadSession(session.id);
    initGreeting();
    showModeTip("已创建新对话");
  } catch (e) {
    console.error("[clearHistoryBtn] 创建新对话失败", e);
    showModeTip("创建失败");
  }
});

closeSettingsBtn?.addEventListener("click", () => setSettingsModalOpen(false));

settingsModal?.addEventListener("click", (e) => {
  if (e.target === settingsModal) setSettingsModalOpen(false);
});

providerSelect?.addEventListener("change", () => {
  const provider = providerSelect.value || "native_gemini";
  if (baseUrlInput) {
    baseUrlInput.value =
      provider === "custom" ? getProviderBaseUrl("custom") : "";
  }
  if (provider === "proxy") {
    if (fastModelInput) fastModelInput.value = getProxyModelByMode("fast");
    if (thinkingModelInput) thinkingModelInput.value = getProxyModelByMode("thinking");
    triggerContextWindowRefresh(currentMode);
    return;
  }
  if (provider === "native_gemini") {
    if (fastModelInput) fastModelInput.value = "gemini-3-flash-preview-nothinking";
    if (thinkingModelInput) thinkingModelInput.value = "gemini-3.1-pro-preview";
    triggerContextWindowRefresh(currentMode);
    return;
  }
  if (provider === "native_claude") {
    if (fastModelInput) fastModelInput.value = "claude-opus-4-6";
    if (thinkingModelInput) thinkingModelInput.value = "claude-opus-4-6-thinking";
    triggerContextWindowRefresh(currentMode);
    return;
  }
  if (provider === "deepseek" || provider === "native_deepseek") {
    if (fastModelInput) fastModelInput.value = "deepseek-chat";
    if (thinkingModelInput) thinkingModelInput.value = "deepseek-reasoner";
  }
  triggerContextWindowRefresh(currentMode);
});

saveApiKeyBtn?.addEventListener("click", () => {
  const key = apiKeyInput.value.trim();
  try {
    const provider = providerSelect?.value || "native_gemini";
    localStorage.setItem(PROVIDER_STORAGE, provider);
    if (key) localStorage.setItem(USER_API_KEY_STORAGE, key);
    if (provider === "custom") {
      localStorage.setItem(BASE_URL_STORAGE, (baseUrlInput?.value || "").trim());
    } else {
      localStorage.removeItem(BASE_URL_STORAGE);
    }
    let fastModel =
      fastModelInput?.value.trim() || getDefaultModelForProvider(provider, "fast");
    let thinkingModel =
      thinkingModelInput?.value.trim() ||
      getDefaultModelForProvider(provider, "thinking");
    if (provider === "proxy") {
      if (!MODEL_CONFIGS[fastModel]) fastModel = getProxyModelByMode("fast");
      if (!MODEL_CONFIGS[thinkingModel])
        thinkingModel = getProxyModelByMode("thinking");
    }
    setConfiguredModeModel("fast", fastModel);
    setConfiguredModeModel("thinking", thinkingModel);
    const nickname = (nicknameInput?.value || "").trim() || "你";
    const avatarUrl = (avatarUrlInput?.value || "").trim();
    localStorage.setItem(USER_NICKNAME_STORAGE, nickname);
    if (avatarUrl) {
      localStorage.setItem(USER_AVATAR_STORAGE, avatarUrl);
    } else {
      localStorage.removeItem(USER_AVATAR_STORAGE);
    }
    renderSettingsAvatarPreview(avatarUrl);
    refreshUserAvatarsInFeed();
    triggerContextWindowRefresh(currentMode);
    showModeTip("设置已保存");
    setSettingsModalOpen(false);
  } catch (e) {
    console.error("[saveApiKeyBtn] 保存设置失败", e);
    showModeTip("保存失败：浏览器禁止了本地存储");
  }
});

clearApiKeyBtn?.addEventListener("click", () => {
  try {
    localStorage.removeItem(USER_API_KEY_STORAGE);
    localStorage.removeItem(PROVIDER_STORAGE);
    localStorage.removeItem(BASE_URL_STORAGE);
    localStorage.removeItem(FAST_MODEL_STORAGE);
    localStorage.removeItem(THINKING_MODEL_STORAGE);
    localStorage.removeItem(USER_NICKNAME_STORAGE);
    localStorage.removeItem(USER_AVATAR_STORAGE);
    apiKeyInput.value = "";
    if (providerSelect) providerSelect.value = "native_gemini";
    if (baseUrlInput) baseUrlInput.value = "";
    if (fastModelInput) fastModelInput.value = getDefaultModelForProvider("native_gemini", "fast");
    if (thinkingModelInput) thinkingModelInput.value = getDefaultModelForProvider("native_gemini", "thinking");
    if (nicknameInput) nicknameInput.value = "你";
    if (avatarUrlInput) avatarUrlInput.value = "";
    renderSettingsAvatarPreview("");
    refreshUserAvatarsInFeed();
    triggerContextWindowRefresh(currentMode);
    showModeTip("已清除并恢复默认模型");
  } catch (e) {
    console.error("[clearApiKeyBtn] 清除设置失败", e);
    showModeTip("清除失败");
  }
});

resetDefaultModelsBtn?.addEventListener("click", () => {
  try {
    const provider = "native_gemini";
    localStorage.setItem(PROVIDER_STORAGE, provider);
    localStorage.removeItem(BASE_URL_STORAGE);
    const fastModel = getDefaultModelForProvider(provider, "fast");
    const thinkingModel = getDefaultModelForProvider(provider, "thinking");
    setConfiguredModeModel("fast", fastModel);
    setConfiguredModeModel("thinking", thinkingModel);
    if (providerSelect) providerSelect.value = provider;
    if (baseUrlInput) baseUrlInput.value = "";
    if (fastModelInput) fastModelInput.value = fastModel;
    if (thinkingModelInput) thinkingModelInput.value = thinkingModel;
    triggerContextWindowRefresh(currentMode);
    showModeTip("已恢复默认：Gemini");
  } catch (e) {
    console.error("[resetDefaultModelsBtn] 恢复默认失败", e);
    showModeTip("恢复默认失败");
  }
});

uploadAvatarBtn?.addEventListener("click", () => avatarFileInput?.click());

avatarFileInput?.addEventListener("change", async (e) => {
  const file = e.target.files?.[0];
  if (!file) return;
  if (!file.type.startsWith("image/")) {
    showModeTip("请选择图片文件");
    avatarFileInput.value = "";
    return;
  }
  if (file.size > 2 * 1024 * 1024) {
    showModeTip("头像请控制在 2MB 以内");
    avatarFileInput.value = "";
    return;
  }
  try {
    const dataUrl = await fileToDataUrl(file);
    if (avatarUrlInput) avatarUrlInput.value = dataUrl;
    renderSettingsAvatarPreview(dataUrl);
    showModeTip("头像已就绪，记得点击保存");
  } catch {
    showModeTip("头像读取失败");
  } finally {
    avatarFileInput.value = "";
  }
});

clearAvatarBtn?.addEventListener("click", () => {
  if (avatarUrlInput) avatarUrlInput.value = "";
  renderSettingsAvatarPreview("");
  showModeTip("头像已清空，记得点击保存");
});

exportMdBtn?.addEventListener("click", exportDraftAsMarkdown);

draftPreview?.addEventListener("click", () => {
  setDraftEditMode(true);
  draftInput?.focus();
});

draftInput?.addEventListener("input", () => {
  renderDraftPreview();
});

draftInput?.addEventListener("blur", () => {
  setDraftEditMode(false);
});

document.addEventListener("keydown", (e) => {
  if (e.key !== "Escape") return;
  if (sidebarOverlay?.classList.contains("show")) {
    setSidebarOpen(false);
    return;
  }
  if (settingsModal?.classList.contains("show")) {
    setSettingsModalOpen(false);
  }
});

modeSwitch?.addEventListener("click", (e) => {
  const btn = e.target.closest(".mode-btn");
  if (!btn) return;
  const mode = btn.dataset.mode;
  if (!mode || mode === currentMode) return;
  setMode(mode);
  refreshContextMeter(askInput?.value || "");
  if (mode === "thinking") {
    alert("来自作者的话:\n思考模式所使用的模型由于种种原因成本较高, 快速所使用的模型也不是那么不堪。如果不是要处理特别复杂的题目, 建议还是使用快速模式哦~");
  }
});

askInput?.addEventListener("input", () => {
  refreshContextMeter(askInput.value || "");
  askInput.style.height = "auto";
  askInput.style.height = `${Math.min(140, askInput.scrollHeight)}px`;
});

askInput?.addEventListener("focus", () => {
  document.body.classList.add("keyboard-up");
});

askInput?.addEventListener("blur", () => {
  // 延迟移除，避免点发送按钮瞬间键盘收起导致的抖动
  setTimeout(() => {
    document.body.classList.remove("keyboard-up");
  }, 100);
});

baseUrlInput?.addEventListener("input", () => {
  if ((providerSelect?.value || "") === "custom") {
    triggerContextWindowRefresh(currentMode);
  }
});

fastModelInput?.addEventListener("input", () => {
  if (currentMode === "fast") triggerContextWindowRefresh("fast");
});

thinkingModelInput?.addEventListener("input", () => {
  if (currentMode === "thinking") triggerContextWindowRefresh("thinking");
});

setMode("fast");
triggerContextWindowRefresh("fast");

timeTip.textContent = formatTime();
const initialSession = getCurrentSession(false);
if (initialSession) {
  loadSession(initialSession.id);
} else {
  renderHistoryList();
  initGreeting();
}
setActiveMobileTab("chat");
updateScrollBottomBtnVisibility();
refreshContextMeter();
setDraftEditMode(false);
renderDraftPreview();

const COMPLIANCE_AGREED_KEY = "xiayan_compliance_agreed_v1";
if (!localStorage.getItem(COMPLIANCE_AGREED_KEY)) {
  if (complianceModal) {
    complianceModal.classList.add("show");
    complianceModal.removeAttribute("aria-hidden");
  }
}

agreeComplianceBtn?.addEventListener("click", () => {
  localStorage.setItem(COMPLIANCE_AGREED_KEY, "true");
  complianceModal?.classList.remove("show");
  complianceModal?.setAttribute("aria-hidden", "true");
});
