import {
  MODEL_CONFIGS, DEFAULT_CONTEXT_WINDOW_TOKENS, CONTEXT_PROBE_TIMEOUT,
  getProviderBaseUrl, getProxyModelByMode,
} from "./config.js";
import {
  getUserApiKey, getProvider, getConfiguredModeModel,
  getContextWindowFromCache, setContextWindowCache,
} from "./storage.js";

// ── 共享状态 ──
let currentMode = "fast";
let currentContextWindowTokens = DEFAULT_CONTEXT_WINDOW_TOKENS;
const contextProbePending = new Map();

export function getCurrentMode() { return currentMode; }
export function setCurrentMode(mode) { currentMode = mode; }
export function getContextWindowTokens() { return currentContextWindowTokens; }
export function setContextWindowTokens(val) { currentContextWindowTokens = val; }

// ── 上下文窗口探测 ──
export function buildContextCacheKey(provider, modelName, requestUrl) {
  return `${provider || "unknown"}::${String(modelName || "").toLowerCase()}::${String(requestUrl || "")}`;
}

export function formatContextWindowLabel(tokens) {
  const value = Math.max(1024, Number(tokens) || DEFAULT_CONTEXT_WINDOW_TOKENS);
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1).replace(/\.0$/, "")}M`;
  return `${Math.round(value / 1024)}k`;
}

export function inferContextWindowByModelName(modelName) {
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

export function getActiveModelRuntimeInfo(targetMode = currentMode) {
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
    const fields = [candidate.context_window, candidate.max_context_length, candidate.input_token_limit, candidate.max_input_tokens, candidate.max_tokens];
    const fromApi = fields.find((v) => Number(v) > 0);
    return fromApi ? Number(fromApi) : 0;
  } catch { return 0; }
  finally { clearTimeout(timer); }
}

// refreshContextMeter 由外部注入
let _refreshContextMeter = () => {};
export function setRefreshContextMeter(fn) { _refreshContextMeter = fn; }

export async function updateModelContextWindow(targetMode = currentMode, extraInput = "") {
  const { provider, modelName, requestUrl } = getActiveModelRuntimeInfo(targetMode);
  const cacheKey = buildContextCacheKey(provider, modelName, requestUrl);
  const cached = getContextWindowFromCache(cacheKey);
  if (cached) {
    currentContextWindowTokens = cached;
    _refreshContextMeter(extraInput);
  } else {
    currentContextWindowTokens = inferContextWindowByModelName(modelName);
    _refreshContextMeter(extraInput);
  }
  if (!requestUrl || !modelName) return;
  if (contextProbePending.has(cacheKey)) return;

  const task = (async () => {
    const probed = await probeContextWindowFromApi(provider, modelName, requestUrl);
    if (probed > 0) {
      currentContextWindowTokens = probed;
      setContextWindowCache(cacheKey, probed);
      _refreshContextMeter(extraInput);
    }
  })();
  contextProbePending.set(cacheKey, task);
  try { await task; } finally { contextProbePending.delete(cacheKey); }
}

export function triggerContextWindowRefresh(targetMode = currentMode) {
  updateModelContextWindow(targetMode).catch(() => {});
}

// ── 内容过滤 ──
export function createAssistantContentFilter() {
  let activeTagEnd = null;
  const tagMap = {
    "<think>": "</think>", "<thought>": "</thought>",
    "<thinking>": "</thinking>", "<reasoning>": "</reasoning>",
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
      let foundTag = null, earliestIdx = -1;
      for (const tag in tagMap) {
        const idx = text.indexOf(tag);
        if (idx !== -1 && (earliestIdx === -1 || idx < earliestIdx)) { earliestIdx = idx; foundTag = tag; }
      }
      if (earliestIdx === -1) { output += text; break; }
      output += text.slice(0, earliestIdx);
      const afterStart = text.slice(earliestIdx + foundTag.length);
      activeTagEnd = tagMap[foundTag];
      const endIdx = afterStart.indexOf(activeTagEnd);
      if (endIdx === -1) { text = ""; break; }
      text = afterStart.slice(endIdx + activeTagEnd.length);
      activeTagEnd = null;
    }
    return output;
  };
}

// ── SSE 流式请求（含重试） ──
function extractChunkText(data) {
  const delta = data?.choices?.[0]?.delta || {};
  if (typeof delta.content === "string") return delta.content;
  if (typeof delta.reasoning_content === "string") return delta.reasoning_content;
  if (Array.isArray(delta.content)) {
    return delta.content.map((item) => (typeof item === "string" ? item : item?.text || "")).join("");
  }
  const message = data?.choices?.[0]?.message || {};
  if (typeof message.content === "string") return message.content;
  if (Array.isArray(message.content)) {
    return message.content.map((item) => (typeof item === "string" ? item : item?.text || "")).join("");
  }
  return "";
}

function parseApiError(data, fallback) {
  if (data?.error?.message) return data.error.message;
  return fallback || "接口调用失败，请稍后重试。";
}

const API_TIMEOUT_MS = 60_000;
const MAX_RETRIES = 2;

export async function* callModelStream(messages, configKey, options = {}) {
  const targetMode = options.modeOverride || currentMode;
  if (!configKey) configKey = getConfiguredModeModel(targetMode);
  const provider = getProvider();
  const isProxy = provider === "proxy";
  const noAuthProviders = new Set(["proxy"]);
  const requiresApiKey = !noAuthProviders.has(provider);
  const proxyFallbackKey = getProxyModelByMode(targetMode);
  const config = MODEL_CONFIGS[configKey] || MODEL_CONFIGS[proxyFallbackKey];
  if (isProxy && !config) throw new Error("内置代理模型配置缺失，请在设置中切换为可用模型");

  const requestUrl = isProxy ? config.url : getProviderBaseUrl(provider);
  if (!requestUrl) {
    if (provider.startsWith("native_")) {
      const envVarName = `PROXY_${provider.split("_")[1].toUpperCase()}_URL`;
      throw new Error(`内置代理地址未配置，请联系站长在环境变量中注入 ${envVarName}`);
    }
    throw new Error("请在设置中填写有效的 API Base URL");
  }

  const modelName = isProxy ? config.model : getConfiguredModeModel(targetMode);
  const userApiKey = getUserApiKey(provider);
  if (requiresApiKey && !userApiKey)
    throw new Error("请先在设置中填写 API Key（或在 env.local.js 中配置对应的 API Key）");

  const payload = { model: modelName, messages, stream: true };
  const headers = { "Content-Type": "application/json" };
  if (requiresApiKey && userApiKey) headers.Authorization = `Bearer ${userApiKey}`;

  let lastError;
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), API_TIMEOUT_MS);

      const response = await fetch(requestUrl, {
        method: "POST", headers, body: JSON.stringify(payload), signal: controller.signal,
      });
      clearTimeout(timeout);

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(parseApiError(errorData, `请求失败（HTTP ${response.status}）`));
      }

      const contentType = String(response.headers.get("content-type") || "").toLowerCase();
      if (!contentType.includes("text/event-stream")) {
        const data = await response.json().catch(() => ({}));
        const content = extractChunkText(data);
        if (content || data?.usage) yield { content, usage: data.usage };
        return;
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
          if (!trimmed || !trimmed.startsWith("data:")) continue;
          const dataStr = trimmed.slice(5).trim();
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
      return; // 成功完成，退出重试循环
    } catch (err) {
      lastError = err;
      if (err.name === "AbortError") lastError = new Error("请求超时，请检查网络后重试");
      if (attempt < MAX_RETRIES) {
        console.warn(`[callModelStream] 第 ${attempt + 1} 次请求失败，正在重试...`, err.message);
        await new Promise((r) => setTimeout(r, 1000 * (attempt + 1)));
        continue;
      }
    }
  }
  throw lastError;
}

// ── System Prompt ──
let SYSTEM_PROMPT = "";
export function getSystemPrompt() { return SYSTEM_PROMPT; }

export async function loadSystemPrompt() {
  try {
    const response = await fetch("prompt.md", { cache: "no-store" });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const text = (await response.text()).trim();
    if (text) SYSTEM_PROMPT = text;
  } catch (error) {
    console.warn("加载 prompt.md 失败，已使用默认系统提示词。", error);
  }
}
