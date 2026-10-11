const express = require("express");
const axios = require("axios");
const app = express();
app.use(express.json());

// --- ENV ---
const VERIFY_TOKEN = process.env.VERIFY_TOKEN || "Velora321";
const PAGE_TOKEN = process.env.PAGE_TOKEN;
const PAGE_ID = process.env.PAGE_ID;
const IG_ID = process.env.IG_ID;
const GROQ_API_KEY = process.env.GROQ_API_KEY;
const GRAPH_VERSION = process.env.GRAPH_VERSION || "v26.0";
const GRAPH_BASE = `https://graph.facebook.com/${GRAPH_VERSION}`;

// --- AI REPLY ---
async function getAIReply(userText) {
  if (!GROQ_API_KEY) return "Hi! Velora Bot e swagotom! Kivabe help korte pari?";
  const systemPrompt = `
You are Velora Bots assistant. Reply calm, smart, short. Mix Bangla + English (Banglish).
Our Services:
- Normal Bot: Manual 24/7 chatbot, Auto customer service. Price 999TK first, 500TK monthly
- Pro Bot: 24/7 AI Auto Reply, Pro Customer service, Easy data usage. Price 1499TK first, 800TK monthly
- Elite Bot: 24/7 AI Auto Reply, Auto Post scheduling, Auto comment, Disable Hate speech, Elite service. Price 1999TK first, 1500TK monthly
Links: FB - https://www.facebook.com/profile.php?id=61594707113065, WhatsApp - 01644155941
Always try to sell Elite first. Keep reply under 30 words.
  `.trim();
  try {
    const r = await axios.post("https://api.groq.com/openai/v1/chat/completions", {
      model: "llama-3.3-70b-versatile",
      messages: [{ role: "system", content: systemPrompt }, { role: "user", content: userText }]
    }, { headers: { Authorization: `Bearer ${GROQ_API_KEY}`, "Content-Type": "application/json" } });
    return r.data.choices[0].message.content;
  } catch (e) {
    console.log("Groq Error", e.response?.data);
    return "Velora Bots e swagotom! Normal 999TK, Pro 1499TK, Elite 1999TK. Details lagle bolun.";
  }
}

// --- GRAPH API HELPER ---
async function apiPost(path, body) {
  try {
    const res = await axios.post(`${GRAPH_BASE}/${path}`, body, { params: { access_token: PAGE_TOKEN } });
    return res.data;
  } catch (err) { console.log("POST FAIL", path, err.response?.data?.error); return null; }
}
async function apiGet(path) {
  try {
    const res = await axios.get(`${GRAPH_BASE}/${path}`, { params: { access_token: PAGE_TOKEN } });
    return res.data;
  } catch (err) { console.log("GET FAIL", err.response?.data?.error); return null; }
}

// --- BAD WORDS FOR AUTO HIDE ---
const BAD_WORDS = ["madarchod", "bainchod", "bal", "bokachoda", "mc", "bc", "fuck", "bitch", "gali", "chud"];

function isAbusive(text) {
  if (!text) return false;
  const lower = text.toLowerCase();
  return BAD_WORDS.some(w => lower.includes(w));
}

// --- ROUTES ---
app.get("/", (req, res) => res.send("Velora Bots Elite v26.0 Running ✅ - All 6 Features Active"));

app.get("/webhook", (req, res) => {
  if (req.query["hub.verify_token"] === VERIFY_TOKEN) res.send(req.query["hub.challenge"]);
  else res.sendStatus(403);
});

app.post("/webhook", async (req, res) => {
  try {
    const entry = req.body.entry?.[0];
    const changes = entry?.changes?.[0];
    const messaging = entry?.messaging?.[0];

    // 1. AUTO DM REPLY (Messenger + Instagram DM)
    if (messaging && messaging.message &&!messaging.message.is_echo) {
      const senderId = messaging.sender.id;
      const userText = messaging.message.text;
      if (userText) {
        const aiText = await getAIReply(userText);
        await apiPost(`${PAGE_ID}/messages`, {
          recipient: { id: senderId },
          message: { text: aiText }
        });
      }
    }

    // 2 & 3. AUTO COMMENT REPLY + AUTO HIDE
    if (changes && changes.field === "comments" && changes.value) {
      const commentId = changes.value.id || changes.value.comment_id;
      const commentText = changes.value.text || changes.value.message || "";
      const mediaId = changes.value.media?.id || changes.value.post_id;

      if (isAbusive(commentText)) {
        // Hide abusive comment
        await apiPost(`${commentId}`, { hide: true });
        console.log("Hidden abusive comment:", commentId);
      } else if (commentId) {
        // Normal comment reply
        const aiReply = await getAIReply(commentText);
        await apiPost(`${commentId}/replies`, { message: aiReply });
      }
    }

    // 4. STORY MENTION AUTO REPLY
    if (changes && changes.field === "mentions" && changes.value) {
      const senderId = changes.value.from?.id;
      if (senderId) {
        await apiPost(`${PAGE_ID}/messages`, {
          recipient: { id: senderId },
          message: { text: "Thanks for mentioning us in your story! ❤️ Follow our page for Elite Bot services - Velora Bots" }
        });
      }
    }

    // 5. FOLLOWER WELCOME (Note: IG webhook for follows is limited, this handles if event comes)
    if (changes && changes.field === "follows" && changes.value) {
      const followerId = changes.value.from?.id;
      if (followerId) {
        await apiPost(`${PAGE_ID}/messages`, {
          recipient: { id: followerId },
          message: { text: "Welcome to Velora Bots! 🎉 Thanks for following. Elite Bot 1999TK only. DM for details!" }
        });
      }
    }

  } catch (e) { console.log("Webhook Error", e.message); }
  res.sendStatus(200);
});

// 6. AUTO POST (Image) - /post-now?image_url=LINK&caption=TEXT
app.get("/post-now", async (req, res) => {
  const { image_url, caption } = req.query;
  if (!image_url) return res.status(400).send("image_url lagbe");
  const container = await apiPost(`${IG_ID}/media`, { image_url, caption: caption || "Velora Bots Elite 🔥" });
  if (!container?.id) return res.status(500).send("Container failed - check token & public image url");
  await new Promise(r => setTimeout(r, 6000));
  const pub = await apiPost(`${IG_ID}/media_publish`, { creation_id: container.id });
  res.send(pub?.id? `✅ Image Posted: ${pub.id}` : "❌ Publish Failed");
});

// 6b. AUTO REEL POST - /reel-now?video_url=LINK&caption=TEXT
app.get("/reel-now", async (req, res) => {
  const { video_url, caption } = req.query;
  if (!video_url) return res.status(400).send("video_url lagbe");
  const container = await apiPost(`${IG_ID}/media`, {
    media_type: "REELS",
    video_url,
    caption: caption || "Velora Bots Elite Reel 🔥"
  });
  if (!container?.id) return res.status(500).send("Reel container failed");
  // Reel takes longer to process
  await new Promise(r => setTimeout(r, 30000));
  const pub = await apiPost(`${IG_ID}/media_publish`, { creation_id: container.id });
  res.send(pub?.id? `✅ Reel Posted: ${pub.id}` : "❌ Reel Publish Failed - wait 1 min & try again");
});

// Simple schedule check endpoint
app.get("/schedule-post", (req, res) => {
  res.send("Use cron-job.org -> Call https://your-app.onrender.com/post-now?image_url=... every day");
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log(`Velora Bots Elite Running on ${PORT}`));
