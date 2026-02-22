// 在 Vercel 构建时运行，将服务端环境变量写入客户端可读的 JS 文件。
// 本地开发时不需要运行（直接手动维护 js/env.local.js 即可）。
const fs = require("fs");
const path = require("path");

const keys = [
    "PROXY_DEEPSEEK_URL",
    "PROXY_KIMI_URL",
    "PROXY_GEMINI_URL",
    "PROXY_CLAUDE_URL",
    "DEEPSEEK_API_KEY",
    "KIMI_API_KEY",
    "GEMINI_API_KEY",
    "CLAUDE_API_KEY",
];

const entries = keys
    .filter((k) => process.env[k])
    .map((k) => `  ${k}: ${JSON.stringify(process.env[k])}`)
    .join(",\n");

const content = `// 由 scripts/build-env.js 在构建时自动生成，请勿手动编辑。
window.__STUDY_ENV__ = {
${entries}
};
`;

const outPath = path.join(__dirname, "..", "js", "env.local.js");
fs.writeFileSync(outPath, content, "utf-8");
console.log("[build-env] 已生成 js/env.local.js，包含以下字段：", keys.filter((k) => process.env[k]));
