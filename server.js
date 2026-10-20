
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

  if (mode === "subscribe" &&
      token === process.env.VERIFY_TOKEN) {
    return res.status(200).send(challenge);
  }

  return res.sendStatus(403);
});

// Ask OpenAI for agricultural advice
async function getAIReply(question) {
  const prompt = `
आप MilletMitra AI हैं, बुंदेलखंड के किसानों के कृषि सलाह सहायक।

किसान के प्रश्न का सरल हिंदी में उत्तर दें। जरूरत पर
सरल बुंदेली शब्दों का उपयोग करें।
पहले जरूरी जानकारी पूछें: जिला/गाँव, फसल, फसल की उम्र,
लक्षण कब से हैं, सिंचाई और हाल में डाली गई खाद/दवा।
अपर्याप्त जानकारी पर बीमारी या दवा निश्चित न बताएं।
व्यावहारिक और सुरक्षित अगले कदम बताएं। दवा की मात्रा
बिना पर्याप्त जानकारी के न गढ़ें। उत्तर संक्षिप्त रखें।

किसान का संदेश:
${question}
`;

  const response = await fetch(
    "https://api.openai.com/v1/responses",
    {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${process.env.OPENAI_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: "gpt-4.1-mini",
        input: prompt,
        max_output_tokens: 500
      })
    }
  );

  const data = await response.json();

  if (!response.ok) {
    console.error("OpenAI API error:", response.status, data);
    throw new Error("AI response failed");
  }

  const answer = (data.output || [])
    .flatMap(item => item.content || [])
    .filter(item => item.type === "output_text")
    .map(item => item.text)
    .join("\n")
    .trim();

  return answer || "कृपया अपनी फसल और समस्या की जानकारी दोबारा भेजें।";
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
      const value = req.body?.entry?.[0]?.changes?.[0]?.value;
      const message = value?.messages?.[0];

      // Ignore delivery receipts and other non-message events
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
