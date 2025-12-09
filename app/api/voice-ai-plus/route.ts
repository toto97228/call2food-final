// app/api/voice-ai-plus/route.ts
import { NextRequest, NextResponse } from "next/server";
import twilio from "twilio";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { generateAIResponse, AIMessage } from "@/lib/aiRouter";

const DEBUG = true;

const VoiceResponse = twilio.twiml.VoiceResponse;

/* --------------------------------------------- */
/* Helper TwiML                                   */
/* --------------------------------------------- */
function xmlResponse(twiml: twilio.twiml.VoiceResponse) {
  return new NextResponse(twiml.toString(), {
    status: 200,
    headers: { "Content-Type": "text/xml" },
  });
}

/* --------------------------------------------- */
/* Téléchargement Twilio Recording (auth requise)*/
/* --------------------------------------------- */
async function downloadRecording(url: string): Promise<ArrayBuffer> {
  const sid = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;

  if (!sid || !token) throw new Error("TWILIO creds manquantes");

  const mp3Url = url.endsWith(".mp3") ? url : `${url}.mp3`;

  const auth = Buffer.from(`${sid}:${token}`).toString("base64");

  const resp = await fetch(mp3Url, {
    headers: {
      Authorization: `Basic ${auth}`,
    },
  });

  if (!resp.ok) {
    const t = await resp.text();
    throw new Error(`Twilio DL Error ${resp.status}: ${t}`);
  }

  return await resp.arrayBuffer();
}

/* --------------------------------------------- */
/* OpenAI STT : Whisper                          */
/* --------------------------------------------- */
async function transcribeAudio(audio: ArrayBuffer): Promise<string> {
  try {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) throw new Error("OPENAI_API_KEY manquant");

    const form = new FormData();
    form.append("model", "gpt-4o-mini-transcribe");

    const file = new File([audio], "audio.mp3", {
      type: "audio/mp3",
    });

    form.append("file", file);

    const resp = await fetch("https://api.openai.com/v1/audio/transcriptions", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}` },
      body: form,
    });

    const data = await resp.json();

    if (!resp.ok) throw new Error(JSON.stringify(data));

    return data.text || "";
  } catch (err) {
    console.error("[STT ERROR]", err);
    return "";
  }
}

/* --------------------------------------------- */
/* Récupération AI provider du client (Supabase) */
/* --------------------------------------------- */
async function getClientAIProvider(phone: string): Promise<"openai" | "deepseek"> {
  const { data, error } = await supabaseAdmin
    .from("clients")
    .select("ai_provider")
    .eq("phone", phone)
    .maybeSingle();

  if (error || !data) {
    console.warn("Client not found, fallback OpenAI");
    return "openai";
  }

  return (data.ai_provider as "openai" | "deepseek") ?? "openai";
}

/* --------------------------------------------- */
/* Handler principal TWILIO                      */
/* --------------------------------------------- */
export async function POST(req: NextRequest) {
  const form = await req.formData();

  const recordingUrl = form.get("RecordingUrl")?.toString();
  const from = form.get("From")?.toString() || "";

  /* -------- 1) Premier passage : pas d'enregistrement -------- */
  if (!recordingUrl) {
    const twiml = new VoiceResponse();

    twiml.say(
      { voice: "alice", language: "fr-FR" },
      "Bonjour, après le bip, dites votre commande, puis appuyez sur dièse pour terminer."
    );

    twiml.record({
      action: "/api/voice-ai-plus",
      method: "POST",
      playBeep: true,
      maxLength: 60,
      trim: "trim-silence",
    });

    return xmlResponse(twiml);
  }

  /* -------- 2) Deuxième passage : transcription + IA -------- */
  try {
    if (DEBUG) console.log("📥 Recording:", recordingUrl);

    const audio = await downloadRecording(recordingUrl);
    const transcript = await transcribeAudio(audio);

    if (DEBUG) console.log("📝 Transcript:", transcript);

    if (!transcript.trim()) {
      const twiml = new VoiceResponse();
      twiml.say(
        { voice: "alice", language: "fr-FR" },
        "Désolé, je n'ai pas compris votre message."
      );
      twiml.hangup();
      return xmlResponse(twiml);
    }

    /* ---- 3) Sélection moteur IA selon le client ---- */
    const provider = await getClientAIProvider(from);

    if (DEBUG) console.log("🤖 Provider:", provider);

    const messages: AIMessage[] = [
      {
        role: "system",
        content: "Tu es un agent vocal Call2Eat. Réponds brièvement, en restant professionnel.",
      },
      { role: "user", content: transcript },
    ];

    const aiText = await generateAIResponse({
      provider,
      messages,
    });

    /* ---- 4) Réponse au client ---- */
    const twiml = new VoiceResponse();
    twiml.say({ voice: "alice", language: "fr-FR" }, aiText || "Commande reçue !");
    twiml.hangup();

    return xmlResponse(twiml);
  } catch (err) {
    console.error("[VOICE IA+ ERROR]", err);

    const twiml = new VoiceResponse();
    twiml.say(
      { voice: "alice", language: "fr-FR" },
      "Une erreur est survenue lors du traitement de votre appel."
    );
    twiml.hangup();

    return xmlResponse(twiml);
  }
}
