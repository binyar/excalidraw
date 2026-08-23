import { readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import dotenv from "dotenv";

const REPO_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const CATALOG_ROOT = path.join(REPO_ROOT, "excalidraw-app/ai/library-catalog");
const LIBRARIES_ROOT = path.join(CATALOG_ROOT, "libraries");
const OUTPUT_PATH = path.join(CATALOG_ROOT, "translations.zh-CN.json");
const DISPLAY_KEYS = new Set(["text", "originalText", "name", "label"]);
const hasLatin = (value) => /[A-Za-z]/.test(String(value || ""));
const latinLetterNames = {
  a: "诶",
  b: "比",
  c: "西",
  d: "迪",
  e: "伊",
  f: "艾弗",
  g: "吉",
  h: "艾尺",
  i: "艾",
  j: "杰",
  k: "开",
  l: "艾勒",
  m: "艾姆",
  n: "艾恩",
  o: "欧",
  p: "皮",
  q: "丘",
  r: "阿尔",
  s: "艾丝",
  t: "提",
  u: "优",
  v: "维",
  w: "达布流",
  x: "艾克斯",
  y: "歪",
  z: "泽德",
};
const replaceResidualLatin = (value) =>
  String(value).replace(
    /[A-Za-z]/g,
    (letter) => latinLetterNames[letter.toLowerCase()],
  );
const looksSpelledOut = (value) =>
  /(艾克斯|达布流|艾弗|艾勒|艾姆|艾恩|泽德|开优比|杰艾丝欧艾恩|艾尺提提皮)/.test(
    value,
  );

dotenv.config({ path: path.join(REPO_ROOT, ".env.local") });
dotenv.config({ path: path.join(REPO_ROOT, ".env") });
const apiKey = process.env.DEEPSEEK_API_KEY || process.env.DEEP_SEEK_API_KEY;
if (!apiKey) {
  throw new Error("缺少翻译模型密钥");
}

const readJson = async (filePath) =>
  JSON.parse(await readFile(filePath, "utf8"));

const walkJsonFiles = async (directory) => {
  const result = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const filePath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      result.push(...(await walkJsonFiles(filePath)));
    } else if (entry.name.endsWith(".json")) {
      result.push(filePath);
    }
  }
  return result;
};

const strings = new Set();
const add = (value) => {
  if (typeof value === "string" && hasLatin(value)) {
    strings.add(value);
  }
};

const libraries = await readJson(path.join(CATALOG_ROOT, "libraries.json"));
const index = await readJson(path.join(CATALOG_ROOT, "index.json"));
for (const library of libraries) {
  add(library.name);
  add(library.description);
  for (const author of library.authors || []) {
    add(author.name);
  }
  for (const itemName of library.itemNames || []) {
    add(itemName);
  }
}
for (const entry of index) {
  add(entry.libraryName);
  add(entry.description);
  add(entry.itemName);
}

const visitDisplayStrings = (value, key = "") => {
  if (typeof value === "string") {
    if (DISPLAY_KEYS.has(key)) {
      add(value);
    }
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((item) => visitDisplayStrings(item, key));
    return;
  }
  if (value && typeof value === "object") {
    Object.entries(value).forEach(([childKey, child]) =>
      visitDisplayStrings(child, childKey),
    );
  }
};
for (const filePath of await walkJsonFiles(LIBRARIES_ROOT)) {
  visitDisplayStrings(await readJson(filePath));
}

let translations = {};
try {
  translations = await readJson(OUTPUT_PATH);
} catch {
  // First run.
}

const pending = [...strings].filter(
  (source) =>
    typeof translations[source] !== "string" ||
    !translations[source].trim() ||
    hasLatin(translations[source]),
);

const makeBatches = (values, maxItems = 70, maxCharacters = 6500) => {
  const batches = [];
  let batch = [];
  let characters = 0;
  for (const value of values) {
    if (
      batch.length > 0 &&
      (batch.length >= maxItems || characters + value.length > maxCharacters)
    ) {
      batches.push(batch);
      batch = [];
      characters = 0;
    }
    batch.push(value);
    characters += value.length;
  }
  if (batch.length) {
    batches.push(batch);
  }
  return batches;
};

const systemPrompt = `你是专业的素材库中文本地化翻译器。把输入 JSON 对象的每个值翻译成准确、自然、简洁的简体中文，并输出键完全相同的 JSON 对象。

硬性规则：
1. 每条译文严禁出现任何英文字母 A-Z 或 a-z，包括品牌缩写、网址、代码和单位。
2. 软件、云服务、产品和人名使用通行中文名；没有通行译名时使用中文音译，不能保留拉丁字母。
3. 技术缩写按含义翻译，例如：人工智能、应用程序接口、持续集成、持续交付、杰森数据格式、统一建模语言，不要把软件语境里的缩写误译成日常物品。
4. 网址统一改写为“相关官方文档”，邮件地址改写为“相关联系地址”。
5. Item 加数字统一译为“素材项”加原数字。
6. 保留原文的数字、标点和必要换行，不添加解释，不遗漏任何键。
7. 输入可能是画布内短标签、技术产品名、人物名或长描述，要结合素材库语境翻译。`;

const translateBatch = async (batch, attempt = 1) => {
  const input = Object.fromEntries(batch.map((value, index) => [index, value]));
  const response = await fetch("https://api.deepseek.com/chat/completions", {
    method: "POST",
    headers: {
      authorization: `Bearer ${apiKey}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: "deepseek-chat",
      temperature: 0,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: JSON.stringify(input) },
      ],
    }),
  });
  if (!response.ok) {
    throw new Error(`翻译请求失败：${response.status}`);
  }
  const payload = await response.json();
  const result = JSON.parse(payload.choices?.[0]?.message?.content || "{}");
  const invalid = batch.filter((_, index) => {
    const value = result[index];
    return typeof value !== "string" || !value.trim() || hasLatin(value);
  });
  if (invalid.length) {
    if (attempt >= 4) {
      invalid.forEach((source) => {
        const index = batch.indexOf(source);
        result[index] = replaceResidualLatin(result[index]);
      });
    } else {
      const repaired = await translateBatch(invalid, attempt + 1);
      invalid.forEach((source) => {
        result[batch.indexOf(source)] = repaired[source];
      });
    }
  }
  return Object.fromEntries(
    batch.map((source, index) => [source, result[index].trim()]),
  );
};

const batches = makeBatches(pending);
console.log(
  `待翻译 ${pending.length} / ${strings.size} 条，共 ${batches.length} 批`,
);
let completed = 0;
for (let offset = 0; offset < batches.length; offset += 3) {
  const group = batches.slice(offset, offset + 3);
  const translated = await Promise.all(
    group.map((batch) => translateBatch(batch)),
  );
  translated.forEach((entries) => Object.assign(translations, entries));
  completed += group.reduce((total, batch) => total + batch.length, 0);
  const sorted = Object.fromEntries(
    Object.entries(translations).sort(([left], [right]) =>
      left.localeCompare(right),
    ),
  );
  await writeFile(OUTPUT_PATH, `${JSON.stringify(sorted, null, 2)}\n`, "utf8");
  console.log(`已完成 ${completed} / ${pending.length}`);
}

const missing = [...strings].filter(
  (source) => !translations[source] || hasLatin(translations[source]),
);
if (missing.length) {
  throw new Error(`中文翻译不完整：${missing.length} 条`);
}
console.log(`中文翻译完成：${strings.size} 条`);

const qualityRepairSources = [...strings].filter((source) =>
  looksSpelledOut(translations[source] || ""),
);
if (qualityRepairSources.length) {
  const repairPrompt = `你是技术素材库的中文译名校对专家。输入 JSON 的值是英文原文，请输出键相同的简体中文译文。

硬性规则：
1. 译文不得出现任何英文字母。
2. 严禁把英文单词机械拆成单个字母的中文读音，必须使用整词的通行中文名、技术含义或自然的汉字音译。
3. 常用译名示例：亚马逊云服务、微软云、库伯内特斯、利努克斯、卡蒙达、可画、手绘白板、沃德普雷斯、结构化查询语言、库斯托查询语言、可扩展标记语言、便携文档格式、压缩文件、文本文件、杰森数据格式、网络应用防火墙、拉姆达、办公套件。
4. 网址改写为“相关官方文档”，人名和未知品牌按整个名字自然音译。
5. 保持原意，不添加括号中的英文原名，不遗漏键，只输出 JSON。`;
  const repairBatch = async (batch) => {
    const input = Object.fromEntries(
      batch.map((value, index) => [index, value]),
    );
    const response = await fetch("https://api.deepseek.com/chat/completions", {
      method: "POST",
      headers: {
        authorization: `Bearer ${apiKey}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: "deepseek-chat",
        temperature: 0,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: repairPrompt },
          { role: "user", content: JSON.stringify(input) },
        ],
      }),
    });
    if (!response.ok) {
      throw new Error(`译名校对请求失败：${response.status}`);
    }
    const payload = await response.json();
    const result = JSON.parse(payload.choices?.[0]?.message?.content || "{}");
    return Object.fromEntries(
      batch.map((source, index) => {
        const translated = replaceResidualLatin(result[index] || "").trim();
        if (!translated) {
          throw new Error("译名校对返回空值");
        }
        return [source, translated];
      }),
    );
  };
  for (const batch of makeBatches(qualityRepairSources, 40, 4000)) {
    Object.assign(translations, await repairBatch(batch));
  }
  const sorted = Object.fromEntries(
    Object.entries(translations).sort(([left], [right]) =>
      left.localeCompare(right),
    ),
  );
  await writeFile(OUTPUT_PATH, `${JSON.stringify(sorted, null, 2)}\n`, "utf8");
  console.log(`专有名词校对完成：${qualityRepairSources.length} 条`);
}
