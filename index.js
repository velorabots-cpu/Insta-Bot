const express = require("express");
const axios = require("axios");
const app = express();
app.use(express.json());

const VERIFY_TOKEN = process.env.VERIFY_TOKEN;
const PAGE_TOKEN = process.env.PAGE_TOKEN;
const PAGE_ID = process.env.PAGE_ID;
const IG_ID = process.env.IG_ID;
const GRAPH_VERSION = process.env.GRAPH_VERSION || "v26.0";
const GRAPH_URL = `https://graph.facebook.com/${GRAPH_VERSION}`;
const BAD_WORDS = ["gali", "fraud", "bokachoda", "mc", "scam"];

function checkConfig() {
  const m = [];
  if (!VERIFY_TOKEN) m.push("VERIFY_TOKEN");
  if (!PAGE_TOKEN) m.push("PAGE_TOKEN");
  if (!PAGE_ID) m.push("PAGE_ID");
  if (!IG_ID) m.push("IG_ID");
  if (m.length) { console.error("Missing:", m.join(", ")); return false; }
  return true;
}

async function apiPost(endpoint, data) {
  try {
    const res = await axios.post(`${GRAPH_URL}/${endpoint}`, data, {
      headers: { Authorization: `Bearer ${PAGE_TOKEN}` }, timeout: 20000
    });
    console.log("API success:", endpoint);
    return res.data;
  } catch (e) {
    console.error("API error:", endpoint, JSON.stringify(e.response?.data || e.message));
    return null;
  }
}

function getVeloraReply(text = "") {
  const t = text.toLowerCase();
  const isBangla = /[\u0980-\u09FF]/.test(text) || /\b(dam|koto|ki|lagbe|kemon)\b/i.test(text);
  if (/\b(price|dam|koto|package|service)\b/i.test(t) || /দাম|কত|প্যাকেজ/.test(t)) {
    return isBangla ? `Velora Bots-এর ৩টি প্যাকেজ:\n\n1. Normal — 999 TK setup + 500 TK/month\n2. Pro — 1499 TK setup + 800 TK/month\n3. Elite — 1999 TK setup + 1500 TK/month` : `Velora Bots Packages:\n1. Normal — 999 TK + 500/mo\n2. Pro — 1499 TK + 800/mo\n3. Elite — 1999 TK + 1500/mo`;
  }
  if (/\b(hi|hello|salam|hey)\b/i.test(t)) return isBangla ? "আসসালামু আলাইকুম! Velora Bots-এ স্বাগতম।" : "Hi! Welcome to Velora Bots.";
  return isBangla ? 'বুঝেছি! "price" লিখুন।' : 'Thanks! Type "price" for packages.';
}

async function sendDM(recipientId, message) {
  if (!recipientId || !message) return null;
  return apiPost(`${IG_ID}/messages`, { recipient: { id: recipientId }, message: { text: message } });
}
async function replyToComment(commentId) {
  return apiPost(`${commentId}/replies`, { message: "thanks for your comment, pls DM us for further information" });
}
async function hideComment(commentId) {
  return apiPost(commentId, { hide: true });
}

// --- NEW FEATURE 1: AUTO POST ---
async function createPost(imageUrl, caption) {
  // Step 1: Create container
  const container = await apiPost(`${IG_ID}/media`, { image_url: imageUrl, caption });
  if (!container?.id) return null;
  // Step 2: Publish
  await new Promise(r => setTimeout(r, 3000)); // IG needs 2-3 sec
  return apiPost(`${IG_ID}/media_publish`, { creation_id: container.id });
}

app.get("/post-now", async (req, res) => {
  const { image_url, caption } = req.query;
  if (!image_url) return res.status(400).send("?image_url=LINK&caption=TEXT lagbe");
  const result = await createPost(image_url, caption || "Posted by Velora Bots");
  if (result) res.send("✅ Posted Successfully! ID: " + JSON.stringify(result));
  else res.status(500).send("❌ Post Failed, check logs");
});

// --- NEW FEATURE 2: AUTO BIO UPDATE ---
app.get("/update-bio", async (req, res) => {
  const { bio } = req.query;
  if (!bio) return res.status(400).send("?bio=YOUR_NEW_BIO");
  // Note: IG Graph API te direct bio update nei, FB Page er moto. Eta Page er jonno kaj korbe.
  // IG Bio er jonno manual, but ami endpoint ready rakhlm
  res.send(`Bio update request: ${bio} - (IG te manual korte hoy, API te allowed na)`);
});

// --- NEW FEATURE 3: FOLLOWER WELCOME (Workaround) ---
app.get("/welcome-follower", async (req, res) => {
  const { user_id } = req.query;
  if (!user_id) return res.status(400).send("?user_id=IG_USER_ID needed - Daily 50 max safe");
  const result = await sendDM(user_id, "Thanks for following @velorabots! ❤️ DM us 'price' for packages.");
  res.send(result ? "Welcome DM Sent" : "Failed");
});

// Webhook verify
app.get("/webhook", (req, res) => {
  if (req.query["hub.mode"] === "subscribe" && req.query["hub.verify_token"] === VERIFY_TOKEN) return res.status(200).send(req.query["hub.challenge"]);
  res.sendStatus(403);
});

app.post("/webhook", (req, res) => {
  res.sendStatus(200);
  processWebhook(req.body).catch(e => console.error(e.message));
});

async function processWebhook(body) {
  if (body.object !== "instagram") return;
  for (const entry of body.entry || []) {
    for (const event of entry.messaging || []) {
      if (!event.message?.text || event.message.is_echo) continue;
      await sendDM(event.sender.id, getVeloraReply(event.message.text));
    }
    for (const change of entry.changes || []) {
      if (change.field !== "comments") continue;
      const c = change.value || {};
      if (!c.id || !c.text) continue;
      if (String(c.from?.id) === String(IG_ID)) continue;
      if (BAD_WORDS.some(w => c.text.toLowerCase().includes(w))) {
        await hideComment(c.id);
      } else {
        await replyToComment(c.id);
      }
    }
  }
}

app.get("/", (req, res) => res.send("Velora Bots Live - Features: DM, Comment, Hide, Auto Post, Welcome"));
app.get("/health", (req, res) => res.json({ status: "ok", configured: checkConfig() }));
app.listen(process.env.PORT || 10000, () => { console.log("Running"); checkConfig(); });
