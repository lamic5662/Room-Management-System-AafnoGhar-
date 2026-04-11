const RATE_WINDOW_MS = 60 * 1000;
const RATE_MAX = 20;
const rateBuckets = new Map();

const cleanBucket = (bucket, now) => bucket.filter((t) => now - t < RATE_WINDOW_MS);

const allowRequest = (key) => {
  const now = Date.now();
  const bucket = cleanBucket(rateBuckets.get(key) || [], now);
  if (bucket.length >= RATE_MAX) {
    rateBuckets.set(key, bucket);
    return false;
  }
  bucket.push(now);
  rateBuckets.set(key, bucket);
  return true;
};

const MAX_MESSAGE_CHARS = 1200;
const MAX_HISTORY = 10;

const systemPrompt = `
You are AafnoGhar Assistant for a room rental platform in Nepal.
Be concise, practical, and accurate. Ask clarifying questions when needed.
Do not request or expose sensitive data (passwords, OTPs, card numbers).
If asked for actions you cannot do, explain the steps in the app instead.
If a request is illegal or unsafe, refuse politely.
Avoid external links; if needed, reference in-app routes like /rooms or /tenant/agreements.
`.trim();

const FAQ = [
  {
    keywords: ["post", "add", "room", "owner"],
    answer: "Owners can post rooms from /owner/add-room. Fill all fields, add photos, then submit.",
  },
  {
    keywords: ["request", "send", "tenant"],
    answer: "Tenants can send a request from a room details page. Owners review it and can create an agreement.",
  },
  {
    keywords: ["agreement", "sign", "signature"],
    answer: "Both owner and tenant must sign the agreement before payments are allowed.",
  },
  {
    keywords: ["pay", "rent", "monthly"],
    answer: "Tenants pay monthly rent from /tenant/agreements. The owner confirms the payment.",
  },
  {
    keywords: ["electricity", "units", "rate"],
    answer: "Electricity is added during monthly payment. Enter units and rate to calculate the amount.",
  },
  {
    keywords: ["exit", "leave", "settlement"],
    answer: "Use /tenant/exits to request exit. Owner reviews and sends settlement if needed.",
  },
  {
    keywords: ["kyc", "verify"],
    answer: "Owners and tenants complete KYC to unlock full features. Go to your dashboard KYC section.",
  },
  {
    keywords: ["complaint", "issue"],
    answer: "Complaints can be created from /tenant/complaints or /owner/complaints.",
  },
  {
    keywords: ["offer", "counter"],
    answer: "Tenants can make offers; owners can counter. Track offers in the dashboard.",
  },
];

const normalizeHistory = (history = []) => {
  if (!Array.isArray(history)) return [];
  return history
    .filter((m) => m && typeof m === "object")
    .map((m) => ({
      role: m.role === "assistant" ? "assistant" : "user",
      content: String(m.content || "").slice(0, MAX_MESSAGE_CHARS),
    }))
    .filter((m) => m.content.trim().length > 0)
    .slice(-MAX_HISTORY);
};

const matchFAQ = (message) => {
  const text = message.toLowerCase();
  let best = null;
  let bestScore = 0;
  for (const item of FAQ) {
    let score = 0;
    for (const k of item.keywords) {
      if (text.includes(k)) score += 1;
    }
    if (score > bestScore) {
      bestScore = score;
      best = item;
    }
  }
  return bestScore >= 2 ? best?.answer : null;
};

const callOllama = async ({ messages }) => {
  const url = process.env.OLLAMA_URL || "http://localhost:11434/api/chat";
  const model = process.env.OLLAMA_MODEL || "llama3.1";
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model,
      messages,
      stream: false,
      options: { temperature: 0.2 },
    }),
  });
  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    throw new Error(`Ollama error: ${res.status} ${txt}`.trim());
  }
  const data = await res.json();
  const reply = data?.message?.content || data?.response || "";
  return String(reply || "").trim();
};

const chatReply = async (req, res) => {
  try {
    const ip =
      (req.headers["x-forwarded-for"] || "").toString().split(",")[0].trim() ||
      req.ip ||
      "unknown";
    if (!allowRequest(ip)) {
      return res.status(429).json({ message: "Too many requests. Please wait a minute." });
    }

    const message = String(req.body?.message || "").trim();
    if (!message) {
      return res.status(400).json({ message: "message is required" });
    }
    if (message.length > MAX_MESSAGE_CHARS) {
      return res.status(400).json({ message: `message must be <= ${MAX_MESSAGE_CHARS} chars` });
    }

    const history = normalizeHistory(req.body?.history);
    const role = String(req.body?.userRole || "").trim();
    const roleNote = role ? `User role: ${role}.` : "";

    const input = [
      { role: "system", content: `${systemPrompt} ${roleNote}`.trim() },
      ...history,
      { role: "user", content: message },
    ];
    const provider = (process.env.CHAT_PROVIDER || "ollama").toLowerCase();

    if (provider !== "faq") {
      try {
        const reply = await callOllama({ messages: input });
        if (reply) return res.json({ reply });
      } catch (err) {
        console.log("Ollama error:", err?.message || err);
      }
    }

    const faq = matchFAQ(message);
    if (faq) return res.json({ reply: faq });

    return res.status(503).json({
      message: "Chat service is offline. Install Ollama and run a local model (e.g., `ollama run llama3.1`).",
    });
  } catch (err) {
    console.log("Chat error:", err?.message || err);
    return res.status(500).json({ message: "Chat service error" });
  }
};

export { chatReply };
