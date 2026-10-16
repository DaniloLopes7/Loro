const TAXA_ALVO = 16000;

class Resampler {
  constructor(taxaOrigem, taxaAlvo = TAXA_ALVO) {
    this.passo = taxaOrigem / taxaAlvo;
    this.pos = 0;
    this.resto = new Float32Array(0);
  }

  push(trecho) {
    const buf = new Float32Array(this.resto.length + trecho.length);
    buf.set(this.resto);
    buf.set(trecho, this.resto.length);

    const saida = [];
    while (this.pos + 1 < buf.length) {
      const i = Math.floor(this.pos);
      const frac = this.pos - i;
      saida.push(buf[i] + frac * (buf[i + 1] - buf[i]));
      this.pos += this.passo;
    }
    const consumidos = Math.floor(this.pos);
    this.resto = buf.slice(consumidos);
    this.pos -= consumidos;

    const pcm = new Int16Array(saida.length);
    for (let k = 0; k < saida.length; k++) {
      const s = Math.max(-1, Math.min(1, saida[k]));
      pcm[k] = s < 0 ? s * 0x8000 : s * 0x7fff;
    }
    return pcm;
  }
}

export async function iniciarCaptura(onBloco, onNivel) {
  if (!navigator.mediaDevices?.getUserMedia) {
    throw new Error("Microfone não suportado neste navegador.");
  }
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: {
      channelCount: 1,
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: true,
    },
  });

  const ctx = new (window.AudioContext || window.webkitAudioContext)();
  await ctx.audioWorklet.addModule("js/audio-worklet.js");

  const fonte = ctx.createMediaStreamSource(stream);
  const no = new AudioWorkletNode(ctx, "captura-pcm");
  const resampler = new Resampler(ctx.sampleRate, TAXA_ALVO);

  no.port.onmessage = (ev) => {
    const { amostras, rms } = ev.data;
    onNivel?.(Math.min(1, rms * 3.2));
    const pcm = resampler.push(amostras);
    if (pcm.length > 0) onBloco(pcm);
  };

  fonte.connect(no);

  const analyser = ctx.createAnalyser();
  analyser.fftSize = 512;
  analyser.smoothingTimeConstant = 0.7;
  fonte.connect(analyser);
  const espectro = new Uint8Array(analyser.frequencyBinCount);

  const mediaFaixa = (inicio, fim) => {
    let soma = 0;
    for (let i = inicio; i <= fim; i++) soma += espectro[i];
    const v = soma / ((fim - inicio + 1) * 255);
    return Math.min(1, Math.pow(v * 1.7, 0.85));
  };

  return {
    async retomar() {
      if (ctx.state !== "running") await ctx.resume();
    },
    parar() {
      try { no.disconnect(); } catch (_) {}
      try { fonte.disconnect(); } catch (_) {}
      try { analyser.disconnect(); } catch (_) {}
      for (const trilha of stream.getTracks()) trilha.stop();
      if (ctx.state !== "closed") ctx.close();
    },
    bandas() {
      analyser.getByteFrequencyData(espectro);
      return [mediaFaixa(1, 3), mediaFaixa(4, 13), mediaFaixa(14, 40)];
    },
  };
}
