import {
  SIDEBAR_ANIM_DURATION, DEFAULT_CONTEXT_WINDOW_TOKENS,
  MODEL_CONFIGS, MODE_INSTRUCTIONS, PERSONA_REINFORCEMENT,
  PROVIDER_STORAGE, USER_API_KEY_STORAGE, BASE_URL_STORAGE,
  USER_NICKNAME_STORAGE, USER_AVATAR_STORAGE,
  getProviderBaseUrl, getProxyModelByMode, getDefaultModelForProvider,
} from "./config.js";
import {
  formatTime, buildSessionId,
  getStoredSessions, saveSessions, getSessionSortTimestamp,
  setCurrentSessionId, getCurrentSessionIdValue, getActiveSessionId,
  updateSession,
  getUserApiKey, getProvider, getConfiguredModeModel, setConfiguredModeModel,
  getUserNickname, getGreetingTargetName, getUserAvatar,
} from "./storage.js";
import {
  getCurrentMode, setCurrentMode, getContextWindowTokens,
  formatContextWindowLabel,
  callModelStream, createAssistantContentFilter,
  loadSystemPrompt, getSystemPrompt,
  triggerContextWindowRefresh, setRefreshContextMeter,
} from "./api.js";

// ── DOM 引用 ──
const $ = (id) => document.getElementById(id);
const fileInput = $("fileInput"), pickBtn = $("pickBtn"), explainBtn = $("explainBtn"), clearBtn = $("clearBtn");
const previewImg = $("previewImg"), placeholder = $("placeholder"), chatFeed = $("chatFeed");
const imageLightbox = $("imageLightbox"), lightboxImg = $("lightboxImg"), imageLightboxClose = $("imageLightboxClose");
const askForm = $("askForm"), askInput = $("askInput");
const draftInput = $("draft"), draftPreview = $("draftPreview"), draftBox = document.querySelector(".draft-box");
const exportMdBtn = $("exportMdBtn"), timeTip = $("timeTip");
const ctxRing = $("ctxRing"), ctxPct = $("ctxPct"), ctxText = $("ctxText");
const questionCard = $("questionCard"), characterBubble = $("characterBubble");
const askSubmitBtn = askForm.querySelector('button[type="submit"]');

// 兜底：无论何种提交路径都阻止表单触发页面导航
document.addEventListener("submit", (event) => {
  if (event.target?.id === "askForm") event.preventDefault();
}, true);
const cameraBtn = $("cameraBtn"), cameraInput = $("cameraInput"), scrollBottomBtn = $("scrollBottomBtn");
const mobileTabButtons = Array.from(document.querySelectorAll(".mobile-tabbar .tab-btn"));
const modeSwitch = $("modeSwitch"), modeButtons = Array.from(document.querySelectorAll(".mode-btn"));
const moreBtn = $("moreBtn"), chatPanel = document.querySelector("main.chat"), draftPanel = document.querySelector("aside.draft");
const sidebarOverlay = $("sidebarOverlay"), sidebarDrawer = $("sidebarDrawer"), sidebarCloseBtn = $("sidebarCloseBtn");
const openSettingsBtn = $("openSettingsBtn"), historyList = $("historyList"), clearHistoryBtn = $("clearHistoryBtn");
const historySearchInput = $("historySearchInput");
const settingsModal = $("settingsModal"), apiKeyInput = $("apiKeyInput");
const saveApiKeyBtn = $("saveApiKeyBtn"), resetDefaultModelsBtn = $("resetDefaultModelsBtn");
const clearApiKeyBtn = $("clearApiKeyBtn"), closeSettingsBtn = $("closeSettingsBtn");
const providerSelect = $("providerSelect"), baseUrlInput = $("baseUrlInput");
const fastModelInput = $("fastModelInput"), thinkingModelInput = $("thinkingModelInput");
const nicknameInput = $("nicknameInput"), avatarUrlInput = $("avatarUrlInput");
const settingsAvatarPreview = $("settingsAvatarPreview");
const uploadAvatarBtn = $("uploadAvatarBtn"), clearAvatarBtn = $("clearAvatarBtn"), avatarFileInput = $("avatarFileInput");
const complianceModal = $("complianceModal"), agreeComplianceBtn = $("agreeComplianceBtn");

const modeToast = document.createElement("div");
modeToast.className = "mode-toast";
document.body.appendChild(modeToast);

// ── 应用状态 ──
let uploaded = null, uploadedDataUrl = "", previewObjectUrl = "";
let isBusy = false, sidebarCloseTimer = null, toastTimer = null;
const conversation = [];
const systemPromptReady = loadSystemPrompt();

// ── 移动端检测 ──
function detectMobileLikeDevice() {
  const hasTouch = "ontouchstart" in window || navigator.maxTouchPoints > 0;
  return window.matchMedia("(max-width: 980px)").matches && hasTouch;
}
function syncMobileUiClass() { document.body.classList.toggle("is-mobile", detectMobileLikeDevice()); }
syncMobileUiClass();
window.addEventListener("resize", syncMobileUiClass);

// ── 工具函数 ──
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let toastId = 0;
function showModeTip(text) {
  modeToast.textContent = text;
  modeToast.classList.add("show");
  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => modeToast.classList.remove("show"), 1800);
}

function setBusy(state) {
  isBusy = state;
  pickBtn.disabled = state;
  explainBtn.disabled = state;
  askInput.disabled = state;
  askSubmitBtn.disabled = state;
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

// ── 上下文计量 ──
function estimateTokensFromText(text) {
  const s = String(text || "").trim();
  if (!s) return 0;
  try { return Math.max(1, Math.ceil(new TextEncoder().encode(s).length / 4)); }
  catch { return Math.max(1, Math.ceil(s.length / 2)); }
}

function computeContextTokens(extraInput = "") {
  let total = estimateTokensFromText(getSystemPrompt())
    + estimateTokensFromText(MODE_INSTRUCTIONS[getCurrentMode()] || "")
    + estimateTokensFromText(PERSONA_REINFORCEMENT);
  conversation.forEach((item) => { total += estimateTokensFromText(item?.content || ""); });
  if (uploadedDataUrl) total += 1200;
  total += estimateTokensFromText(extraInput);
  return Math.max(0, total);
}

function paintContextMeter(tokens) {
  if (!ctxText) return;
  const safe = Math.max(0, Math.floor(tokens || 0));
  const win = Math.max(1024, Number(getContextWindowTokens()) || DEFAULT_CONTEXT_WINDOW_TOKENS);
  const pct = Math.min(100, (safe / win) * 100);
  if (ctxRing) ctxRing.style.setProperty("--p", pct.toFixed(2));
  if (ctxPct) ctxPct.textContent = `${Math.round(pct)}%`;
  ctxText.textContent = `${safe.toLocaleString("zh-CN")} / ${formatContextWindowLabel(win)} tokens`;
}

function refreshContextMeter(extraInput = "") { paintContextMeter(computeContextTokens(extraInput)); }
setRefreshContextMeter(refreshContextMeter);

function updateContextByUsage(usage) {
  if (!ctxText || !usage || typeof usage.total_tokens !== "number") { refreshContextMeter(); return; }
  paintContextMeter(usage.total_tokens);
}

// ── Markdown 渲染 ──
const markdownEngine = window.marked;
const codeHighlighter = window.hljs;
if (markdownEngine?.use) markdownEngine.use({ breaks: true, gfm: true });

function renderRichContent(element, text) {
  if (!element) return;
  const source = String(text || "");
  if (markdownEngine?.parse) {
    element.innerHTML = markdownEngine.parse(source);
  } else {
    element.textContent = source;
  }
  if (typeof window.renderMathInElement === "function") {
    window.renderMathInElement(element, {
      delimiters: [
        { left: "$$", right: "$$", display: true }, { left: "\\[", right: "\\]", display: true },
        { left: "$", right: "$", display: false }, { left: "\\(", right: "\\)", display: false },
      ],
      throwOnError: false,
      ignoredTags: ["script", "noscript", "style", "textarea", "pre", "code"],
    });
  }
  if (codeHighlighter?.highlightElement) {
    element.querySelectorAll("pre code").forEach((el) => codeHighlighter.highlightElement(el));
  }
}

// ── 消息 & 头像 ──
function applyUserIdentityToAvatar(avatarEl, role) {
  if (!avatarEl || role !== "user") return;
  const nickname = getUserNickname(), avatarUrl = getUserAvatar();
  avatarEl.title = nickname;
  if (avatarUrl) {
    Object.assign(avatarEl.style, { backgroundImage: `url("${avatarUrl}")`, backgroundSize: "cover", backgroundPosition: "center", fontSize: "0" });
    avatarEl.textContent = "";
    return;
  }
  Object.assign(avatarEl.style, { backgroundImage: "none", background: "linear-gradient(160deg, #b2cdf7, #7fa8ed)", color: "#fff", fontSize: "15px", fontWeight: "700" });
  avatarEl.textContent = nickname.slice(0, 1) || "你";
}

function refreshUserAvatarsInFeed() {
  chatFeed?.querySelectorAll(".msg.user-msg .msg-avatar").forEach((el) => applyUserIdentityToAvatar(el, "user"));
}

function appendMsg(text, options = {}) {
  const { role = "assistant", thinking = false, isError = false } = options;
  const article = document.createElement("article");
  article.className = "msg";
  const isUser = role === "user";
  if (isUser) article.classList.add("user-msg");
  const avatar = document.createElement("div");
  avatar.className = `msg-avatar ${isUser ? "user" : "ai"}`;
  avatar.textContent = isUser ? "你" : "";
  applyUserIdentityToAvatar(avatar, role);
  const body = document.createElement("div");
  body.className = "msg-body";
  if (isError) body.classList.add("error-box");
  if (thinking) {
    body.innerHTML = '<div class="skeleton" id="current-thinking"><div class="skeleton-bar"></div><div class="skeleton-bar"></div><div class="skeleton-bar"></div></div>';
  } else { renderRichContent(body, text); }
  article.append(avatar, body);
  chatFeed.appendChild(article);
  chatFeed.scrollTop = chatFeed.scrollHeight;
  return { article, body };
}

// ── 笔记 ──
function renderDraftPreview() {
  if (!draftPreview || !draftInput) return;
  const source = String(draftInput.value || "").trim();
  if (!source) { draftPreview.innerHTML = '<p class="draft-empty">夏彦回答后会自动生成笔记...</p>'; return; }
  renderRichContent(draftPreview, source);
}
function setDraftEditMode(editing) { draftBox?.classList.toggle("draft-editing", !!editing); }

function exportDraftAsMarkdown() {
  if (!draftInput) return;
  const content = draftInput.value.trim();
  if (!content) { showModeTip("笔记为空，暂无可导出内容"); return; }
  const now = new Date();
  const stamp = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}_${String(now.getHours()).padStart(2, "0")}${String(now.getMinutes()).padStart(2, "0")}`;
  const blob = new Blob([`# 学习笔记\n\n导出时间：${formatTime()}\n\n---\n\n${content}\n\n---\n💗 由 Study With Xiayan 生成`], { type: "text/markdown;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = `study-note_${stamp}.md`;
  document.body.appendChild(a); a.click(); a.remove();
  URL.revokeObjectURL(url);
  showModeTip("已导出 Markdown 笔记");
}

// ── 会话管理 UI ──
function createSession(initialTitle = "新的对话") {
  const sessions = getStoredSessions();
  const session = { id: buildSessionId(), title: initialTitle, createdAt: formatTime(), updatedAt: formatTime(), messages: [] };
  sessions.push(session);
  saveSessions(sessions);
  setCurrentSessionId(session.id);
  renderHistoryList();
  return session;
}

function sessionHasUserInput(session) {
  return !!session?.messages?.some((item) => item?.role === "user" && String(item?.text || "").trim());
}

function removeSessionById(sessionId) {
  const sessions = getStoredSessions();
  const target = sessions.find((item) => item.id === sessionId);
  if (!target) return false;
  const remaining = sessions.filter((item) => item.id !== sessionId);
  saveSessions(remaining);
  if (sessionId === getCurrentSessionIdValue()) {
    if (remaining.length) {
      const latest = remaining.slice().sort((a, b) => getSessionSortTimestamp(b) - getSessionSortTimestamp(a))[0];
      setCurrentSessionId(latest.id);
    } else {
      setCurrentSessionId("");
    }
  }
  return true;
}

function cleanupSessionIfNoUserInput(sessionId) {
  const session = getStoredSessions().find((item) => item.id === sessionId);
  if (!session || sessionHasUserInput(session)) return false;
  return removeSessionById(sessionId);
}

function cleanupAllSessionsWithoutUserInput() {
  const sessions = getStoredSessions();
  if (!sessions.length) return;
  const activeId = getCurrentSessionIdValue() || getActiveSessionId();
  const remaining = sessions.filter((item) => sessionHasUserInput(item));
  if (remaining.length === sessions.length) return;
  saveSessions(remaining);
  if (!activeId) return;
  const activeStillExists = remaining.some((item) => item.id === activeId);
  if (activeStillExists) {
    setCurrentSessionId(activeId);
    return;
  }
  const latest = remaining.slice().sort((a, b) => getSessionSortTimestamp(b) - getSessionSortTimestamp(a))[0];
  setCurrentSessionId(latest?.id || "");
}

function getCurrentSession(createIfMissing = true) {
  const sessions = getStoredSessions();
  const cid = getCurrentSessionIdValue();
  if (cid) { const s = sessions.find((i) => i.id === cid); if (s) return s; }
  const aid = getActiveSessionId();
  if (aid) { const s = sessions.find((i) => i.id === aid); if (s) { setCurrentSessionId(s.id); return s; } }
  if (sessions.length) {
    const latest = sessions.slice().sort((a, b) => getSessionSortTimestamp(b) - getSessionSortTimestamp(a))[0];
    setCurrentSessionId(latest.id); return latest;
  }
  if (!createIfMissing) return null;
  return createSession();
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
  const session = getStoredSessions().find((i) => i.id === sessionId);
  if (!session || session.messages.length < 2 || (session.title && session.title !== "新的对话")) return;
  const sample = session.messages.slice(0, 6).map((i) => `${i.role === "user" ? "用户" : "AI"}：${i.text}`).join("\n");
  let title = "";
  try {
    const stream = callModelStream(
      [{ role: "system", content: "请把对话总结成一个简短标题，只输出标题本身，不超过18个中文字符，不要标点和引号。" }, { role: "user", content: sample }],
      getConfiguredModeModel("fast"), { modeOverride: "fast" },
    );
    for await (const chunk of stream) { if (chunk.content) title += chunk.content; }
  } catch (e) { console.warn("[summarizeSessionTitle]", e); }
  title = title.replace(/[\n\r"'""'']/g, "").trim();
  if (!title) title = (session.messages.find((i) => i.role === "user")?.text || "新的对话").slice(0, 18);
  updateSession(sessionId, (item) => { item.title = title.slice(0, 18) || "新的对话"; return item; });
  renderHistoryList();
}

function loadSession(sessionId) {
  const previousSessionId = getCurrentSessionIdValue();
  if (previousSessionId && previousSessionId !== sessionId) cleanupSessionIfNoUserInput(previousSessionId);
  const session = getStoredSessions().find((i) => i.id === sessionId);
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
  const session = getStoredSessions().find((i) => i.id === sessionId);
  if (!session) return;
  const next = window.prompt("重命名对话", session.title || "新的对话");
  if (next === null) return;
  const final = next.trim().slice(0, 24);
  if (!final) { showModeTip("名称不能为空"); return; }
  updateSession(sessionId, (item) => { item.title = final; item.updatedAt = formatTime(); return item; });
  renderHistoryList();
  showModeTip("已重命名");
}

function deleteSession(sessionId) {
  const sessions = getStoredSessions();
  const target = sessions.find((i) => i.id === sessionId);
  if (!target || !window.confirm(`确认删除"${target.title || "新的对话"}"吗？`)) return;
  const remaining = sessions.filter((i) => i.id !== sessionId);
  saveSessions(remaining);
  if (sessionId !== getCurrentSessionIdValue()) { renderHistoryList(); showModeTip("已删除对话"); return; }
  if (remaining.length) {
    const latest = remaining.slice().sort((a, b) => getSessionSortTimestamp(b) - getSessionSortTimestamp(a))[0];
    loadSession(latest.id); showModeTip("已删除对话"); return;
  }
  chatFeed.innerHTML = ""; clearPreview();
  const ns = createSession("新的对话"); loadSession(ns.id); initGreeting(); showModeTip("已删除对话");
}

// ── 历史列表（含搜索） ──
function renderHistoryList(filter = "") {
  if (!historyList) return;
  const sessions = getStoredSessions();
  const keyword = filter.trim().toLowerCase();
  const filtered = keyword
    ? sessions.filter((s) => s.title.toLowerCase().includes(keyword) || s.messages.some((m) => m.text.toLowerCase().includes(keyword)))
    : sessions;
  historyList.innerHTML = "";
  if (!filtered.length) {
    const empty = document.createElement("div");
    empty.className = "history-empty";
    empty.textContent = keyword ? "没有找到匹配的对话" : "还没有记录，开始一段新对话吧。";
    historyList.appendChild(empty); return;
  }
  filtered.slice().sort((a, b) => getSessionSortTimestamp(b) - getSessionSortTimestamp(a)).forEach((item) => {
    const row = document.createElement("div");
    row.className = "history-item";
    row.setAttribute("role", "button"); row.setAttribute("aria-label", `对话：${item.title}`); row.tabIndex = 0;
    if (item.id === getCurrentSessionIdValue()) row.classList.add("active");
    const meta = document.createElement("div"); meta.className = "history-meta";
    meta.textContent = `${item.updatedAt || item.createdAt} · ${item.messages.length} 条`;
    const title = document.createElement("div"); title.className = "history-title"; title.textContent = item.title || "新的对话";
    const preview = document.createElement("div"); preview.className = "history-text";
    preview.textContent = item.messages[item.messages.length - 1]?.text || "";
    const actions = document.createElement("div"); actions.className = "history-actions";
    const renameBtn = document.createElement("button");
    renameBtn.type = "button"; renameBtn.className = "history-action-btn"; renameBtn.title = "重命名";
    renameBtn.setAttribute("aria-label", "重命名对话");
    renameBtn.innerHTML = '<i class="fa-solid fa-pen"></i>';
    renameBtn.addEventListener("click", (e) => { e.stopPropagation(); renameSession(item.id); });
    const deleteBtn = document.createElement("button");
    deleteBtn.type = "button"; deleteBtn.className = "history-action-btn danger"; deleteBtn.title = "删除";
    deleteBtn.setAttribute("aria-label", "删除对话");
    deleteBtn.innerHTML = '<i class="fa-solid fa-trash"></i>';
    deleteBtn.addEventListener("click", (e) => { e.stopPropagation(); deleteSession(item.id); });
    actions.append(renameBtn, deleteBtn);
    row.append(meta, title, preview, actions);
    row.addEventListener("click", () => loadSession(item.id));
    row.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); loadSession(item.id); } });
    historyList.appendChild(row);
  });
}

// ── 侧边栏 ──
function setSidebarOpen(open) {
  if (!sidebarOverlay) return;
  const isShown = sidebarOverlay.classList.contains("show");
  if (open && isShown && !sidebarCloseTimer) return;
  if (!open && !isShown) return;
  if (sidebarCloseTimer) { clearTimeout(sidebarCloseTimer); sidebarCloseTimer = null; }
  const canAnimate = !!sidebarDrawer && typeof sidebarOverlay.animate === "function" && typeof sidebarDrawer.animate === "function";
  if (!canAnimate) {
    sidebarOverlay.classList.toggle("show", open);
    sidebarOverlay.setAttribute("aria-hidden", open ? "false" : "true"); return;
  }
  if (open) {
    sidebarOverlay.classList.add("show"); sidebarOverlay.setAttribute("aria-hidden", "false");
    sidebarOverlay.animate([{ opacity: 0 }, { opacity: 1 }], { duration: SIDEBAR_ANIM_DURATION, easing: "ease" });
    sidebarDrawer.animate([{ transform: "translateX(-100px)", opacity: 0 }, { transform: "translateX(0)", opacity: 1 }], { duration: SIDEBAR_ANIM_DURATION, easing: "cubic-bezier(0.22, 1, 0.36, 1)" });
    return;
  }
  sidebarOverlay.setAttribute("aria-hidden", "true");
  sidebarOverlay.animate([{ opacity: 1 }, { opacity: 0 }], { duration: SIDEBAR_ANIM_DURATION, easing: "ease" });
  sidebarDrawer.animate([{ transform: "translateX(0)", opacity: 1 }, { transform: "translateX(-80px)", opacity: 0 }], { duration: SIDEBAR_ANIM_DURATION, easing: "cubic-bezier(0.4, 0, 1, 1)" });
  sidebarCloseTimer = setTimeout(() => { sidebarOverlay.classList.remove("show"); sidebarCloseTimer = null; }, SIDEBAR_ANIM_DURATION);
}

// ── 设置面板 ──
function setSettingsModalOpen(open) {
  if (!settingsModal) return;
  settingsModal.classList.toggle("show", open);
  settingsModal.setAttribute("aria-hidden", open ? "false" : "true");
}


const MAX_AVATAR_STORAGE_SIZE = 350 * 1024;

function estimateBase64Bytes(dataUrl = "") {
  const base64Part = String(dataUrl).split(",")[1] || "";
  const padding = (base64Part.match(/=+$/)?.[0].length || 0);
  return Math.max(0, Math.floor((base64Part.length * 3) / 4) - padding);
}

function loadImageElement(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("image load failed"));
    img.src = src;
  });
}

async function compressAvatarDataUrl(dataUrl) {
  if (!dataUrl || !dataUrl.startsWith("data:image/")) return dataUrl;
  const image = await loadImageElement(dataUrl);
  const maxSide = 512;
  const scale = Math.min(1, maxSide / Math.max(image.width, image.height));
  const width = Math.max(1, Math.round(image.width * scale));
  const height = Math.max(1, Math.round(image.height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return dataUrl;
  ctx.drawImage(image, 0, 0, width, height);

  let quality = 0.88;
  let nextDataUrl = canvas.toDataURL("image/webp", quality);
  while (estimateBase64Bytes(nextDataUrl) > MAX_AVATAR_STORAGE_SIZE && quality > 0.52) {
    quality -= 0.08;
    nextDataUrl = canvas.toDataURL("image/webp", quality);
  }
  if (estimateBase64Bytes(nextDataUrl) > MAX_AVATAR_STORAGE_SIZE) {
    return canvas.toDataURL("image/jpeg", 0.68);
  }
  return nextDataUrl;
}

function renderSettingsAvatarPreview(avatarUrl = getUserAvatar()) {
  const nextUrl = String(avatarUrl || "").trim();
  if (settingsAvatarPreview) settingsAvatarPreview.src = nextUrl || "assets/img/user_avatar.png";
  if (clearAvatarBtn) clearAvatarBtn.hidden = !nextUrl;
}

function openSettingsPanel() {
  const provider = getProvider();
  apiKeyInput.value = getUserApiKey();
  if (providerSelect) providerSelect.value = provider;
  if (baseUrlInput) baseUrlInput.value = provider === "custom" ? getProviderBaseUrl("custom") : "";
  if (fastModelInput) fastModelInput.value = getConfiguredModeModel("fast");
  if (thinkingModelInput) thinkingModelInput.value = getConfiguredModeModel("thinking");
  if (nicknameInput) nicknameInput.value = getUserNickname();
  const av = getUserAvatar();
  if (avatarUrlInput) avatarUrlInput.value = av;
  renderSettingsAvatarPreview(av);
  setSettingsModalOpen(true);
  setTimeout(() => apiKeyInput?.focus(), 50);
}

// ── 移动端标签 ──
function setActiveMobileTab(tab) {
  if (!mobileTabButtons.length) return;
  mobileTabButtons.forEach((btn) => btn.classList.toggle("active", btn.dataset.tab === tab));
}
function scrollToTabSection(tab) {
  if (tab === "chat") { chatFeed?.scrollTo({ top: chatFeed.scrollHeight, behavior: "smooth" }); chatPanel?.scrollIntoView({ behavior: "smooth", block: "start" }); return; }
  if (tab === "question") { questionCard?.scrollIntoView({ behavior: "smooth", block: "start" }); return; }
  if (tab === "draft") draftPanel?.scrollIntoView({ behavior: "smooth", block: "start" });
}
function updateScrollBottomBtnVisibility() {
  if (!scrollBottomBtn || !chatFeed) return;
  const dist = chatFeed.scrollHeight - chatFeed.clientHeight - chatFeed.scrollTop;
  scrollBottomBtn.style.opacity = dist < 80 ? "0" : "1";
  scrollBottomBtn.style.pointerEvents = dist < 80 ? "none" : "auto";
}

// ── 模式切换 ──
function setMode(mode) {
  setCurrentMode(mode);
  modeButtons.forEach((btn) => btn.classList.toggle("active", btn.dataset.mode === mode));
  triggerContextWindowRefresh(mode);
}

function syncModelWithMode() { return getConfiguredModeModel(getCurrentMode()); }

// ── 图片压缩 ──
function compressImage(file, maxWidth = 1920, quality = 0.8) {
  return new Promise((resolve) => {
    if (file.size <= 1024 * 1024) { resolve(file); return; }
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, maxWidth / img.width);
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(img.width * scale);
      canvas.height = Math.round(img.height * scale);
      canvas.getContext("2d").drawImage(img, 0, 0, canvas.width, canvas.height);
      canvas.toBlob((blob) => {
        URL.revokeObjectURL(img.src);
        resolve(blob && blob.size < file.size ? new File([blob], file.name, { type: "image/jpeg" }) : file);
      }, "image/jpeg", quality);
    };
    img.onerror = () => { URL.revokeObjectURL(img.src); resolve(file); };
    img.src = URL.createObjectURL(file);
  });
}

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("图片读取失败，请重试。"));
    reader.readAsDataURL(file);
  });
}

function openImageLightbox() {
  const src = previewImg.getAttribute("src");
  if (!src) return;
  lightboxImg.src = src;
  imageLightbox.classList.add("show");
  imageLightbox.setAttribute("aria-hidden", "false");
  document.body.style.overflow = "hidden";
}

function closeImageLightbox() {
  imageLightbox.classList.remove("show");
  imageLightbox.setAttribute("aria-hidden", "true");
  lightboxImg.removeAttribute("src");
  document.body.style.overflow = "";
}

function clearPreview(resetConversation = true) {
  uploaded = null; uploadedDataUrl = "";
  closeImageLightbox();
  if (previewObjectUrl) { URL.revokeObjectURL(previewObjectUrl); previewObjectUrl = ""; }
  previewImg.style.display = "none"; previewImg.removeAttribute("src");
  placeholder.style.display = "block";
  characterBubble.textContent = "把题目发给我，我会先给你结论，再一步一步解释为什么这样做。";
  if (resetConversation) conversation.length = 0;
  refreshContextMeter();
}

// ── 流式打字渲染 ──
async function streamToElement(msgBody, stream) {
  let fullText = "", displayedText = "", lastUsage = null;
  const filter = createAssistantContentFilter();
  for await (const chunk of stream) {
    const vis = filter(chunk.content);
    if (!vis) { if (chunk.usage) lastUsage = chunk.usage; continue; }
    if (fullText === "") { msgBody.innerHTML = ""; msgBody.classList.add("typing-active"); }
    fullText += vis;
    while (displayedText.length < fullText.length) {
      const gap = fullText.length - displayedText.length;
      const step = gap > 30 ? Math.ceil(gap / 5) : 1;
      displayedText = fullText.substring(0, displayedText.length + step);
      if (markdownEngine?.parse) msgBody.innerHTML = markdownEngine.parse(displayedText);
      else msgBody.textContent = displayedText;
      chatFeed.scrollTop = chatFeed.scrollHeight;
      if (gap < 50) await new Promise((r) => setTimeout(r, 15));
    }
    if (chunk.usage) lastUsage = chunk.usage;
  }
  msgBody.classList.remove("typing-active");
  renderRichContent(msgBody, fullText);
  return { fullText, lastUsage };
}

// ── 笔记摘要 ──
async function summarizeToDraft(question, answer) {
  if (!draftInput || !answer?.trim()) return;
  try {
    const filter = createAssistantContentFilter();
    let summaryText = "";
    const stream = callModelStream(
      [{ role: "system", content: "你是学习笔记整理助手。请把问答整理成简洁笔记，不要<think>标签。结构：题目要点、核心思路、关键步骤、易错点。" },
       { role: "user", content: `问题：\n${question}\n\n回答：\n${answer}\n\n请整理为可直接抄写的学习笔记。` }],
      getConfiguredModeModel("fast"), { modeOverride: "fast" },
    );
    for await (const chunk of stream) { const v = filter(chunk.content); if (v) summaryText += v; }
    const note = summaryText.trim();
    if (!note) return;
    draftInput.value = draftInput.value.trim() ? `${draftInput.value.trim()}\n\n——\n${note}` : note;
    draftInput.scrollTop = draftInput.scrollHeight;
    renderDraftPreview();
  } catch (e) { console.error("[summarizeToDraft]", e); }
}

// ── 初始问候 ──
async function initGreeting() {
  if (!getCurrentSession(false)) createSession("日常对话");
  await systemPromptReady;
  const { body: msgBody } = appendMsg("", { thinking: true });
  try {
    const messages = [
      { role: "system", content: getSystemPrompt() },
      { role: "user", content: `你正在给华生发消息，华生昵称是"${getGreetingTargetName()}"。请自然地向 TA 打个招呼，并优先使用这个昵称称呼。记得保持你的性格特点，不要输出Markdown，不要解释设定，不要说明 Prompt，也不要用括号表示动作或表情，更不要代入场景，尽量简短，减少Token消耗。` },
    ];
    const { fullText } = await streamToElement(msgBody, callModelStream(messages));
    conversation.push({ role: "assistant", content: fullText });
    appendSessionMessage("assistant", fullText);
  } catch (e) {
    console.error("[initGreeting]", e);
    showModeTip("初始化失败");
    msgBody.classList.add("error-box");
    msgBody.innerHTML = "嘿，华生，你来啦！刚才信号好像有点不稳定……（初始化失败）";
  }
}

// ── 图片上传处理（含压缩） ──
async function handleImageFileSelection(file) {
  if (!file) return;
  if (!file.type.startsWith("image/")) { showModeTip("只支持图片文件，请重新选择。"); return; }
  if (file.size > 8 * 1024 * 1024) { showModeTip("图片请控制在 8MB 以内，避免上传失败。"); return; }

  const compressed = await compressImage(file);
  uploaded = compressed;
  conversation.length = 0;
  createSession("图片题目讲解");

  if (previewObjectUrl) URL.revokeObjectURL(previewObjectUrl);
  previewObjectUrl = URL.createObjectURL(compressed);
  previewImg.src = previewObjectUrl;
  previewImg.style.display = "block";
  placeholder.style.display = "none";

  try { uploadedDataUrl = await fileToDataUrl(compressed); }
  catch (error) { clearPreview(false); appendMsg(error.message, { isError: true }); return; }

  timeTip.textContent = formatTime();
  showModeTip(`收到你的题目：${file.name}。你可以点"讲解"，我会给你完整思路。`);
  explainBtn.classList.add("btn-pulse");
  setActiveMobileTab("question");
  questionCard?.scrollIntoView({ behavior: "smooth", block: "start" });
  refreshContextMeter();
}

// ══════════════════════════════════════
// ── 事件绑定 ──
// ══════════════════════════════════════

pickBtn.addEventListener("click", () => fileInput.click());
cameraBtn?.addEventListener("click", () => cameraInput?.click());

fileInput.addEventListener("change", async (e) => {
  await handleImageFileSelection(e.target.files?.[0]);
  fileInput.value = "";
});
cameraInput?.addEventListener("change", async (e) => {
  await handleImageFileSelection(e.target.files?.[0]);
  cameraInput.value = "";
});

previewImg.addEventListener("click", openImageLightbox);
imageLightboxClose?.addEventListener("click", closeImageLightbox);
imageLightbox?.addEventListener("click", (e) => {
  if (e.target === imageLightbox) closeImageLightbox();
});
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && imageLightbox?.classList.contains("show")) closeImageLightbox();
});

clearBtn.addEventListener("click", () => {
  clearPreview(); explainBtn.classList.remove("btn-pulse"); fileInput.value = "";
  showModeTip("题目已清空。重新上传后会继续讲解。"); setActiveMobileTab("question");
});

// ── 讲解 ──
explainBtn.addEventListener("click", async () => {
  if (!uploaded) { showModeTip("请先上传题目图片才能开始讲解。"); return; }
  if (!uploadedDataUrl) { showModeTip("图片尚未就绪，请重新上传后再试。"); return; }
  if (isBusy) return;

  explainBtn.classList.remove("btn-pulse");
  appendSessionMessage("user", "请讲解我上传的题目图片");
  const { body: msgBody, article: thinkingMsg } = appendMsg("正在思考...", { thinking: true });
  setBusy(true);
  try {
    await systemPromptReady;
    const modePrompt = MODE_INSTRUCTIONS[getCurrentMode()];
    const userPrompt = `${modePrompt}\n${PERSONA_REINFORCEMENT}\n请讲解这道题。先给最终结论，再给完整步骤推导（分点编号），最后给易错点和检查方法。`;
    const messages = [
      { role: "system", content: getSystemPrompt() }, ...conversation,
      { role: "user", content: [{ type: "text", text: userPrompt }, { type: "image_url", image_url: { url: uploadedDataUrl } }] },
    ];
    const { fullText, lastUsage } = await streamToElement(msgBody, callModelStream(messages));
    appendSessionMessage("assistant", fullText);
    summarizeSessionTitle(getCurrentSessionIdValue());
    conversation.push({ role: "user", content: "我上传了一道题目图片，请你完整讲解。" });
    conversation.push({ role: "assistant", content: fullText });
    await summarizeToDraft("我上传了一道题目图片，请你完整讲解。", fullText);
    updateCharacterBubble("讲解完成。你可以继续追问『为什么这么做』。");
    if (lastUsage) updateContextByUsage(lastUsage);
  } catch (error) {
    console.error("[explainBtn]", error);
    thinkingMsg.remove();
    appendMsg(`讲解失败：${error.message}`, { isError: true });
  } finally { setBusy(false); }
});

// ── 追问 ──
askForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const q = askInput.value.trim();
  if (!q || isBusy) return;

  appendMsg(q, { role: "user" });
  appendSessionMessage("user", q);
  askInput.value = ""; askInput.style.height = "auto";
  refreshContextMeter(); setBusy(true);
  setActiveMobileTab("chat"); scrollToTabSection("chat");

  await sleep(500);
  const { body: msgBody, article: thinkingMsg } = appendMsg("正在思考...", { thinking: true });
  try {
    await systemPromptReady;
    const modePrompt = MODE_INSTRUCTIONS[getCurrentMode()];
    const fullQuery = `${modePrompt}\n${PERSONA_REINFORCEMENT}\n${q}`;
    const messages = [{ role: "system", content: getSystemPrompt() }, ...conversation, { role: "user", content: fullQuery }];
    const { fullText, lastUsage } = await streamToElement(msgBody, callModelStream(messages));
    appendSessionMessage("assistant", fullText);
    summarizeSessionTitle(getCurrentSessionIdValue());
    conversation.push({ role: "user", content: q });
    conversation.push({ role: "assistant", content: fullText });
    await summarizeToDraft(q, fullText);
    if (lastUsage) updateContextByUsage(lastUsage);
  } catch (error) {
    console.error("[askForm]", error);
    if (thinkingMsg) thinkingMsg.remove();
    appendMsg(`追问失败：${error.message}`, { isError: true });
  } finally { setBusy(false); }
});

// ── 侧边栏 & 设置事件 ──
moreBtn?.addEventListener("click", () => setSidebarOpen(true));
sidebarCloseBtn?.addEventListener("click", () => setSidebarOpen(false));
sidebarOverlay?.addEventListener("click", (e) => { if (e.target === sidebarOverlay) setSidebarOpen(false); });
scrollBottomBtn?.addEventListener("click", () => chatFeed?.scrollTo({ top: chatFeed.scrollHeight, behavior: "smooth" }));
chatFeed?.addEventListener("scroll", updateScrollBottomBtnVisibility);

mobileTabButtons.forEach((btn) => {
  btn.addEventListener("click", () => {
    const tab = btn.dataset.tab;
    if (!tab) return;
    if (tab === "settings") { setSidebarOpen(true); setActiveMobileTab("settings"); return; }
    setSidebarOpen(false); setActiveMobileTab(tab); scrollToTabSection(tab);
  });
});

openSettingsBtn?.addEventListener("click", () => { setSidebarOpen(false); openSettingsPanel(); });

clearHistoryBtn?.addEventListener("click", () => {
  try {
    clearPreview(); explainBtn.classList.remove("btn-pulse"); fileInput.value = "";
    const session = createSession("新的对话"); loadSession(session.id); initGreeting();
    showModeTip("已创建新对话");
  } catch (e) { console.error("[clearHistoryBtn]", e); showModeTip("创建失败"); }
});

// ── 历史搜索 ──
historySearchInput?.addEventListener("input", () => renderHistoryList(historySearchInput.value));

closeSettingsBtn?.addEventListener("click", () => setSettingsModalOpen(false));
settingsModal?.addEventListener("click", (e) => { if (e.target === settingsModal) setSettingsModalOpen(false); });

providerSelect?.addEventListener("change", () => {
  const provider = providerSelect.value || "native_gemini";
  if (baseUrlInput) baseUrlInput.value = provider === "custom" ? getProviderBaseUrl("custom") : "";
  if (provider === "proxy") {
    if (fastModelInput) fastModelInput.value = getProxyModelByMode("fast");
    if (thinkingModelInput) thinkingModelInput.value = getProxyModelByMode("thinking");
    triggerContextWindowRefresh(getCurrentMode()); return;
  }
  if (provider === "native_gemini") {
    if (fastModelInput) fastModelInput.value = "gemini-3-flash-preview-nothinking";
    if (thinkingModelInput) thinkingModelInput.value = "gemini-3.1-pro-preview";
  } else if (provider === "native_claude") {
    if (fastModelInput) fastModelInput.value = "claude-opus-4-6";
    if (thinkingModelInput) thinkingModelInput.value = "claude-opus-4-6-thinking";
  } else if (provider === "deepseek" || provider === "native_deepseek") {
    if (fastModelInput) fastModelInput.value = "deepseek-chat";
    if (thinkingModelInput) thinkingModelInput.value = "deepseek-reasoner";
  }
  triggerContextWindowRefresh(getCurrentMode());
});

saveApiKeyBtn?.addEventListener("click", async () => {
  const key = apiKeyInput.value.trim();
  try {
    const provider = providerSelect?.value || "native_gemini";
    localStorage.setItem(PROVIDER_STORAGE, provider);
    if (key) localStorage.setItem(USER_API_KEY_STORAGE, key);
    if (provider === "custom") localStorage.setItem(BASE_URL_STORAGE, (baseUrlInput?.value || "").trim());
    else localStorage.removeItem(BASE_URL_STORAGE);
    let fm = fastModelInput?.value.trim() || getDefaultModelForProvider(provider, "fast");
    let tm = thinkingModelInput?.value.trim() || getDefaultModelForProvider(provider, "thinking");
    if (provider === "proxy") {
      if (!MODEL_CONFIGS[fm]) fm = getProxyModelByMode("fast");
      if (!MODEL_CONFIGS[tm]) tm = getProxyModelByMode("thinking");
    }
    setConfiguredModeModel("fast", fm); setConfiguredModeModel("thinking", tm);
    const nickname = (nicknameInput?.value || "").trim() || "你";
    const avatarUrl = (avatarUrlInput?.value || "").trim();
    localStorage.setItem(USER_NICKNAME_STORAGE, nickname);
    if (avatarUrl) {
      let avatarToStore = avatarUrl;
      if (avatarToStore.startsWith("data:image/") && estimateBase64Bytes(avatarToStore) > MAX_AVATAR_STORAGE_SIZE) {
        avatarToStore = await compressAvatarDataUrl(avatarToStore);
      }
      localStorage.setItem(USER_AVATAR_STORAGE, avatarToStore);
      if (avatarUrlInput) avatarUrlInput.value = avatarToStore;
      renderSettingsAvatarPreview(avatarToStore);
    } else {
      localStorage.removeItem(USER_AVATAR_STORAGE);
      renderSettingsAvatarPreview("");
    }
    refreshUserAvatarsInFeed();
    triggerContextWindowRefresh(getCurrentMode());
    showModeTip("设置已保存");
    setSettingsModalOpen(false);
  } catch (e) {
    console.error("[saveApiKeyBtn] 保存设置失败", e);
    showModeTip("保存失败：浏览器禁止了本地存储");
  }
});

clearApiKeyBtn?.addEventListener("click", () => {
  try {
    [USER_API_KEY_STORAGE, PROVIDER_STORAGE, BASE_URL_STORAGE, USER_NICKNAME_STORAGE, USER_AVATAR_STORAGE].forEach((k) => localStorage.removeItem(k));
    apiKeyInput.value = "";
    if (providerSelect) providerSelect.value = "native_gemini";
    if (baseUrlInput) baseUrlInput.value = "";
    if (fastModelInput) fastModelInput.value = getDefaultModelForProvider("native_gemini", "fast");
    if (thinkingModelInput) thinkingModelInput.value = getDefaultModelForProvider("native_gemini", "thinking");
    if (nicknameInput) nicknameInput.value = "你";
    if (avatarUrlInput) avatarUrlInput.value = "";
    renderSettingsAvatarPreview(""); refreshUserAvatarsInFeed();
    triggerContextWindowRefresh(getCurrentMode());
    showModeTip("已清除并恢复默认模型");
  } catch (e) { console.error("[clearApiKeyBtn]", e); showModeTip("清除失败"); }
});

resetDefaultModelsBtn?.addEventListener("click", () => {
  try {
    const provider = "native_gemini";
    localStorage.setItem(PROVIDER_STORAGE, provider); localStorage.removeItem(BASE_URL_STORAGE);
    const fm = getDefaultModelForProvider(provider, "fast"), tm = getDefaultModelForProvider(provider, "thinking");
    setConfiguredModeModel("fast", fm); setConfiguredModeModel("thinking", tm);
    if (providerSelect) providerSelect.value = provider;
    if (baseUrlInput) baseUrlInput.value = "";
    if (fastModelInput) fastModelInput.value = fm;
    if (thinkingModelInput) thinkingModelInput.value = tm;
    triggerContextWindowRefresh(getCurrentMode());
    showModeTip("已恢复默认：Gemini");
  } catch (e) { console.error("[resetDefaultModelsBtn]", e); showModeTip("恢复默认失败"); }
});

uploadAvatarBtn?.addEventListener("click", () => avatarFileInput?.click());
avatarFileInput?.addEventListener("change", async (e) => {
  const file = e.target.files?.[0];
  if (!file) return;
  if (!file.type.startsWith("image/")) { showModeTip("请选择图片文件"); avatarFileInput.value = ""; return; }
  if (file.size > 2 * 1024 * 1024) { showModeTip("头像请控制在 2MB 以内"); avatarFileInput.value = ""; return; }
  try {
    const dataUrl = await fileToDataUrl(file);
    const optimizedDataUrl = await compressAvatarDataUrl(dataUrl);
    if (avatarUrlInput) avatarUrlInput.value = optimizedDataUrl;
    renderSettingsAvatarPreview(optimizedDataUrl);
    if (optimizedDataUrl !== dataUrl) {
      showModeTip("头像已压缩优化，记得点击保存");
    } else {
      showModeTip("头像已就绪，记得点击保存");
    }
  } catch {
    showModeTip("头像读取失败");
  } finally {
    avatarFileInput.value = "";
  }
});
clearAvatarBtn?.addEventListener("click", () => {
  if (avatarUrlInput) avatarUrlInput.value = "";
  renderSettingsAvatarPreview(""); showModeTip("头像已清空，记得点击保存");
});

exportMdBtn?.addEventListener("click", exportDraftAsMarkdown);
draftPreview?.addEventListener("click", () => { setDraftEditMode(true); draftInput?.focus(); });
draftInput?.addEventListener("input", renderDraftPreview);
draftInput?.addEventListener("blur", () => setDraftEditMode(false));

// ── 键盘快捷键 ──
document.addEventListener("keydown", (e) => {
  // Esc: 关闭弹窗/侧边栏
  if (e.key === "Escape") {
    if (sidebarOverlay?.classList.contains("show")) { setSidebarOpen(false); return; }
    if (settingsModal?.classList.contains("show")) { setSettingsModalOpen(false); return; }
  }
  // Ctrl+Enter: 发送消息
  if ((e.ctrlKey || e.metaKey) && e.key === "Enter" && document.activeElement === askInput) {
    e.preventDefault(); askForm.requestSubmit(); return;
  }
  // Ctrl+K: 聚焦历史搜索
  if ((e.ctrlKey || e.metaKey) && e.key === "k") {
    e.preventDefault();
    if (!sidebarOverlay?.classList.contains("show")) setSidebarOpen(true);
    setTimeout(() => historySearchInput?.focus(), SIDEBAR_ANIM_DURATION + 50);
  }
});

modeSwitch?.addEventListener("click", (e) => {
  const btn = e.target.closest(".mode-btn");
  if (!btn) return;
  const mode = btn.dataset.mode;
  if (!mode || mode === getCurrentMode()) return;
  setMode(mode); refreshContextMeter(askInput?.value || "");
  if (mode === "thinking") {
    alert("来自作者的话:\n思考模式所使用的模型由于种种原因成本较高, 快速所使用的模型也不是那么不堪。如果不是要处理特别复杂的题目, 建议还是使用快速模式哦~");
  }
});

askInput?.addEventListener("input", () => {
  refreshContextMeter(askInput.value || "");
  askInput.style.height = "auto";
  askInput.style.height = `${Math.min(140, askInput.scrollHeight)}px`;
});
askInput?.addEventListener("focus", () => document.body.classList.add("keyboard-up"));
askInput?.addEventListener("blur", () => setTimeout(() => document.body.classList.remove("keyboard-up"), 100));
baseUrlInput?.addEventListener("input", () => { if ((providerSelect?.value || "") === "custom") triggerContextWindowRefresh(getCurrentMode()); });
fastModelInput?.addEventListener("input", () => { if (getCurrentMode() === "fast") triggerContextWindowRefresh("fast"); });
thinkingModelInput?.addEventListener("input", () => { if (getCurrentMode() === "thinking") triggerContextWindowRefresh("thinking"); });

// ══════════════════════════════════════
// ── 初始化 ──
// ══════════════════════════════════════
setMode("fast");
triggerContextWindowRefresh("fast");
timeTip.textContent = formatTime();

const initialSession = getCurrentSession(false);
if (initialSession) cleanupSessionIfNoUserInput(initialSession.id);
cleanupAllSessionsWithoutUserInput();
const newSession = createSession("新的对话");
loadSession(newSession.id);
initGreeting();

window.addEventListener("pagehide", () => {
  cleanupSessionIfNoUserInput(getCurrentSessionIdValue());
});

setActiveMobileTab("chat");
updateScrollBottomBtnVisibility();
refreshContextMeter();
setDraftEditMode(false);
renderDraftPreview();

const COMPLIANCE_AGREED_KEY = "xiayan_compliance_agreed_v1";
if (!localStorage.getItem(COMPLIANCE_AGREED_KEY)) {
  if (complianceModal) { complianceModal.classList.add("show"); complianceModal.removeAttribute("aria-hidden"); }
}
agreeComplianceBtn?.addEventListener("click", () => {
  localStorage.setItem(COMPLIANCE_AGREED_KEY, "true");
  complianceModal?.classList.remove("show");
  complianceModal?.setAttribute("aria-hidden", "true");
});
