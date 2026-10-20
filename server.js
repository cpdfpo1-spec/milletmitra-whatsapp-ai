
const express = require("express");

const app = express();
app.use(express.json({ limit: "2mb" }));

const PORT = process.env.PORT || 3000;

const {
  VERIFY_TOKEN,
  WHATSAPP_TOKEN,
  PHONE_NUMBER_ID,
  OPENAI_API_KEY,
  GRAPH_API_VERSION
} = process.env;

const GRAPH_VERSION = GRAPH_API_VERSION || "v23.0";

// Health check
app.get("/", (req, res) => {
  res.send("MilletMitra AI WhatsApp Backend is running.");
});

// Meta webhook verification
app.get("/webhook", (req, res) => {
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];

  if (mode === "subscribe" && token === VERIFY_TOKEN) {
    return res.status(200).send(challenge);
  }

  return res.sendStatus(403);
});

// Generate agricultural advice using AI
async function getAIAdvice(message) {
  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${OPENAI_API_KEY}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: "gpt-4.1-mini",
      instructions: `
You are MilletMitra AI, an agricultural advisory assistant
for millet farmers in Bundelkhand, India.

Reply in simple Hindi or Bundeli, matching the farmer's language.
Ask follow-up questions when crop, crop age, location or symptoms
are missing. Do not confidently diagnose a disease or prescribe
pesticides without enough information. Give safe, practical next
steps. Never claim to have live weather or mandi data unless supplied.
Keep WhatsApp replies concise.
`,
      input: message,
      max_output_tokens: 350
    })
  });

  const data = await response.json();

  if (!response.ok) {
    console.error("AI API error:", JSON.stringify(data));
    throw new Error("AI response failed");
  }

  const answer = (data.output || [])
    .flatMap(item => item.content || [])
    .filter(item => item.type === "output_text")
    .map(item => item.text)
    .join("\n")
    .trim();

  if (!answer) throw new Error("Empty AI response");

  return answer;
}

// Send reply through WhatsApp Cloud API
async function sendWhatsAppMessage(to, message) {
  const response = await fetch(
    `https://graph.facebook.com/${GRAPH_VERSION}/${PHONE_NUMBER_ID}/messages`,
    {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${WHATSAPP_TOKEN}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        recipient_type: "individual",
        to,
        type: "text",
        text: { body: message }
      })
    }
  );

  const data = await response.json();

  if (!response.ok) {
    console.error("WhatsApp send error:", JSON.stringify(data));
    throw new Error("WhatsApp message send failed");
  }

  console.log("WhatsApp reply accepted:", data.messages?.[0]?.id);
}

// Receive WhatsApp messages
app.post("/webhook", (req, res) => {
  // Acknowledge Meta promptly
  res.sendStatus(200);

  processIncomingMessages(req.body).catch(error => {
    console.error("Webhook processing error:", error.message);
  });
});

async function processIncomingMessages(body) {
  const entries = body.entry || [];

  for (const entry of entries) {
    for (const change of entry.changes || []) {
      const value = change.value || {};

      for (const message of value.messages || []) {
        // First version: text messages only
        if (message.type !== "text" || !message.text?.body) {
          continue;
        }

        const sender = message.from;
        const text = message.text.body.trim();

        if (!sender || !text) continue;

        console.log("Incoming farmer message:", sender, text);

        try {
          const answer = await getAIAdvice(text);
          await sendWhatsAppMessage(sender, answer);
        } catch (error) {
          console.error("Reply failed:", error.message);

          // Do not expose internal errors or API credentials
          try {
            await sendWhatsAppMessage(
              sender,
              "क्षमा करें, अभी सलाह तैयार नहीं हो सकी। कृपया कुछ देर बाद फिर प्रयास करें।"
            );
          } catch (sendError) {
            console.error("Fallback reply failed:", sendError.message);
          }
        }
      }
    }
  }
}

app.listen(PORT, () => {
  console.log(`MilletMitra AI server running on port ${PORT}`);
});
