require("dotenv").config();
const TelegramBot = require("node-telegram-bot-api");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const axios = require("axios");

const BOT_TOKEN = process.env.BOT_TOKEN;
const bot = new TelegramBot(BOT_TOKEN, { polling: true });

const DATA_FILE = path.join(__dirname, "qa-hub-data.json");
const UPDATES_FILE = path.join(__dirname, "qa-hub-updates.json");

// ── Helper: read store ──────────────────────────────────────────────────────
function readStore() {
  try {
    const raw = fs.readFileSync(DATA_FILE, "utf8");
    const parsed = JSON.parse(raw);
    return parsed.data || parsed; // handle both wrapped and unwrapped
  } catch {
    return null;
  }
}

// ── Helper: hash password (SHA-256, same as app) ────────────────────────────
function hashPassword(password) {
  return crypto.createHash("sha256").update(password).digest("hex");
}

// ── Helper: generate strong password (same logic as app) ───────────────────
function generateStrongPassword() {
  const upper = "ABCDEFGHJKLMNPQRSTUVWXYZ";
  const lower = "abcdefghjkmnpqrstuvwxyz";
  const digits = "23456789";
  const special = "@#$!";
  const all = upper + lower + digits + special;
  const pick = (str) => str[Math.floor(Math.random() * str.length)];
  const rand = Array.from({ length: 5 }, () => pick(all));
  return [pick(upper), pick(upper), pick(lower), pick(lower),
          pick(digits), pick(digits), pick(special), ...rand]
    .sort(() => Math.random() - 0.5).join("");
}

// ── Helper: write pending update ────────────────────────────────────────────
function writePendingUpdate(update) {
  let existing = { pendingUpdates: [] };
  try {
    existing = JSON.parse(fs.readFileSync(UPDATES_FILE, "utf8"));
  } catch {}
  existing.pendingUpdates.push({ ...update, timestamp: new Date().toISOString() });
  fs.writeFileSync(UPDATES_FILE, JSON.stringify(existing, null, 2));
}

// ── Helper: compute week range ──────────────────────────────────────────────
function getCurrentWeekRange() {
  const today = new Date();
  const day = today.getDay(); // 0=Sun
  const sun = new Date(today); sun.setDate(today.getDate() - day);
  const sat = new Date(sun); sat.setDate(sun.getDate() + 6);
  const fmt = (d) => d.toLocaleDateString("en-GB", { day: "2-digit", month: "short" });
  return `${fmt(sun)} \u2013 ${fmt(sat)} ${sat.getFullYear()}`;
}

function getCurrentMonthName() {
  return new Date().toLocaleDateString("en-GB", { month: "long", year: "numeric" });
}

// ── Helper: filter entries by date range ────────────────────────────────────
function filterByDateRange(entries, fromDate, toDate) {
  return (entries || []).filter(e => {
    const d = new Date(e.date);
    return d >= fromDate && d <= toDate;
  });
}

function getThisWeekRange() {
  const today = new Date();
  const sun = new Date(today); sun.setDate(today.getDate() - today.getDay());
  sun.setHours(0,0,0,0);
  const sat = new Date(sun); sat.setDate(sun.getDate() + 6);
  sat.setHours(23,59,59,999);
  return { from: sun, to: sat };
}

function getThisMonthRange() {
  const today = new Date();
  const from = new Date(today.getFullYear(), today.getMonth(), 1);
  const to = new Date(today.getFullYear(), today.getMonth() + 1, 0, 23, 59, 59);
  return { from, to };
}

// ── Helper: compute metrics ─────────────────────────────────────────────────
function computeMetrics(entries, defects) {
  const stories = entries.reduce((s, e) => s + (+(e.stories || e.tcCreated > 0 ? 1 : 0)), 0);
  const tcCreated = entries.reduce((s, e) => s + (+e.tcCreated || 0), 0);
  const tcExecuted = entries.reduce((s, e) => s + (+e.tcExecuted || 0), 0);
  const tcPassed = entries.reduce((s, e) => s + (+e.tcPassed || 0), 0);
  const tcFailed = entries.reduce((s, e) => s + (+e.tcFailed || 0), 0);
  const passRate = tcExecuted ? Math.round(tcPassed / tcExecuted * 100) : 0;
  const totalDefects = defects.length;
  const sitMisses = defects.filter(d => d.sitMiss).length;
  const sitRate = totalDefects ? Math.round(sitMisses / totalDefects * 100) : 0;
  const p1 = defects.filter(d => d.priority === "P1").length;
  const p2 = defects.filter(d => d.priority === "P2").length;
  const p3 = defects.filter(d => d.priority === "P3").length;
  const openDefects = defects.filter(d =>
    ["Open","In Progress","Re-Opened"].includes(d.status)).length;
  const openP1 = defects.filter(d => d.priority === "P1" &&
    ["Open","In Progress","Re-Opened"].includes(d.status)).length;
  const openP2 = defects.filter(d => d.priority === "P2" &&
    ["Open","In Progress","Re-Opened"].includes(d.status)).length;
  const openP3 = defects.filter(d => d.priority === "P3" &&
    ["Open","In Progress","Re-Opened"].includes(d.status)).length;
  return { tcCreated, tcExecuted, tcPassed, tcFailed, passRate,
           totalDefects, sitMisses, sitRate, p1, p2, p3,
           openDefects, openP1, openP2, openP3 };
}

// ── Helper: send email via EmailJS REST API ─────────────────────────────────
async function sendEmailJS(templateId, params) {
  try {
    await axios.post("https://api.emailjs.com/api/v1.0/email/send", {
      service_id: process.env.EMAILJS_SERVICE_ID,
      template_id: templateId,
      user_id: process.env.EMAILJS_PUBLIC_KEY,
      template_params: params
    });
    return true;
  } catch (err) {
    console.error("EmailJS error:", err?.response?.data || err.message);
    return false;
  }
}

// ── State: track multi-step conversations ───────────────────────────────────
const conversations = {}; // chatId → { step, data }

// ── Authorisation helper ────────────────────────────────────────────────────
function findUserByChatId(store, chatId) {
  return (store.users || []).find(
    u => u.telegramChatId === String(chatId)
  );
}

function isAdminOrAbove(user) {
  return user && ["admin","superadmin"].includes(user.role);
}

// ─────────────────────────────────────────────────────────────────────────────
// BOT COMMANDS
// ─────────────────────────────────────────────────────────────────────────────

// /start — welcome message
bot.onText(/\/start/, (msg) => {
  const chatId = msg.chat.id;
  bot.sendMessage(chatId,
    `\u{1F44B} <b>Welcome to QA Hub Bot!</b>\n\n` +
    `Available commands:\n\n` +
    `\u{1F511} /forgotpassword — Reset your password\n` +
    `\u{1F4CA} /weeklyreport — Get this week's metrics (Admin/Lead only)\n` +
    `\u{1F4C5} /monthlyreport — Get this month's metrics (Admin/Lead only)\n` +
    `\u{2753} /help — Show this menu`,
    { parse_mode: "HTML" }
  );
});

// /help
bot.onText(/\/help/, (msg) => {
  bot.sendMessage(msg.chat.id,
    `\u{1F916} <b>QA Hub Bot — Commands</b>\n\n` +
    `\u{1F511} /forgotpassword\n   Reset your QA Hub password\n\n` +
    `\u{1F4CA} /weeklyreport\n   Current week's QA metrics (Admin/Lead)\n\n` +
    `\u{1F4C5} /monthlyreport\n   Current month's QA metrics (Admin/Lead)\n\n` +
    `\u{2139}\u{FE0F} Make sure your Telegram Chat ID is registered in QA Hub.\n` +
    `Contact your admin if you need help.`,
    { parse_mode: "HTML" }
  );
});

// ─────────────────────────────────────────────────────────────────────────────
// FORGOT PASSWORD — multi-step flow
// ─────────────────────────────────────────────────────────────────────────────

bot.onText(/\/forgotpassword/, (msg) => {
  const chatId = msg.chat.id;
  conversations[chatId] = { step: "awaiting_username", data: {} };
  bot.sendMessage(chatId,
    `\u{1F511} <b>Password Reset</b>\n\nPlease enter your QA Hub <b>username</b>:`,
    { parse_mode: "HTML" }
  );
});

// ─────────────────────────────────────────────────────────────────────────────
// WEEKLY REPORT
// ─────────────────────────────────────────────────────────────────────────────

bot.onText(/\/weeklyreport/, async (msg) => {
  const chatId = msg.chat.id;
  const store = readStore();

  if (!store) {
    bot.sendMessage(chatId, "\u26A0\u{FE0F} No data file found. Please export data from QA Hub first.");
    return;
  }

  const user = findUserByChatId(store, chatId);
  if (!user) {
    bot.sendMessage(chatId,
      "\u274C Your Telegram Chat ID is not registered in QA Hub.\nContact your admin to add it."
    );
    return;
  }
  if (!["admin","superadmin","lead"].includes(user.role)) {
    bot.sendMessage(chatId, "\u274C Weekly reports are available for Admin and Lead roles only.");
    return;
  }

  const { from, to } = getThisWeekRange();
  const allEntries = store.dataEntries || [];
  const allDefects = store.defects || [];

  // Scope by project for admin/lead
  const scopedEntries = user.role === "superadmin"
    ? allEntries
    : allEntries.filter(e => e.projectId === user.projectId);
  const scopedDefects = user.role === "superadmin"
    ? allDefects
    : allDefects.filter(d => d.projectId === user.projectId);

  const weekEntries = filterByDateRange(scopedEntries, from, to);
  const weekDefects = filterByDateRange(scopedDefects, from, to);
  const m = computeMetrics(weekEntries, weekDefects);

  const projectName = user.role === "superadmin"
    ? "All Projects"
    : (store.projects || []).find(p => p.id === user.projectId)?.name || "Your Project";

  const message =
    `\u{1F4CA} <b>QA Hub — Weekly Report</b>\n` +
    `\u{1F4C5} ${getCurrentWeekRange()}\n` +
    `\u{1F4C1} ${projectName}\n\n` +
    `\u{2501}\u{2501}\u{2501}\u{2501}\u{2501}\u{2501}\u{2501}\u{2501}\u{2501}\u{2501}\u{2501}\u{2501}\u{2501}\u{2501}\u{2501}\u{2501}\u{2501}\u{2501}\u{2501}\u{2501}\u{2501}\n` +
    `\u{1F4CB} <b>TESTING</b>\n` +
    `TC Created:      ${m.tcCreated}\n` +
    `TC Executed:     ${m.tcExecuted}\n` +
    `TC Passed:       ${m.tcPassed} \u2705\n` +
    `TC Failed:       ${m.tcFailed} \u274C\n` +
    `Pass Rate:       ${m.passRate}%\n\n` +
    `\u{1F41B} <b>DEFECTS</b>\n` +
    `Total Raised:    ${m.totalDefects}\n` +
    `SIT Misses:      ${m.sitMisses} (${m.sitRate}%)\n` +
    `P1: ${m.p1}   P2: ${m.p2}   P3: ${m.p3}\n\n` +
    `\u{1F534} <b>OPEN DEFECTS</b>\n` +
    `P1: ${m.openP1}  P2: ${m.openP2}  P3: ${m.openP3}\n` +
    `Total Open: ${m.openDefects}\n` +
    `\u{2501}\u{2501}\u{2501}\u{2501}\u{2501}\u{2501}\u{2501}\u{2501}\u{2501}\u{2501}\u{2501}\u{2501}\u{2501}\u{2501}\u{2501}\u{2501}\u{2501}\u{2501}\u{2501}\u{2501}\u{2501}\n` +
    `\u{1F310} ${process.env.APP_URL}\n` +
    `\u2014 QA Hub \u{1F916}`;

  bot.sendMessage(chatId, message, { parse_mode: "HTML" });
});

// ─────────────────────────────────────────────────────────────────────────────
// MONTHLY REPORT
// ─────────────────────────────────────────────────────────────────────────────

bot.onText(/\/monthlyreport/, async (msg) => {
  const chatId = msg.chat.id;
  const store = readStore();

  if (!store) {
    bot.sendMessage(chatId, "\u26A0\u{FE0F} No data file found. Please export data from QA Hub first.");
    return;
  }

  const user = findUserByChatId(store, chatId);
  if (!user) {
    bot.sendMessage(chatId,
      "\u274C Your Telegram Chat ID is not registered in QA Hub.\nContact your admin to add it."
    );
    return;
  }
  if (!["admin","superadmin","lead"].includes(user.role)) {
    bot.sendMessage(chatId, "\u274C Monthly reports are available for Admin and Lead roles only.");
    return;
  }

  const { from, to } = getThisMonthRange();
  const allEntries = store.dataEntries || [];
  const allDefects = store.defects || [];

  const scopedEntries = user.role === "superadmin"
    ? allEntries
    : allEntries.filter(e => e.projectId === user.projectId);
  const scopedDefects = user.role === "superadmin"
    ? allDefects
    : allDefects.filter(d => d.projectId === user.projectId);

  const monthEntries = filterByDateRange(scopedEntries, from, to);
  const monthDefects = filterByDateRange(scopedDefects, from, to);
  const m = computeMetrics(monthEntries, monthDefects);

  const failRate = m.tcExecuted
    ? Math.round(m.tcFailed / m.tcExecuted * 100) : 0;
  const resolved = monthDefects.filter(d =>
    ["Resolved","Closed"].includes(d.status)).length;

  const releaseEntries = filterByDateRange(
    (store.releaseEntries || []).filter(r =>
      user.role === "superadmin" || r.projectId === user.projectId
    ), from, to
  );
  const prodReleases = releaseEntries.filter(r => r.prodReleaseDate).length;
  const betaReleases = releaseEntries.filter(r => r.betaDate).length;

  const projectName = user.role === "superadmin"
    ? "All Projects"
    : (store.projects || []).find(p => p.id === user.projectId)?.name || "Your Project";

  const message =
    `\u{1F4C5} <b>QA Hub — Monthly Report</b>\n` +
    `\u{1F5D3}\u{FE0F} ${getCurrentMonthName()}\n` +
    `\u{1F4C1} ${projectName}\n\n` +
    `\u{2501}\u{2501}\u{2501}\u{2501}\u{2501}\u{2501}\u{2501}\u{2501}\u{2501}\u{2501}\u{2501}\u{2501}\u{2501}\u{2501}\u{2501}\u{2501}\u{2501}\u{2501}\u{2501}\u{2501}\u{2501}\n` +
    `\u{1F4CB} <b>TESTING</b>\n` +
    `TC Created:      ${m.tcCreated}\n` +
    `TC Executed:     ${m.tcExecuted}\n` +
    `TC Passed:       ${m.tcPassed} \u2705\n` +
    `TC Failed:       ${m.tcFailed} \u274C\n` +
    `Pass Rate:       ${m.passRate}%\n` +
    `Fail Rate:       ${failRate}%\n\n` +
    `\u{1F41B} <b>DEFECTS</b>\n` +
    `Total:           ${m.totalDefects}\n` +
    `SIT Misses:      ${m.sitMisses} (${m.sitRate}%)\n` +
    `P1: ${m.p1}   P2: ${m.p2}   P3: ${m.p3}\n` +
    `Resolved:        ${resolved}\n` +
    `Still Open:      ${m.openDefects}\n\n` +
    `\u{1F680} <b>RELEASES</b>\n` +
    `Logged:          ${releaseEntries.length}\n` +
    `PROD:            ${prodReleases}\n` +
    `Beta:            ${betaReleases}\n` +
    `\u{2501}\u{2501}\u{2501}\u{2501}\u{2501}\u{2501}\u{2501}\u{2501}\u{2501}\u{2501}\u{2501}\u{2501}\u{2501}\u{2501}\u{2501}\u{2501}\u{2501}\u{2501}\u{2501}\u{2501}\u{2501}\n` +
    `\u{1F310} ${process.env.APP_URL}\n` +
    `\u2014 QA Hub \u{1F916}`;

  bot.sendMessage(chatId, message, { parse_mode: "HTML" });
});

// ─────────────────────────────────────────────────────────────────────────────
// HANDLE CONVERSATION STEPS (forgot password flow)
// ─────────────────────────────────────────────────────────────────────────────

bot.on("message", async (msg) => {
  const chatId = msg.chat.id;
  const text = (msg.text || "").trim();

  // Skip if it is a command
  if (text.startsWith("/")) return;

  const conv = conversations[chatId];
  if (!conv) return;

  const store = readStore();
  if (!store) {
    bot.sendMessage(chatId, "\u26A0\u{FE0F} Data file not found. Ask admin to export data from QA Hub.");
    delete conversations[chatId];
    return;
  }

  // ── Step 1: received username ─────────────────────────────────────────────
  if (conv.step === "awaiting_username") {
    const username = text.toLowerCase().trim();
    const user = (store.users || []).find(
      u => u.username.toLowerCase() === username
    );

    if (!user) {
      bot.sendMessage(chatId,
        `\u274C Username <code>${text}</code> not found.\n\nPlease check and try /forgotpassword again.`,
        { parse_mode: "HTML" }
      );
      delete conversations[chatId];
      return;
    }

    // Verify this person owns this chat ID
    if (user.telegramChatId && user.telegramChatId !== String(chatId)) {
      bot.sendMessage(chatId,
        `\u274C This Telegram account is not linked to that username.\n` +
        `Contact your admin to reset your password.`
      );
      delete conversations[chatId];
      return;
    }

    conv.data.user = user;
    conv.step = "confirm_reset";

    bot.sendMessage(chatId,
      `\u2705 Found account: <b>${user.username}</b> (${user.role})\n\n` +
      `Are you sure you want to reset your password?\n\n` +
      `Reply <b>YES</b> to confirm or <b>NO</b> to cancel.`,
      { parse_mode: "HTML" }
    );
    return;
  }

  // ── Step 2: confirmation ──────────────────────────────────────────────────
  if (conv.step === "confirm_reset") {
    if (text.toUpperCase() === "NO") {
      bot.sendMessage(chatId, "\u274C Password reset cancelled.");
      delete conversations[chatId];
      return;
    }

    if (text.toUpperCase() !== "YES") {
      bot.sendMessage(chatId, `Please reply with <b>YES</b> or <b>NO</b>.`, { parse_mode: "HTML" });
      return;
    }

    const user = conv.data.user;
    const newPassword = generateStrongPassword();
    const hashedPassword = hashPassword(newPassword);

    // Write pending update so app can sync it back
    writePendingUpdate({
      type: "passwordReset",
      userId: user.id,
      hashedPassword,
      mustChangePassword: true
    });

    // Send email if user has email and EmailJS is configured
    let emailSent = false;
    if (user.email && process.env.EMAILJS_SERVICE_ID) {
      emailSent = await sendEmailJS(
        process.env.EMAILJS_TEMPLATE_ID_WELCOME,
        {
          to_email: user.email,
          to_name: user.username,
          username: user.username,
          temp_password: newPassword,
          role: user.role,
          project: "See QA Hub",
          squad: "See QA Hub",
          role_summary: "Your password has been reset.",
          first_steps: "1. Login with the new password above\n2. Change it immediately after login",
          login_instructions: `Login at ${process.env.APP_URL}`,
          app_url: process.env.APP_URL,
          sender_name: "QA Hub",
          reply_to: ""
        }
      );
    }

    // Always send new password via Telegram DM
    const resetTime = new Date().toLocaleTimeString("en-US", {
      hour: "numeric", minute: "2-digit", hour12: true,
      day: "2-digit", month: "short", year: "numeric"
    });

    bot.sendMessage(chatId,
      `\u{1F504} <b>Password Reset Successful</b>\n\n` +
      `\u{2501}\u{2501}\u{2501}\u{2501}\u{2501}\u{2501}\u{2501}\u{2501}\u{2501}\u{2501}\u{2501}\u{2501}\u{2501}\u{2501}\u{2501}\u{2501}\u{2501}\u{2501}\u{2501}\u{2501}\u{2501}\n` +
      `\u{1F464} Username: <code>${user.username}</code>\n` +
      `\u{1F511} New Password: <code>${newPassword}</code>\n` +
      `\u{1F550} Reset at: ${resetTime}\n` +
      `\u{2501}\u{2501}\u{2501}\u{2501}\u{2501}\u{2501}\u{2501}\u{2501}\u{2501}\u{2501}\u{2501}\u{2501}\u{2501}\u{2501}\u{2501}\u{2501}\u{2501}\u{2501}\u{2501}\u{2501}\u{2501}\n\n` +
      `1\u{FE0F}\u{20E3} Login at ${process.env.APP_URL}\n` +
      `2\u{FE0F}\u{20E3} Change your password after login\n\n` +
      (emailSent ? `\u{1F4E7} Password also sent to your email.\n\n` : ``) +
      `\u26A0\u{FE0F} <i>Please ask your admin to sync bot updates in QA Hub.</i>\n\n` +
      `\u2014 QA Hub \u{1F916}`,
      { parse_mode: "HTML" }
    );

    delete conversations[chatId];
    return;
  }
});

// ─────────────────────────────────────────────────────────────────────────────
console.log("\u2705 QA Hub Bot is running...");
console.log("\u{1F4C2} Reading data from:", DATA_FILE);
console.log("\u{1F4DD} Writing updates to:", UPDATES_FILE);
console.log("\nAvailable commands:");
console.log("  /start, /help, /forgotpassword, /weeklyreport, /monthlyreport");
console.log("\nPress Ctrl+C to stop.\n");
