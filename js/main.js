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
const timeTip = document.getElementById("timeTip");
const ctxBar = document.getElementById("ctxBar");
const ctxText = document.getElementById("ctxText");
const characterBubble = document.getElementById("characterBubble");
const askSubmitBtn = askForm.querySelector('button[type="submit"]');
const modeSwitch = document.getElementById("modeSwitch");
const modeButtons = Array.from(document.querySelectorAll(".mode-btn"));
const settingsBtn = document.getElementById("settingsBtn");
const settingsModal = document.getElementById("settingsModal");
const apiKeyInput = document.getElementById("apiKeyInput");
const saveApiKeyBtn = document.getElementById("saveApiKeyBtn");
const clearApiKeyBtn = document.getElementById("clearApiKeyBtn");
const closeSettingsBtn = document.getElementById("closeSettingsBtn");
const providerSelect = document.getElementById("providerSelect");
const baseUrlInput = document.getElementById("baseUrlInput");
const fastModelInput = document.getElementById("fastModelInput");
const thinkingModelInput = document.getElementById("thinkingModelInput");
const modeToast = document.createElement("div");
const USER_API_KEY_STORAGE = "moonshot_api_key";
const PROVIDER_STORAGE = "llm_provider";
const BASE_URL_STORAGE = "llm_base_url";
const FAST_MODEL_STORAGE = "fast_mode_model";
const THINKING_MODEL_STORAGE = "thinking_mode_model";
let currentMode = "fast";

modeToast.className = "mode-toast";
document.body.appendChild(modeToast);

marked.use({
  breaks: true,
  gfm: true,
});

const MODEL_CONFIGS = {
  "kimi-latest": {
    url: "https://api.xiayan.icu/kimi/v1/chat/completions?pwd=haitang000",
    model: "kimi-latest",
  },
  "kimi-2.5": {
    url: "https://api.xiayan.icu/kimi/v1/chat/completions?pwd=haitang000",
    model: "kimi-k2.5",
  },
  "moonshot-v1-32k": {
    url: "https://api.xiayan.icu/kimi/v1/chat/completions?pwd=haitang000",
    model: "moonshot-v1-8k",
  },
};

const MODE_INSTRUCTIONS = {
  fast: "【快速模式】请直接给出答案，保持简洁明了。",
  thinking: "【深度思考模式】请一步步思考，详细展示推导过程，并分析关键细节。",
};

const MODE_DEFAULT_MODEL = {
  fast: "moonshot-v1-32k-vision-preview",
  thinking: "kimi-2.5",
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
}

function getUserApiKey() {
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
    if (provider === "proxy") return MODEL_CONFIGS[val] ? val : defaultModel;
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
  } catch {}
}

function getProvider() {
  try {
    return localStorage.getItem(PROVIDER_STORAGE) || "proxy";
  } catch {
    return "proxy";
  }
}

function getDefaultModelForProvider(provider, mode) {
  const defaults = {
    proxy: MODE_DEFAULT_MODEL,
    native_deepseek: { fast: "deepseek-chat", thinking: "deepseek-reasoner" },
    moonshot: { fast: "moonshot-v1-8k", thinking: "moonshot-v1-32k" },
    openai: { fast: "gpt-4o-mini", thinking: "gpt-4.1" },
    deepseek: { fast: "deepseek-chat", thinking: "deepseek-reasoner" },
    siliconflow: { fast: "Qwen/Qwen2.5-7B-Instruct", thinking: "deepseek-ai/DeepSeek-R1" },
    custom: { fast: "gpt-4o-mini", thinking: "gpt-4.1" },
  };
  const map = defaults[provider] || defaults.proxy;
  return map[mode] || map.fast;
}

function getProviderBaseUrl(provider) {
  const map = {
    native_deepseek:
      "https://api.xiayan.icu/deepseek/v1/chat/completions?pwd=haitang000",
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

let toastTimer = null;
function showModeTip(text) {
  modeToast.textContent = text;
  modeToast.classList.add("show");
  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    modeToast.classList.remove("show");
  }, 1800);
}

function appendMsg(text, options = {}) {
  const { role = "assistant", thinking = false, isError = false } = options;
  const article = document.createElement("article");
  article.className = "msg";
  const avatar = document.createElement("div");
  const isUser = role === "user";
  if (isUser) article.classList.add("user-msg");
  avatar.className = `msg-avatar ${isUser ? "user" : "ai"}`;
  avatar.textContent = isUser ? "你" : "";
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
    body.innerHTML = marked.parse(text);
    body
      .querySelectorAll("pre code")
      .forEach((el) => hljs.highlightElement(el));
  }
  article.appendChild(avatar);
  article.appendChild(body);
  chatFeed.appendChild(article);
  chatFeed.scrollTop = chatFeed.scrollHeight;
  return { article, body };
}

function increaseContext() {
  if (!ctxBar || !ctxText) return;
  const current = parseFloat(ctxBar.style.width || "32");
  const next = Math.min(95, current + Math.random() * 8 + 2);
  ctxBar.style.width = `${next}%`;
  ctxText.textContent = `${(next * 0.4).toFixed(1)}k`;
}

function setBusy(state) {
  isBusy = state;
  pickBtn.disabled = state;
  explainBtn.disabled = state;
  askInput.disabled = state;
  askSubmitBtn.disabled = state;
}

function updateContextByUsage(usage) {
  if (!ctxBar || !ctxText) return;
  if (!usage || typeof usage.total_tokens !== "number") {
    increaseContext();
    return;
  }
  const total = usage.total_tokens;
  const pct = Math.max(32, Math.min(95, (total / 3000) * 100));
  ctxBar.style.width = `${pct}%`;
  ctxText.textContent = `${(total / 1000).toFixed(1)}k`;
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

async function* callModelStream(messages, configKey = syncModelWithMode()) {
  const provider = getProvider();
  const isProxy = provider === "proxy";
  const noAuthProviders = new Set(["proxy", "native_deepseek"]);
  const requiresApiKey = !noAuthProviders.has(provider);
  const config = MODEL_CONFIGS[configKey] || MODEL_CONFIGS[MODE_DEFAULT_MODEL.fast];
  const modelName = isProxy
    ? config.model
    : getConfiguredModeModel(currentMode);
  const userApiKey = getUserApiKey();
  const requestUrl = isProxy ? config.url : getProviderBaseUrl(provider);
  const payload = {
    model: modelName,
    messages,
    stream: true,
  };

  const headers = { "Content-Type": "application/json" };
  if (requiresApiKey && userApiKey) headers.Authorization = `Bearer ${userApiKey}`;

  if (!requestUrl) throw new Error("请在设置中填写有效的 API Base URL");
  if (requiresApiKey && !userApiKey)
    throw new Error("请先在设置中填写 API Key");

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
        const content = data.choices?.[0]?.delta?.content;
        if (content) yield { content, usage: data.usage };
      } catch (e) {}
    }
  }
}

async function initGreeting() {
  await systemPromptReady;
  const { body: msgBody } = appendMsg("", { thinking: true });

  try {
    const messages = [
      { role: "system", content: SYSTEM_PROMPT },
      {
        role: "user",
        content:
          "你正在给华生发消息，自然地向华生打个招呼吧。记得保持你的性格特点，不要输出Markdown，不要解释设定，也不要用括号表示动作，更不要代入场景。",
      },
    ];

    let fullText = "";
    let displayedText = "";
    const stream = callModelStream(messages);

    for await (const chunk of stream) {
      if (fullText === "") {
        msgBody.innerHTML = "";
        msgBody.classList.add("typing-active");
      }
      fullText += chunk.content;

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
    msgBody
      .querySelectorAll("pre code")
      .forEach((el) => hljs.highlightElement(el));
    conversation.push({ role: "assistant", content: fullText });
  } catch (e) {
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
}

pickBtn.addEventListener("click", () => fileInput.click());

fileInput.addEventListener("change", async (e) => {
  const file = e.target.files?.[0];
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
  updateCharacterBubble(`已收到题目《${file.name}》，点“讲解”开始。`);
  appendMsg(`收到你的题目：${file.name}。你可以点“讲解”，我会给你完整思路。`);
  explainBtn.classList.add("btn-pulse");
  increaseContext();
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
  const { article: thinkingMsg, body: msgBody } = appendMsg("正在思考...", {
    thinking: true,
  });
  setBusy(true);
  try {
    await systemPromptReady;
    const modePrompt = MODE_INSTRUCTIONS[currentMode];
    const userPrompt = `${modePrompt}\n请讲解这道题。先给最终结论，再给完整步骤推导（分点编号），最后给易错点和检查方法。`;
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
    const stream = callModelStream(messages);

    for await (const chunk of stream) {
      if (fullText === "") {
        msgBody.innerHTML = ""; // 收到第一个块时清除骨架屏
        msgBody.classList.add("typing-active");
      }
      fullText += chunk.content;

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
    msgBody
      .querySelectorAll("pre code")
      .forEach((el) => hljs.highlightElement(el));
    conversation.push({
      role: "user",
      content: "我上传了一道题目图片，请你完整讲解。",
    });
    conversation.push({ role: "assistant", content: fullText });
    updateCharacterBubble("讲解完成。你可以继续追问“为什么这么做”。");
    if (lastUsage) updateContextByUsage(lastUsage);
  } catch (error) {
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
});

askForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const q = askInput.value.trim();
  if (!q) return;
  if (isBusy) return;

  appendMsg(q, { role: "user" });
  askInput.value = "";
  setBusy(true);

  let thinkingMsg = null;
  let msgBody = null;

  await sleep(500);

  ({ article: thinkingMsg, body: msgBody } = appendMsg("正在思考...", {
    thinking: true,
  }));
  try {
    await systemPromptReady;
    const modePrompt = MODE_INSTRUCTIONS[currentMode];
    const fullQuery = `${modePrompt}\n${q}`;
    const messages = [
      { role: "system", content: SYSTEM_PROMPT },
      ...conversation,
      { role: "user", content: fullQuery },
    ];

    let fullText = "";
    let displayedText = "";
    let lastUsage = null;
    const stream = callModelStream(messages);

    for await (const chunk of stream) {
      if (fullText === "") {
        msgBody.innerHTML = "";
        msgBody.classList.add("typing-active");
      }
      fullText += chunk.content;

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
    msgBody
      .querySelectorAll("pre code")
      .forEach((el) => hljs.highlightElement(el));
    conversation.push({ role: "user", content: q });
    conversation.push({ role: "assistant", content: fullText });
    if (lastUsage) updateContextByUsage(lastUsage);
  } catch (error) {
    if (thinkingMsg) thinkingMsg.remove();
    appendMsg(`追问失败：${error.message}`, { isError: true });
  } finally {
    setBusy(false);
  }
});

settingsBtn?.addEventListener("click", () => {
  const provider = getProvider();
  apiKeyInput.value = getUserApiKey();
  if (providerSelect) providerSelect.value = provider;
  if (baseUrlInput)
    baseUrlInput.value =
      provider === "custom" ? getProviderBaseUrl("custom") : "";
  if (fastModelInput) fastModelInput.value = getConfiguredModeModel("fast");
  if (thinkingModelInput)
    thinkingModelInput.value = getConfiguredModeModel("thinking");
  setSettingsModalOpen(true);
  setTimeout(() => apiKeyInput?.focus(), 50);
});

closeSettingsBtn?.addEventListener("click", () => setSettingsModalOpen(false));

settingsModal?.addEventListener("click", (e) => {
  if (e.target === settingsModal) setSettingsModalOpen(false);
});

providerSelect?.addEventListener("change", () => {
  const provider = providerSelect.value || "proxy";
  if (baseUrlInput) {
    baseUrlInput.value =
      provider === "custom" ? getProviderBaseUrl("custom") : "";
  }
  if (provider === "deepseek" || provider === "native_deepseek") {
    if (fastModelInput) fastModelInput.value = "deepseek-chat";
    if (thinkingModelInput) thinkingModelInput.value = "deepseek-reasoner";
  }
});

saveApiKeyBtn?.addEventListener("click", () => {
  const key = apiKeyInput.value.trim();
  try {
    const provider = providerSelect?.value || "proxy";
    localStorage.setItem(PROVIDER_STORAGE, provider);
    if (key) localStorage.setItem(USER_API_KEY_STORAGE, key);
    if (provider === "custom") {
      localStorage.setItem(BASE_URL_STORAGE, (baseUrlInput?.value || "").trim());
    } else {
      localStorage.removeItem(BASE_URL_STORAGE);
    }
    const fastModel =
      fastModelInput?.value.trim() || getDefaultModelForProvider(provider, "fast");
    const thinkingModel =
      thinkingModelInput?.value.trim() ||
      getDefaultModelForProvider(provider, "thinking");
    setConfiguredModeModel("fast", fastModel);
    setConfiguredModeModel("thinking", thinkingModel);
    showModeTip("设置已保存");
    setSettingsModalOpen(false);
  } catch {
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
    apiKeyInput.value = "";
    if (providerSelect) providerSelect.value = "proxy";
    if (baseUrlInput) baseUrlInput.value = "";
    if (fastModelInput) fastModelInput.value = MODE_DEFAULT_MODEL.fast;
    if (thinkingModelInput) thinkingModelInput.value = MODE_DEFAULT_MODEL.thinking;
    showModeTip("已清除并恢复默认模型");
  } catch {
    showModeTip("清除失败");
  }
});

document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && settingsModal?.classList.contains("show")) {
    setSettingsModalOpen(false);
  }
});

modeSwitch?.addEventListener("click", (e) => {
  const btn = e.target.closest(".mode-btn");
  if (!btn) return;
  const mode = btn.dataset.mode;
  if (!mode || mode === currentMode) return;
  setMode(mode);
  if (mode === "thinking") {
    alert("来自作者的话:\n思考模式所使用的模型由于种种原因成本较高, 快速所使用的模型也不是那么不堪。如果不是要处理特别复杂的题目, 建议还是使用快速模式哦~");
  }
});

setMode("fast");

timeTip.textContent = formatTime();
initGreeting();
