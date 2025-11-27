// adapters/livekitAdapter.js
// Adapter LiveKit ←→ OpenAI Realtime
// ⚠️ SQUELETTE : à compléter quand on aura le SDK LiveKit branché.

const { createOpenAIRealtimeSession } = require('../openaiRealtimeCore');

async function initLiveKitAdapter(_server, { apiKey, model }) {
  console.log('🚧 LiveKit adapter initialisé (mode squelette, non connecté à LiveKit)');

  // On crée la session OpenAI, comme pour Twilio
  const session = await createOpenAIRealtimeSession({
    apiKey,
    model,
    onAudioDelta: (deltaBase64) => {
      // TODO : renvoyer l’audio de réponse vers LiveKit
      // Exemple logique (pseudo-code) :
      // livekitConnection.sendAudioFromBase64(deltaBase64);
    },
  });

  // === Fonctions à brancher plus tard sur LiveKit ===

  // Appelée quand tu reçois de l’audio du caller via LiveKit
  function handleIncomingLiveKitAudio(base64Ulaw) {
    // On pousse l’audio vers OpenAI (même format g711 μ-law base64 que Twilio)
    session.appendAudio(base64Ulaw);
  }

  function cleanup() {
    try {
      if (session.ws && session.ws.readyState === 1) {
        session.ws.close();
      }
    } catch (e) {
      console.error('[LiveKit adapter] Error while closing OpenAI WS', e);
    }
  }

  // Pour l’instant on retourne juste ces helpers,
  // qu’on branchera quand on aura le code LiveKit concret.
  return {
    handleIncomingLiveKitAudio,
    cleanup,
  };
}

module.exports = { initLiveKitAdapter };
