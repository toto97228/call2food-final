// lib/audio.js
function mulawDecodeSample(uVal) {
  // µ-law 8-bit -> PCM16 (impl classique)
  uVal = ~uVal & 0xff;
  const sign = (uVal & 0x80) ? -1 : 1;
  const exponent = (uVal >> 4) & 0x07;
  const mantissa = uVal & 0x0f;
  const magnitude = ((mantissa << 1) + 1) << (exponent + 2);
  return sign * magnitude;
}

function mulawBytesToPcm16le(mulawBuf) {
  const out = Buffer.alloc(mulawBuf.length * 2);
  for (let i = 0; i < mulawBuf.length; i++) {
    let s = mulawDecodeSample(mulawBuf[i]);

    // clamp 16-bit
    if (s > 32767) s = 32767;
    if (s < -32768) s = -32768;

    out.writeInt16LE(s, i * 2);
  }
  return out;
}

function upsample16le_8k_to_16k(pcm16le_8k) {
  // upsample x2 très simple: duplication (suffisant pour valider un POC realtime)
  const samples8k = pcm16le_8k.length / 2;
  const out = Buffer.alloc(samples8k * 2 * 2); // x2 samples *2 bytes

  for (let i = 0; i < samples8k; i++) {
    const s = pcm16le_8k.readInt16LE(i * 2);
    out.writeInt16LE(s, (i * 2) * 2);
    out.writeInt16LE(s, (i * 2 + 1) * 2);
  }
  return out;
}

function mulawBase64ToPcm16_16k(payloadB64) {
  const mulaw = Buffer.from(payloadB64, "base64");
  const pcm16_8k = mulawBytesToPcm16le(mulaw);
  const pcm16_16k = upsample16le_8k_to_16k(pcm16_8k);
  return pcm16_16k;
}

module.exports = { mulawBase64ToPcm16_16k };
