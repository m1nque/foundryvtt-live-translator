import http from "node:http";
import net from "node:net";

let proxyServer = null;
let proxyConfig = null;

export async function startReverseProxy(config) {
  stopReverseProxy();
  proxyConfig = { ...config };

  proxyServer = http.createServer((req, res) => {
    const isTranslatorRoute = req.url?.startsWith("/live-translator/");
    const upstreamPort = isTranslatorRoute
      ? proxyConfig.translatorPort
      : proxyConfig.foundryPort;
    const upstreamPath = isTranslatorRoute
      ? stripTranslatorPrefix(req.url)
      : req.url;

    const upstreamReq = http.request({
      host: "127.0.0.1",
      port: upstreamPort,
      method: req.method,
      path: upstreamPath,
      headers: req.headers
    }, (upstreamRes) => {
      res.writeHead(upstreamRes.statusCode ?? 502, upstreamRes.headers);
      upstreamRes.pipe(res);
    });

    upstreamReq.on("error", (error) => {
      res.writeHead(502, { "Content-Type": "application/json; charset=utf-8" });
      res.end(JSON.stringify({ error: error.message }));
    });

    req.pipe(upstreamReq);
  });

  proxyServer.on("upgrade", (req, socket, head) => {
    const isTranslatorRoute = req.url?.startsWith("/live-translator/");
    const upstreamPort = isTranslatorRoute
      ? proxyConfig.translatorPort
      : proxyConfig.foundryPort;
    const upstreamPath = isTranslatorRoute
      ? stripTranslatorPrefix(req.url)
      : req.url;

    const upstreamSocket = net.connect(upstreamPort, "127.0.0.1", () => {
      upstreamSocket.write(buildUpgradeRequest(req, upstreamPath));
      if (head?.length) upstreamSocket.write(head);
      socket.pipe(upstreamSocket).pipe(socket);
    });

    upstreamSocket.on("error", () => {
      socket.destroy();
    });
  });

  await new Promise((resolve, reject) => {
    proxyServer.once("error", reject);
    proxyServer.listen(proxyConfig.publicPort, "0.0.0.0", () => {
      proxyServer.off("error", reject);
      resolve();
    });
  });
}

export function stopReverseProxy() {
  if (!proxyServer) return;
  proxyServer.close();
  proxyServer = null;
  proxyConfig = null;
}

export function getProxyStatus() {
  return {
    running: Boolean(proxyServer),
    config: proxyConfig
  };
}

function buildUpgradeRequest(req, upstreamPath) {
  const headerLines = Object.entries(req.headers ?? {})
    .map(([key, value]) => `${key}: ${value}`)
    .join("\r\n");
  return `${req.method} ${upstreamPath} HTTP/${req.httpVersion}\r\n${headerLines}\r\n\r\n`;
}

function stripTranslatorPrefix(url) {
  const stripped = String(url ?? "").replace(/^\/live-translator/, "");
  return stripped || "/";
}
