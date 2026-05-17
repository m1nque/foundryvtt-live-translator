import { createHash } from "node:crypto";
import { createServer } from "node:http";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

loadDotEnvFile();

const HOST = process.env.HOST ?? "127.0.0.1";
const PORT = Number.parseInt(process.env.PORT ?? "31001", 10);
const ALLOW_ORIGIN = process.env.ALLOW_ORIGIN ?? "*";
const DEEPL_API_KEY = process.env.DEEPL_API_KEY ?? "";
const DEEPL_API_URL = process.env.DEEPL_API_URL ?? "https://api-free.deepl.com/v2/translate";
const CACHE_DIR = resolve(process.env.CACHE_DIR ?? resolve(process.cwd(), ".cache", "translations"));
const MAX_BODY_BYTES = 1024 * 1024;

const server = createServer(async (req, res) => {
  applyCorsHeaders(res);

  if (req.method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return;
  }

  if (req.url === "/health" && req.method === "GET") {
    sendJson(res, 200, {
      ok: true,
      service: "live-translator-service",
      provider: "deepl",
      deeplConfigured: Boolean(DEEPL_API_KEY)
    });
    return;
  }

  if (req.url !== "/translate" || req.method !== "POST") {
    sendJson(res, 404, { error: "Not found" });
    return;
  }

  try {
    const payload = await readJsonBody(req);
    const itemName = normalizeText(payload.itemName);
    const descriptionText = normalizeText(payload.descriptionText);
    const sourceLanguage = normalizeLanguage(payload.sourceLanguage);
    const targetLanguage = normalizeLanguage(payload.targetLanguage);

    if (!targetLanguage) {
      throw createHttpError(400, "targetLanguage is required.");
    }

    if (!itemName && !descriptionText) {
      throw createHttpError(400, "At least one of itemName or descriptionText is required.");
    }

    if (!DEEPL_API_KEY) {
      throw createHttpError(500, "DEEPL_API_KEY is not configured on the host service.");
    }

    const translated = await translateItem({
      itemName,
      descriptionText,
      sourceLanguage,
      targetLanguage
    });

    sendJson(res, 200, translated);
  } catch (error) {
    sendJson(res, Number.isInteger(error.statusCode) ? error.statusCode : 500, {
      error: error.message ?? "Unexpected service error."
    });
  }
});

server.listen(PORT, HOST, () => {
  console.log(`Live Translator service listening on http://${HOST}:${PORT}`);
});

function applyCorsHeaders(res) {
  res.setHeader("Access-Control-Allow-Origin", ALLOW_ORIGIN);
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
}

function sendJson(res, statusCode, payload) {
  res.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8"
  });
  res.end(JSON.stringify(payload));
}

function normalizeText(value) {
  return String(value ?? "").trim();
}

function normalizeLanguage(value) {
  return String(value ?? "").trim().toUpperCase();
}

async function readJsonBody(req) {
  const chunks = [];
  let totalBytes = 0;

  for await (const chunk of req) {
    totalBytes += chunk.length;
    if (totalBytes > MAX_BODY_BYTES) {
      throw createHttpError(413, "Request body is too large.");
    }
    chunks.push(chunk);
  }

  const rawBody = Buffer.concat(chunks).toString("utf8");
  if (!rawBody) {
    throw createHttpError(400, "Request body is empty.");
  }

  try {
    return JSON.parse(rawBody);
  } catch (_error) {
    throw createHttpError(400, "Request body must be valid JSON.");
  }
}

async function translateItem({ itemName, descriptionText, sourceLanguage, targetLanguage }) {
  const cacheKey = buildCacheKey({ itemName, descriptionText, sourceLanguage, targetLanguage });
  const cached = readTranslationCache(cacheKey);
  if (cached) {
    return {
      ...cached,
      cache: "host-hit"
    };
  }

  const params = new URLSearchParams();
  params.append("target_lang", targetLanguage);
  params.append("tag_handling", "xml");
  params.append("ignore_tags", "keep");

  if (sourceLanguage) {
    params.append("source_lang", sourceLanguage);
  }

  if (itemName) {
    params.append("text", itemName);
  }

  if (descriptionText) {
    params.append("text", descriptionText);
  }

  const response = await fetch(DEEPL_API_URL, {
    method: "POST",
    headers: {
      "Authorization": `DeepL-Auth-Key ${DEEPL_API_KEY}`,
      "Content-Type": "application/x-www-form-urlencoded"
    },
    body: params
  });

  if (!response.ok) {
    const detail = await response.text();
    throw createHttpError(response.status, `DeepL API returned ${response.status}: ${detail}`);
  }

  const payload = await response.json();
  const translations = payload?.translations ?? [];
  const detectedSourceLanguage = translations[0]?.detected_source_language ?? sourceLanguage ?? "";

  const translated = {
    translatedName: itemName ? translations[0]?.text ?? "" : "",
    translatedDescription: descriptionText ? translations[itemName ? 1 : 0]?.text ?? "" : "",
    detectedSourceLanguage,
    cache: "host-miss"
  };

  writeTranslationCache(cacheKey, translated);
  return translated;
}

function buildCacheKey({ itemName, descriptionText, sourceLanguage, targetLanguage }) {
  return createHash("sha256")
    .update([
      normalizeLanguage(sourceLanguage),
      normalizeLanguage(targetLanguage),
      normalizeText(itemName),
      normalizeText(descriptionText)
    ].join("\n---\n"))
    .digest("hex");
}

function readTranslationCache(cacheKey) {
  try {
    const cachePath = resolve(CACHE_DIR, `${cacheKey}.json`);
    if (!existsSync(cachePath)) return null;
    return JSON.parse(readFileSync(cachePath, "utf8"));
  } catch (_error) {
    return null;
  }
}

function writeTranslationCache(cacheKey, translation) {
  try {
    mkdirSync(CACHE_DIR, { recursive: true });
    const cachePath = resolve(CACHE_DIR, `${cacheKey}.json`);
    writeFileSync(cachePath, JSON.stringify({
      translatedName: translation.translatedName ?? "",
      translatedDescription: translation.translatedDescription ?? "",
      detectedSourceLanguage: translation.detectedSourceLanguage ?? "",
      cachedAt: new Date().toISOString()
    }, null, 2), "utf8");
  } catch (_error) {
    // Cache persistence should not block translation responses.
  }
}

function createHttpError(statusCode, message) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

function loadDotEnvFile() {
  const envPath = resolve(process.cwd(), ".env");
  if (!existsSync(envPath)) return;

  const lines = readFileSync(envPath, "utf8").split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

    const separatorIndex = trimmed.indexOf("=");
    if (separatorIndex < 0) continue;

    const key = trimmed.slice(0, separatorIndex).trim();
    const value = trimmed.slice(separatorIndex + 1).trim();
    if (!key || process.env[key] !== undefined) continue;
    process.env[key] = stripWrappingQuotes(value);
  }
}

function stripWrappingQuotes(value) {
  if (
    (value.startsWith("\"") && value.endsWith("\"")) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    return value.slice(1, -1);
  }

  return value;
}
