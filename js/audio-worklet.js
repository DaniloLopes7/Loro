class CapturaPCM extends AudioWorkletProcessor {
  constructor() {
    super();
    this._buf = new Float32Array(2048);
    this._pos = 0;
  }

  process(inputs) {
    const canal = inputs[0] && inputs[0][0];
    if (!canal || canal.length === 0) return true;

    let offset = 0;
    while (offset < canal.length) {
      const livre = this._buf.length - this._pos;
      const n = Math.min(livre, canal.length - offset);
      this._buf.set(canal.subarray(offset, offset + n), this._pos);
      this._pos += n;
      offset += n;

      if (this._pos === this._buf.length) {
        let soma = 0;
        for (let i = 0; i < this._pos; i++) soma += this._buf[i] * this._buf[i];
        const rms = Math.sqrt(soma / this._pos);
        this.port.postMessage({ amostras: this._buf.slice(0), rms });
        this._pos = 0;
      }
    }
    return true;
  }
}

registerProcessor("captura-pcm", CapturaPCM);
