// app/api/voice-ai-plus/route.ts
import { NextRequest, NextResponse } from "next/server";
import twilio from "twilio";

const DEBUG = true;

const VoiceResponse = twilio.twiml.VoiceResponse;

/**
 * Helper : renvoyer du TwiML propre
 */
function xmlResponse(twiml: twilio.twiml.VoiceResponse) {
  return new NextResponse(twiml.toString(), {
    status: 200,
    headers: { "Content-Type": "text/xml" },
  });
}

/**
 * Téléchargement de l'enregistrement Twilio
 * On renvoie un ArrayBuffer (plus simple avec File/FormData).
 */
async function downloadRecording(url: string): Promise<ArrayBuffer> {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Impossible de télécharger l'audio Twilio: ${res.status}`);
  }
  return await res.arrayBuffer();
}

/**
 * Transcription audio → texte (OpenAI)
 */
async function transcribeAudio(audioData: ArrayBuffer): Promise<string> {
  try {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new Error("OPENAI_API_KEY manquant.");
    }

    const form = new FormData();

    // Modèle STT économique
    form.append("model", "gpt-4o-mini-transcribe");

    // On fabrique un File exploitable par l'API OpenAI
    const file = new File([audioData], "twilio-recording.mp3", {
      type: "audio/mp3",
    });
    form.append("file", file);

    const resp = await fetch("https://api.openai.com/v1/audio/transcriptions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
      body: form,
    });

    const data = await resp.json();
    if (!resp.ok) {
      throw new Error(JSON.stringify(data));
    }

    return (data.text as string) || "";
  } catch (err) {
    console.error("OpenAI STT error:", err);
    return "";
  }
}

/**
 * Handler principal Twilio (IA+)
 */
export async function POST(req: NextRequest) {
  const form = await req.formData();

  const recordingUrl = form.get("RecordingUrl")?.toString();
  const fromNumber = form.get("From")?.toString() || "client inconnu";

  // 1) PREMIER PASSAGE : pas encore d'enregistrement → on demande un Record
  if (!recordingUrl) {
    const twiml = new VoiceResponse();

    twiml.say(
      {
        voice: "alice",
        language: "fr-FR",
      },
      "Bonjour, après le bip, dites votre commande, puis appuyez sur dièse pour terminer."
    );

    twiml.record({
      action: "/api/voice-ai-plus", // Twilio rappellera cette même route
      method: "POST",
      maxLength: 60,
      playBeep: true,
      trim: "trim-silence",
    });

    return xmlResponse(twiml);
  }

  // 2) DEUXIÈME PASSAGE : Twilio a un RecordingUrl → on traite avec l’IA
  try {
    // a) Télécharger l'audio
    const audioData = await downloadRecording(recordingUrl);

    // b) Transcrire via OpenAI
    const transcript = await transcribeAudio(audioData);

    if (DEBUG) {
      console.log("📌 IA+ transcription from", fromNumber, ":", transcript);
    }

    const twiml = new VoiceResponse();

    if (!transcript.trim()) {
      twiml.say(
        { voice: "alice", language: "fr-FR" },
        "Désolé, je n'ai pas compris votre message. Merci de réessayer."
      );
      twiml.hangup();
      return xmlResponse(twiml);
    }

    // Pour l’instant, on se contente de répéter ce que le client a dit
    twiml.say(
      { voice: "alice", language: "fr-FR" },
      `Vous avez dit : ${transcript}`
    );
    twiml.say(
      { voice: "alice", language: "fr-FR" },
      "Le mode IA plus est en test. La création automatique de commande sera activée prochainement."
    );
    twiml.hangup();

    return xmlResponse(twiml);
  } catch (err) {
    console.error("Erreur dans /api/voice-ai-plus :", err);

    const twiml = new VoiceResponse();
    twiml.say(
      { voice: "alice", language: "fr-FR" },
      "Une erreur est survenue lors du traitement de votre appel."
    );
    twiml.hangup();

    return xmlResponse(twiml);
  }
}
