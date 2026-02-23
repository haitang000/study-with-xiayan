// ── 运行时环境 ──
const RUNTIME_ENV =
  typeof window !== "undefined" && window.__STUDY_ENV__
    ? window.__STUDY_ENV__
    : {};

export function readRuntimeEnv(key) {
  const value = String(RUNTIME_ENV?.[key] || "").trim();
  if (/^__.+__$/.test(value)) return "";
  return value;
}

export const PROXY_ENDPOINTS = {
  deepseek: readRuntimeEnv("PROXY_DEEPSEEK_URL"),
  kimi: readRuntimeEnv("PROXY_KIMI_URL"),
  gemini: readRuntimeEnv("PROXY_GEMINI_URL"),
  claude: readRuntimeEnv("PROXY_CLAUDE_URL"),
};

// ── localStorage 键名 ──
export const USER_API_KEY_STORAGE = "moonshot_api_key";
export const PROVIDER_STORAGE = "llm_provider";
export const BASE_URL_STORAGE = "llm_base_url";
export const FAST_MODEL_STORAGE = "fast_mode_model";
export const THINKING_MODEL_STORAGE = "thinking_mode_model";
export const USER_NICKNAME_STORAGE = "chat_user_nickname";
export const USER_AVATAR_STORAGE = "chat_user_avatar";
export const MODEL_CONTEXT_CACHE_STORAGE = "model_context_window_cache";
export const CHAT_SESSIONS_STORAGE = "chat_session_records";
export const CHAT_ACTIVE_SESSION_STORAGE = "chat_active_session_id";

// ── 常量 ──
export const SIDEBAR_ANIM_DURATION = 220;
export const DEFAULT_CONTEXT_WINDOW_TOKENS = 32768;
export const CONTEXT_PROBE_TIMEOUT = 3500;

// ── 模型配置 ──
export const MODEL_CONFIGS = {
  "deepseek-chat": { url: PROXY_ENDPOINTS.deepseek, model: "deepseek-chat" },
  "kimi-latest": { url: PROXY_ENDPOINTS.kimi, model: "kimi-latest" },
  "kimi-k2.5": { url: PROXY_ENDPOINTS.kimi, model: "kimi-k2.5" },
  "moonshot-v1-32k": { url: PROXY_ENDPOINTS.kimi, model: "moonshot-v1-32k" },
};

export const MODE_INSTRUCTIONS = {
  fast: "【快速模式】请直接给出答案，保持简洁明了。",
  thinking: "【深度思考模式】请一步步思考，详细展示推导过程，并分析关键细节。",
};

export const PERSONA_REINFORCEMENT =
  "【人设锁定】你必须始终以夏彦身份回复，称呼用户为华生或我的华生；语气温柔、可靠、带一点熟悉感，不要跳出角色，不要提及设定来源。讲解时先用1句贴心引导，再进入知识内容。";

export const MODE_DEFAULT_MODEL = {
  fast: "deepseek-chat",
  thinking: "kimi-k2.5",
};

// ── Provider 辅助 ──
export function getProxyModelByMode(mode) {
  if (mode === "fast") return "deepseek-chat";
  if (mode === "thinking") return "kimi-k2.5";
  const preferred = MODE_DEFAULT_MODEL[mode] || MODE_DEFAULT_MODEL.fast;
  if (preferred && MODEL_CONFIGS[preferred]) return preferred;
  if (mode === "thinking" && MODEL_CONFIGS["kimi-k2.5"]) return "kimi-k2.5";
  if (MODEL_CONFIGS["kimi-latest"]) return "kimi-latest";
  return Object.keys(MODEL_CONFIGS)[0] || "";
}

export function getDefaultModelForProvider(provider, mode) {
  if (provider === "proxy") return getProxyModelByMode(mode);
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

export function getProviderBaseUrl(provider) {
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
