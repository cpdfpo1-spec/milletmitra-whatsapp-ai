
const express = require("express");

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3000;

app.get("/", (req, res) => {
  res.send("MilletMitra AI WhatsApp Backend is running.");
});

// Meta webhook verification
app.get("/webhook", (req, res) => {
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];

  if (
    mode === "subscribe" &&
    token &&
    token === process.env.VERIFY_TOKEN
  ) {
    return res.status(200).send(challenge);
  }

  return res.sendStatus(403);
});

// Receive message and send a test reply
app.post("/webhook", async (req, res) => {
  // Acknowledge Meta immediately
  res.sendStatus(200);

  try {
    const value = req.body?.entry?.[0]?.changes?.[0]?.value;
    const message = value?.messages?.[0];

    if (!message || !message.from) return;

    const from = message.from;
    const text = message.text?.body || "";

    console.log("Incoming WhatsApp message:", text);

    const response = await fetch(
      `https://graph.facebook.com/v26.0/${process.env.PHONE_NUMBER_ID}/messages`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${process.env.WHATSAPP_TOKEN}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          messaging_product: "whatsapp",
          recipient_type: "individual",
          to: from,
          type: "text",
          text: {
            body: "नमस्ते! MilletMitra AI में आपका स्वागत है। 🌾 आपका संदेश मिल गया है। जल्द ही कृषि सलाह सेवा उपलब्ध होगी।"
          }
        })
      }
    );

    const result = await response.json();
    console.log("WhatsApp send status:", response.status, result);
  } catch (error) {
    console.error("WhatsApp reply error:", error.message);
  }
});

app.listen(PORT, () => {
  console.log(`MilletMitra AI server running on port ${PORT}`);
});
