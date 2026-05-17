const form = document.getElementById("configForm");
const restartButton = document.getElementById("restartButton");
const proxyStatus = document.getElementById("proxyStatus");
const translatorStatus = document.getElementById("translatorStatus");
const publicUrl = document.getElementById("publicUrl");
const lanUrls = document.getElementById("lanUrls");
const publicInternetUrl = document.getElementById("publicInternetUrl");
const publicInternetError = document.getElementById("publicInternetError");
const proxyError = document.getElementById("proxyError");
const translatorError = document.getElementById("translatorError");

window.liveTranslatorCompanion.onStatus(renderStatus);

bootstrap();

async function bootstrap() {
  const status = await window.liveTranslatorCompanion.getStatus();
  renderStatus(status);
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  const formData = new FormData(form);
  const payload = Object.fromEntries(formData.entries());
  const status = await window.liveTranslatorCompanion.saveConfig(payload);
  renderStatus(status);
});

restartButton.addEventListener("click", async () => {
  const status = await window.liveTranslatorCompanion.restartServices();
  renderStatus(status);
});

function renderStatus(status) {
  if (!status) return;

  form.publicPort.value = status.config.publicPort ?? 31000;
  form.foundryPort.value = status.config.foundryPort ?? 30000;
  form.translatorPort.value = status.config.translatorPort ?? 31001;
  form.translatorBindHost.value = status.config.translatorBindHost ?? "127.0.0.1";
  form.deeplApiKey.value = status.config.deeplApiKey ?? "";

  proxyStatus.textContent = status.proxy?.running ? `Running on ${status.config.publicPort}` : "Stopped";
  translatorStatus.textContent = status.translator?.running ? `Running on ${status.config.translatorPort}` : "Stopped";
  publicUrl.textContent = status.addresses?.localhostUrl || `http://127.0.0.1:${status.config.publicPort}`;
  lanUrls.textContent = (status.addresses?.lanUrls && status.addresses.lanUrls.length)
    ? status.addresses.lanUrls.join(" , ")
    : "No LAN IPv4 address detected";
  publicInternetUrl.textContent = status.addresses?.publicIpUrl || "Unavailable";
  publicInternetError.textContent = status.addresses?.publicIpError || "";
  proxyError.textContent = status.proxyError || "";
  translatorError.textContent = status.translator?.lastError || "";
}
