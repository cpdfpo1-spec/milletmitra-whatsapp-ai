const express = require("express");

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3000;

// Meta webhook verification
app.get("/webhook", (req, res) => {
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];

  if (mode === "subscribe" && token === process.env.VERIFY_TOKEN) {
    console.log("Webhook verified");
    return res.status(200).send(challenge);
  }

  return res.sendStatus(403);
});

// Receive WhatsApp messages
app.post("/webhook", (req, res) => {
  console.log("Incoming WhatsApp webhook:");
  console.log(JSON.stringify(req.body, null, 2));

  res.sendStatus(200);
});

// Health check
app.get("/", (req, res) => {
  res.send("MilletMitra AI WhatsApp Backend is running.");
});

app.listen(PORT, () => {
  console.log(`MilletMitra AI server running on port ${PORT}`);
});
