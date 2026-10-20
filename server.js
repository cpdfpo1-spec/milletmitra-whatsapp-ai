
const express = require("express");

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3000;
const GRAPH_VERSION = "v26.0";

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
    token === process.env.VERIFY_TOKEN
  ) {
    return res.status(200).send(challenge);
  }

  return res.sendStatus(403);
});

// Gemini AI: agricultural advice in simple Hindi/Bundeli
async function getAIReply(question) {
  const prompt = `
आप MilletMitra AI हैं, बुंदेलखंड के किसानों के कृषि सलाह सहायक।

किसान को सरल हिंदी में उत्तर दें और जरूरत पर आसान बुंदेली शब्दों का उपयोग करें।

जरूरत के अनुसार पूछें:
- जिला और गाँव
- फसल और फसल की उम्र
- लक्षण कब से हैं
- सिंचाई की स्थिति
- हाल में डाली गई खाद या दवा

अपर्याप्त जानकारी पर बीमारी या दवा निश्चित न बताएं।
सुरक्षित और व्यावहारिक अगले कदम बताएं।
बिना पर्याप्त जानकारी के दवा की मात्रा न गढ़ें।
उत्तर संक्षिप्त और किसान के लिए उपयोगी रखें।

किसान का संदेश:
${question}
`;

  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey) {
    throw new Error("GEMINI_API_KEY is missing in Render Environment");
  }

  const response = await fetch(
    "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions",
    {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: "gemini-3.8-flash",
        messages: [
          {
            role: "user",
            content: prompt
          }
        ],
        max_tokens: 500
      })
    }
  );

  const data = await response.json();

  if (!response.ok) {
    console.error("Gemini API error:", response.status, data);
    throw new Error("Gemini response failed");
  }

  const answer =
    data.choices?.[0]?.message?.content?.trim();

  return answer ||
    "कृपया अपनी फसल और समस्या की जानकारी दोबारा भेजें।";
}

// Send WhatsApp text reply
async function sendWhatsAppReply(to, body) {
  const response = await fetch(
    `https://graph.facebook.com/${GRAPH_VERSION}/${process.env.PHONE_NUMBER_ID}/messages`,
    {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${process.env.WHATSAPP_TOKEN}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        recipient_type: "individual",
        to,
        type: "text",
        text: { body }
      })
    }
  );

  const result = await response.json();

  console.log("WhatsApp send result:", response.status, result);

  if (!response.ok) {
    throw new Error("WhatsApp message sending failed");
  }
}

// Receive incoming WhatsApp messages
app.post("/webhook", (req, res) => {
  // Acknowledge Meta immediately
  res.sendStatus(200);

  (async () => {
    try {
      const value =
        req.body?.entry?.[0]?.changes?.[0]?.value;

      const message = value?.messages?.[0];

      // Ignore delivery receipts and non-text messages
      if (!message?.from || message.type !== "text") return;

      const question = message.text?.body?.trim();
      if (!question) return;

      console.log("Incoming message:", question);

      const answer = await getAIReply(question);

      await sendWhatsAppReply(message.from, answer);

    } catch (error) {
      console.error("Message processing error:", error.message);
    }
  })();
});

app.listen(PORT, () => {
  console.log(`MilletMitra AI server running on port ${PORT}`);
});
