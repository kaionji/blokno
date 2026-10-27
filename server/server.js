// Блокно: сервер синхронизации для вашего ноутбука.
// Без внешних зависимостей. Запуск: BLOKNO_TOKEN=придумайте_длинную_строку node server.js
// Данные лежат в файле data/blokno.json рядом с этим скриптом.
// Доступ снаружи (с iPhone) нужен через HTTPS, например Cloudflare Tunnel или Tailscale Funnel.

const http = require("http");
const fs = require("fs");
const path = require("path");

const PORT = process.env.PORT || 8787;
const TOKEN = process.env.BLOKNO_TOKEN;
const ORIGIN = process.env.BLOKNO_ORIGIN || "*"; // например https://ваш-логин.github.io
const FILE = path.join(__dirname, "data", "blokno.json");

if (!TOKEN || TOKEN.length < 16) {
  console.error("Задайте BLOKNO_TOKEN длиной не меньше 16 символов.");
  process.exit(1);
}

function cors(res) {
  res.setHeader("Access-Control-Allow-Origin", ORIGIN);
  res.setHeader("Access-Control-Allow-Methods", "GET, PUT, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Authorization, Content-Type");
}

http.createServer(function (req, res) {
  cors(res);
  if (req.method === "OPTIONS") { res.writeHead(204); return res.end(); }
  if (req.url !== "/data") { res.writeHead(404); return res.end("not found"); }
  if (req.headers.authorization !== "Bearer " + TOKEN) { res.writeHead(401); return res.end("unauthorized"); }

  if (req.method === "GET") {
    fs.readFile(FILE, "utf8", function (err, text) {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(err ? "{}" : text);
    });
    return;
  }

  if (req.method === "PUT") {
    var body = "";
    req.on("data", function (c) {
      body += c;
      if (body.length > 20 * 1024 * 1024) { req.destroy(); }
    });
    req.on("end", function () {
      try {
        var data = JSON.parse(body);
        if (!data || typeof data.updated !== "number") throw new Error("bad data");
        fs.mkdirSync(path.dirname(FILE), { recursive: true });
        fs.writeFileSync(FILE, JSON.stringify(data));
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end('{"ok":true}');
      } catch (e) {
        res.writeHead(400); res.end("bad request");
      }
    });
    return;
  }

  res.writeHead(405); res.end();
}).listen(PORT, function () {
  console.log("Блокно: сервер синхронизации на порту " + PORT);
});
