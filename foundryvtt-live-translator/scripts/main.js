const MODULE_ID = "foundryvtt-live-translator";
const CACHE_DB_NAME = `${MODULE_ID}.cache`;
const CACHE_STORE_NAME = "translations";
const CACHE_DB_VERSION = 1;

Hooks.once("init", () => {
  registerSettings();
});

Hooks.on("renderItemSheet", (app, html) => {
  addTranslateButton(app, html);
});

function registerSettings() {
  game.settings.register(MODULE_ID, "servicePath", {
    name: game.i18n.localize(`${MODULE_ID}.settings.servicePath.name`),
    hint: game.i18n.localize(`${MODULE_ID}.settings.servicePath.hint`),
    scope: "world",
    config: true,
    type: String,
    default: "/live-translator",
    restricted: true
  });

  game.settings.register(MODULE_ID, "targetLanguage", {
    name: game.i18n.localize(`${MODULE_ID}.settings.targetLanguage.name`),
    hint: game.i18n.localize(`${MODULE_ID}.settings.targetLanguage.hint`),
    scope: "world",
    config: true,
    type: String,
    default: "KO",
    restricted: true
  });

  game.settings.register(MODULE_ID, "sourceLanguage", {
    name: game.i18n.localize(`${MODULE_ID}.settings.sourceLanguage.name`),
    hint: game.i18n.localize(`${MODULE_ID}.settings.sourceLanguage.hint`),
    scope: "world",
    config: true,
    type: String,
    default: "",
    restricted: true
  });
}

function addTranslateButton(app, html) {
  const item = app.object;
  if (!(item instanceof Item)) return;

  const sheetRoot = html[0];
  if (!sheetRoot) return;

  const appRoot = sheetRoot.closest(".app");
  if (!appRoot) return;
  if (appRoot.querySelector(".window-header > .live-translator")) return;

  const windowHeader = appRoot.querySelector(".window-header");
  if (!windowHeader) return;

  const button = document.createElement("a");
  button.classList.add("live-translator", `${MODULE_ID}-button`);
  button.setAttribute("role", "button");
  button.setAttribute("title", game.i18n.localize(`${MODULE_ID}.button.translate`).trim());
  button.innerHTML = `<i class="fas fa-language"></i><span>${game.i18n.localize(`${MODULE_ID}.button.translate`)}</span>`;
  button.addEventListener("click", async (event) => {
    event.preventDefault();
    event.stopPropagation();

    try {
      await onTranslateClicked(item);
    } catch (error) {
      console.error(`${MODULE_ID} | Translation failed`, error);
      ui.notifications.error(error.message ?? game.i18n.localize(`${MODULE_ID}.errors.unknown`));
    }
  });

  const firstHeaderButton = windowHeader.querySelector(".header-button, .header-control");
  if (firstHeaderButton) {
    windowHeader.insertBefore(button, firstHeaderButton);
    return;
  }

  windowHeader.append(button);
}

async function onTranslateClicked(item) {
  const servicePath = normalizeServicePath(game.settings.get(MODULE_ID, "servicePath"));
  if (!servicePath) {
    throw new Error(game.i18n.localize(`${MODULE_ID}.errors.missingServicePath`));
  }

  const targetLanguage = normalizeLanguage(game.settings.get(MODULE_ID, "targetLanguage") || "KO");
  const sourceLanguage = normalizeLanguage(game.settings.get(MODULE_ID, "sourceLanguage") || "");
  const rawDescription = item.description ?? item.system?.description?.value ?? "";
  const itemName = item.name ?? "";
  const descriptionText = sanitizeDescription(rawDescription);
  const protectedItemName = normalizeFoundryInlineSyntaxForTranslation(itemName);
  const protectedDescriptionText = normalizeFoundryInlineSyntaxForTranslation(descriptionText);
  const resourceId = item.uuid ?? item.id ?? item.name ?? crypto.randomUUID();
  const sourceSignature = buildSourceSignature(itemName, descriptionText, sourceLanguage, targetLanguage);

  if (!itemName && !descriptionText) {
    ui.notifications.info(game.i18n.localize(`${MODULE_ID}.errors.nothingToTranslate`));
    return;
  }

  const cached = await translationCache.get(resourceId, sourceSignature);
  if (cached) {
    renderTranslationDialog(item, cached, game.i18n.localize(`${MODULE_ID}.cache.hit`));
    return;
  }

  const translated = await requestTranslationFromService(servicePath, {
    itemName: protectedItemName,
    descriptionText: protectedDescriptionText,
    sourceLanguage,
    targetLanguage
  });

  const normalizedTranslated = {
    ...translated,
    translatedName: unprotectFoundryInlineSyntax(translated.translatedName ?? ""),
    translatedDescription: unprotectFoundryInlineSyntax(translated.translatedDescription ?? "")
  };

  await translationCache.put({
    resourceId,
    sourceSignature,
    sourceLanguage,
    targetLanguage,
    itemName,
    translatedName: normalizedTranslated.translatedName ?? "",
    translatedDescription: normalizedTranslated.translatedDescription ?? "",
    detectedSourceLanguage: normalizedTranslated.detectedSourceLanguage ?? sourceLanguage ?? ""
  });

  renderTranslationDialog(item, normalizedTranslated, game.i18n.localize(`${MODULE_ID}.cache.live`));
}

function normalizeServicePath(value) {
  const raw = String(value ?? "").trim();
  if (!raw) return "";
  const withLeadingSlash = raw.startsWith("/") ? raw : `/${raw}`;
  return withLeadingSlash.replace(/\/+$/, "");
}

function normalizeLanguage(value) {
  return String(value ?? "").trim().toUpperCase();
}

function sanitizeDescription(html) {
  const wrapper = document.createElement("div");
  wrapper.innerHTML = html;
  return wrapper.textContent?.trim() ?? "";
}

function normalizeFoundryInlineSyntaxForTranslation(text) {
  return String(text ?? "").replace(/@([^[\]\s{]+)\[([^\]]+)\](?:\{([^}]+)\})?/g, (_match, kind, target, label) => {
    if (label) return label;
    return formatFoundryInlineToken(kind, target);
  });
}

function formatFoundryInlineToken(kind, target) {
  const normalizedKind = String(kind ?? "").trim();
  const segments = String(target ?? "")
    .split("|")
    .map((segment) => segment.trim())
    .filter(Boolean);

  if (!segments.length) {
    return normalizedKind;
  }

  const formattedSegments = segments.map(formatFoundryInlineSegment);
  const joinedSegments = formattedSegments.join(", ");

  switch (normalizedKind.toLowerCase()) {
    case "uuid":
      return joinedSegments;
    case "check":
      return `Check: ${joinedSegments}`;
    case "damage":
      return `Damage: ${joinedSegments}`;
    case "template":
    case "템플릿":
      return `Template: ${joinedSegments}`;
    default:
      return `${normalizedKind}: ${joinedSegments}`;
  }
}

function formatFoundryInlineSegment(segment) {
  const separatorIndex = segment.indexOf(":");
  if (separatorIndex < 0) return segment;

  const key = segment.slice(0, separatorIndex).trim();
  const value = segment.slice(separatorIndex + 1).trim();
  if (!key || !value) return segment;
  return `${key}: ${value}`;
}

function unprotectFoundryInlineSyntax(text) {
  return String(text ?? "").replace(/<keep>([\s\S]*?)<\/keep>/g, (_match, inner) => unescapeXml(inner));
}

function escapeXml(text) {
  return String(text ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function unescapeXml(text) {
  return String(text ?? "")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
}

function buildSourceSignature(itemName, descriptionText, sourceLanguage, targetLanguage) {
  return [
    normalizeLanguage(sourceLanguage),
    normalizeLanguage(targetLanguage),
    itemName,
    descriptionText
  ].join("::");
}

async function requestTranslationFromService(servicePath, payload) {
  let response;
  try {
    response = await fetch(`${servicePath}/translate`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(payload)
    });
  } catch (error) {
    throw new Error(game.i18n.format(`${MODULE_ID}.errors.serviceNetwork`, { message: error.message }));
  }

  if (!response.ok) {
    const detail = await readServiceError(response);
    throw new Error(game.i18n.format(`${MODULE_ID}.errors.serviceApi`, {
      status: response.status,
      detail
    }));
  }

  return await response.json();
}

async function readServiceError(response) {
  try {
    const raw = await response.text();
    if (!raw) return "No error details provided.";
    const payload = JSON.parse(raw);
    if (payload?.error) return payload.error;
    return raw;
  } catch (_error) {
    return "Unable to read error details from response.";
  }
}

function renderTranslationDialog(item, translated, sourceLabel) {
  const descriptionHtml = translated.translatedDescription
    ? `<p>${formatParagraphs(translated.translatedDescription)}</p>`
    : "-";
  const content = `
    <div class="${MODULE_ID}-dialog">
      <section>
        <h2>${escapeHtml(game.i18n.localize(`${MODULE_ID}.dialog.name`))}</h2>
        <div class="${MODULE_ID}-translated-name">${escapeHtml(translated.translatedName || "-")}</div>
      </section>
      <section>
        <h2>${escapeHtml(game.i18n.localize(`${MODULE_ID}.dialog.description`))}</h2>
        <div class="${MODULE_ID}-translated-description">${descriptionHtml}</div>
      </section>
      <p class="${MODULE_ID}-meta">
        ${escapeHtml(game.i18n.format(`${MODULE_ID}.dialog.sourceLanguage`, {
          language: translated.detectedSourceLanguage || game.i18n.localize(`${MODULE_ID}.dialog.unknown`)
        }))}
      </p>
      <p class="${MODULE_ID}-meta">
        ${escapeHtml(game.i18n.format(`${MODULE_ID}.dialog.cache`, {
          source: sourceLabel
        }))}
      </p>
    </div>
  `;

  new Dialog({
    title: game.i18n.format(`${MODULE_ID}.dialog.title`, { itemName: item.name }),
    content,
    buttons: {
      close: {
        icon: '<i class="fas fa-check"></i>',
        label: game.i18n.localize("Close")
      }
    },
    default: "close"
  }).render(true);
}

function formatParagraphs(text) {
  return escapeHtml(text)
    .replace(/\n{2,}/g, "</p><p>")
    .replace(/\n/g, "<br>");
}

function escapeHtml(text) {
  return foundry.utils.escapeHTML(String(text ?? ""));
}

const translationCache = {
  async get(resourceId, sourceSignature) {
    const db = await openCacheDatabase();
    const key = buildCacheKey(resourceId, sourceSignature);

    return await new Promise((resolve, reject) => {
      const request = db.transaction(CACHE_STORE_NAME, "readonly")
        .objectStore(CACHE_STORE_NAME)
        .get(key);

      request.onsuccess = () => resolve(request.result ?? null);
      request.onerror = () => reject(request.error);
    });
  },

  async put(entry) {
    const db = await openCacheDatabase();
    const storedEntry = {
      ...entry,
      cacheKey: buildCacheKey(entry.resourceId, entry.sourceSignature),
      updatedAt: new Date().toISOString()
    };

    return await new Promise((resolve, reject) => {
      const request = db.transaction(CACHE_STORE_NAME, "readwrite")
        .objectStore(CACHE_STORE_NAME)
        .put(storedEntry);

      request.onsuccess = () => resolve(storedEntry);
      request.onerror = () => reject(request.error);
    });
  }
};

function buildCacheKey(resourceId, sourceSignature) {
  return `${resourceId}::${sourceSignature}`;
}

async function openCacheDatabase() {
  return await new Promise((resolve, reject) => {
    const request = indexedDB.open(CACHE_DB_NAME, CACHE_DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(CACHE_STORE_NAME)) {
        db.createObjectStore(CACHE_STORE_NAME, { keyPath: "cacheKey" });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}
