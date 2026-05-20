import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const dataPath = join(__dirname, "..", "medications.json");

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const CHAT_ID = process.env.TELEGRAM_CHAT_ID;
const WINDOW_MINUTES = Number(process.env.REMINDER_WINDOW_MINUTES ?? 5);

if (!BOT_TOKEN || !CHAT_ID) {
  console.error("Missing TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID");
  process.exit(1);
}

const data = JSON.parse(readFileSync(dataPath, "utf-8"));
const timezone = data.timezone || "Asia/Taipei";
const meds = data.medications || [];

const now = new Date();
const localHHMM = new Intl.DateTimeFormat("en-GB", {
  timeZone: timezone,
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
}).format(now);
const [curH, curM] = localHHMM.split(":").map(Number);
const currentMinutes = curH * 60 + curM;

const localDate = new Intl.DateTimeFormat("zh-TW", {
  timeZone: timezone,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  weekday: "short",
}).format(now);

async function sendTelegram(text) {
  const url = `https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: CHAT_ID,
      text,
      parse_mode: "HTML",
      disable_web_page_preview: true,
    }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Telegram ${res.status}: ${body}`);
  }
}

function escapeHtml(s) {
  return String(s)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

let sent = 0;
for (const med of meds) {
  if (!Array.isArray(med.times)) continue;
  for (const time of med.times) {
    const m = /^(\d{1,2}):(\d{2})$/.exec(time);
    if (!m) continue;
    const tH = Number(m[1]);
    const tM = Number(m[2]);
    const target = tH * 60 + tM;
    const diff = currentMinutes - target;
    if (diff < 0 || diff >= WINDOW_MINUTES) continue;

    const lines = [
      `💊 <b>服藥提醒</b>`,
      ``,
      `<b>${escapeHtml(med.name)}</b>`,
    ];
    if (med.dose) lines.push(`劑量:${escapeHtml(med.dose)}`);
    lines.push(`時間:${escapeHtml(time)}`);
    if (med.note) lines.push(``, escapeHtml(med.note));
    lines.push(``, `<i>${escapeHtml(localDate)}</i>`);

    try {
      await sendTelegram(lines.join("\n"));
      console.log(`Sent: ${med.name} @ ${time}`);
      sent += 1;
    } catch (err) {
      console.error(`Failed to send ${med.name} @ ${time}:`, err.message);
      process.exitCode = 1;
    }
  }
}

console.log(
  `Done. Now=${localHHMM} (${timezone}), window=${WINDOW_MINUTES}min, sent=${sent}, total_meds=${meds.length}`,
);
