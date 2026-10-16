const PONTOS = 160;

const BANDAS = [
  { lobos: 3, amp: 0.07, vel: 0.85 },
  { lobos: 5, amp: 0.045, vel: 1.35 },
  { lobos: 9, amp: 0.025, vel: 2.1 },
];

const RAIOS_LINHAS = [0.74, 0.52, 0.3];

const ALFA_LINHAS = {
  pronto: [0.09, 0.06, 0.05],
  ouvindo: [0.3, 0.21, 0.17],
  processando: [0.09, 0.06, 0.05],
  pausado: [0.09, 0.06, 0.05],
  erro: [0.09, 0.06, 0.05],
};

const VERDE = ["#8CF5B8", "#2FD47A", "#0F9A52"];
const CINZA = ["#C9C9C9", "#8E8E8E", "#5E5E5E"];

export class VoiceSphere {
  constructor(canvas) {
    this.cv = canvas;
    this.ctx = canvas.getContext("2d");
    this.estado = "pronto";
    this.tema = "escuro";

    this.bandas = [0, 0, 0];
    this.alvo = [0, 0, 0];
    this.fases = [Math.random() * 10, Math.random() * 10, Math.random() * 10];
    this.tickAtivo = 0;
    this.tickAlvo = 0;

    this.t = 0;
    this.rodando = false;
    this.w = 0;
    this.h = 0;
    this.dpr = 1;
    this._raf = 0;
    this._ultimo = 0;
    this._cache = null;

    this._ang = new Float32Array(PONTOS + 1);
    this._cos = new Float32Array(PONTOS + 1);
    this._sin = new Float32Array(PONTOS + 1);
    for (let i = 0; i <= PONTOS; i++) {
      const a = (i / PONTOS) * Math.PI * 2;
      this._ang[i] = a;
      this._cos[i] = Math.cos(a);
      this._sin[i] = Math.sin(a);
    }
    this._onda = new Float32Array(PONTOS + 1);
    this._raioA = new Float32Array(PONTOS + 1);
    this._raioB = new Float32Array(PONTOS + 1);

    this._loop = this._loop.bind(this);

    this._mqMov = window.matchMedia("(prefers-reduced-motion: reduce)");
    this.reduzido = this._mqMov.matches;
    this._mqMov.addEventListener?.("change", (ev) => {
      this.reduzido = ev.matches;
      this._pararRaf();
      if (this.rodando) this._animar();
    });

    document.addEventListener("visibilitychange", () => {
      if (document.hidden) {
        this._pararRaf();
      } else if (this.rodando) {
        this._ultimo = performance.now();
        this._animar();
      }
    });

    this._ro = new ResizeObserver(() => {
      this._dimensionar();
      if (this.rodando) {
        this._pararRaf();
        this._animar();
      }
    });
    this._ro.observe(canvas);
    this._dimensionar();
  }

  setEstado(estado) {
    if (estado === this.estado) return;
    this.estado = estado;
    this.tickAlvo = estado === "ouvindo" ? 1 : 0;
    this._pararRaf();
    if (this.rodando) this._animar();
  }

  setBandas(b) {
    if (!Array.isArray(b) || b.length < 3) return;
    for (let i = 0; i < 3; i++) {
      const v = Number(b[i]);
      this.alvo[i] = Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : 0;
    }
  }

  setNivel(n) {
    const v = Math.min(1, Math.max(0, Number(n) || 0));
    this.setBandas([v, v, v]);
  }

  setTema(tema) {
    if (tema === this.tema) return;
    this.tema = tema;
    this._cache = null;
    if (this.rodando && (this.reduzido || this._estatico())) this._animar();
  }

  start() {
    this.rodando = true;
    this._ultimo = performance.now();
    this._animar();
  }

  stop() {
    this.rodando = false;
    this._pararRaf();
  }

  _estatico() {
    return this.estado === "pausado" || this.estado === "erro";
  }

  _animar() {
    if (!this.rodando) return;
    if (this.reduzido || this._estatico()) {
      this._desenhar();
      return;
    }
    this._raf = requestAnimationFrame(this._loop);
  }

  _loop(ts) {
    if (!this.rodando) return;
    const dt = Math.min(0.05, Math.max(0, (ts - this._ultimo) / 1000));
    this._ultimo = ts;
    if (!this._estatico()) this.t += dt;
    this._desenhar();
    this._raf = requestAnimationFrame(this._loop);
  }

  _pararRaf() {
    if (this._raf) {
      cancelAnimationFrame(this._raf);
      this._raf = 0;
    }
  }

  _dimensionar() {
    const rect = this.cv.getBoundingClientRect();
    const w = Math.max(0, Math.round(rect.width));
    const h = Math.max(0, Math.round(rect.height));
    const dpr = Math.min(2.5, window.devicePixelRatio || 1);
    if (w === this.w && h === this.h && dpr === this.dpr) return;
    this.w = w;
    this.h = h;
    this.dpr = dpr;
    this.cv.width = Math.max(1, Math.round(w * dpr));
    this.cv.height = Math.max(1, Math.round(h * dpr));
    this._cache = null;
  }

  _gradientes(S, r0, cinzaEstado) {
    if (this._cache && this._cache.S === S && this._cache.cinza === cinzaEstado) {
      return this._cache;
    }
    const ctx = this.ctx;
    const g = ctx.createRadialGradient(-0.0533 * S, -0.0733 * S, 0, 0, 0, r0);
    const cs = cinzaEstado ? CINZA : VERDE;
    g.addColorStop(0, cs[0]);
    g.addColorStop(0.42, cs[1]);
    g.addColorStop(1, cs[2]);

    const h = ctx.createRadialGradient(-0.1 * S, -0.1267 * S, 0, -0.1 * S, -0.1267 * S, 0.2333 * S);
    h.addColorStop(0, "rgba(255,255,255,0.3)");
    h.addColorStop(1, "rgba(255,255,255,0)");

    this._cache = { S, r0, cinza: cinzaEstado, g, h };
    return this._cache;
  }

  _deformacao(a) {
    if (this._estatico()) return 0;
    if (this.estado === "processando") {
      return (
        0.22 *
        (BANDAS[0].amp * Math.sin(3 * a + this.t * 0.3 + this.fases[0]) +
          BANDAS[1].amp * Math.sin(5 * a - this.t * 0.26 + this.fases[1]) +
          BANDAS[2].amp * Math.sin(9 * a + this.t * 0.22 + this.fases[2]))
      );
    }
    if (this.estado === "pronto") {
      return 0.004 * Math.sin(3 * a + this.t * 0.5 + this.fases[0]);
    }
    let d = 0;
    for (let i = 0; i < 3; i++) {
      d +=
        this.bandas[i] *
        BANDAS[i].amp *
        Math.sin(BANDAS[i].lobos * a + this.fases[i] + this.t * BANDAS[i].vel);
    }
    return d;
  }

  _energia() {
    return (this.bandas[0] + this.bandas[1] + this.bandas[2]) / 3;
  }

  _caminho(arr) {
    const ctx = this.ctx;
    ctx.beginPath();
    for (let i = 0; i <= PONTOS; i++) {
      const x = this._cos[i] * arr[i];
      const y = this._sin[i] * arr[i];
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.closePath();
  }

  _desenhar() {
    if (!this.w || !this.h) return;
    const ctx = this.ctx;
    const S = Math.min(this.w, this.h);
    const cx = this.w / 2;
    const cy = this.h / 2;
    const r0 = 0.312 * S;
    const k = S / 340;
    const cinzaEstado = this._estatico();

    const fator = this.estado === "ouvindo" ? 0.38 : 0.12;
    for (let i = 0; i < 3; i++) {
      const alvo = this.estado === "ouvindo" ? this.alvo[i] : 0;
      this.bandas[i] += (alvo - this.bandas[i]) * fator;
    }
    this.tickAtivo += (this.tickAlvo - this.tickAtivo) * 0.08;

    const e = this.estado === "ouvindo" ? this._energia() : this.estado === "processando" ? 0.25 : 0;
    const resp = this.estado === "pronto" ? 1 + 0.012 * Math.sin((this.t / 6) * Math.PI * 2) : 1;
    const raioBase = r0 * resp;

    for (let i = 0; i <= PONTOS; i++) this._onda[i] = this._deformacao(this._ang[i]);

    const { g, h } = this._gradientes(S, r0, cinzaEstado);
    const largura = r0 / 86.4;

    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.clearRect(0, 0, this.w, this.h);
    ctx.save();
    ctx.translate(cx, cy);

    const raioA = this._raioA;
    for (let i = 0; i <= PONTOS; i++) raioA[i] = raioBase * (1 + this._onda[i]);

    ctx.save();
    ctx.shadowColor = cinzaEstado ? "rgba(0,0,0,0.32)" : "rgba(30,200,110,0.32)";
    ctx.shadowOffsetY = 0.0583 * S * this.dpr;
    ctx.shadowBlur = 0.05 * S * this.dpr;
    ctx.fillStyle = g;
    this._caminho(raioA);
    ctx.fill();
    ctx.restore();

    this._caminho(raioA);
    ctx.lineWidth = largura;
    ctx.strokeStyle = "rgba(255,255,255,0.4)";
    ctx.stroke();

    ctx.save();
    this._caminho(raioA);
    ctx.clip();
    ctx.fillStyle = h;
    ctx.fillRect(-cx, -cy, this.w, this.h);
    ctx.restore();

    const alfas = ALFA_LINHAS[this.estado];
    const fLinha =
      this.estado === "ouvindo" ? Math.min(1, e * 1.4) : 0;
    for (let j = 0; j < 3; j++) {
      const base = raioBase * RAIOS_LINHAS[j];
      const raioB = this._raioB;
      for (let i = 0; i <= PONTOS; i++) raioB[i] = base * (1 + 1.8 * this._onda[i]);
      const alfa = alfas[j] + (ALFA_LINHAS.ouvindo[j] - alfas[j]) * fLinha;
      this._caminho(raioB);
      ctx.lineWidth = largura;
      ctx.strokeStyle = `rgba(255,255,255,${alfa})`;
      ctx.stroke();
    }

    if (!cinzaEstado) {
      const aneis = [
        { f: 1.09, alfa: 0.06 + e * 0.39 },
        { f: 1.22, alfa: 0.03 + e * 0.19 },
      ];
      ctx.lineWidth = largura * 1.5;
      for (const anel of aneis) {
        const raioB = this._raioB;
        for (let i = 0; i <= PONTOS; i++) {
          raioB[i] = r0 * anel.f * resp * (1 + 0.6 * this._onda[i]);
        }
        this._caminho(raioB);
        ctx.strokeStyle = `rgba(47,212,122,${anel.alfa})`;
        ctx.stroke();
      }
    }

    if (this.estado === "processando") {
      ctx.save();
      ctx.rotate((this.t / 7) * Math.PI * 2);
      ctx.setLineDash([5 * k, 6 * k]);
      ctx.beginPath();
      ctx.arc(0, 0, r0 * 1.18, 0, Math.PI * 2);
      ctx.lineWidth = largura * 1.5;
      ctx.strokeStyle = "rgba(47,212,122,0.9)";
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.restore();
    }

    if (this.tickAtivo > 0.02) {
      const cor = this.tema === "claro" ? "17,17,17" : "237,237,237";
      const espacos = [0, 8, 18, 30, 44];
      const ganhos = [16, 25, 34, 43, 52];
      const baseT = 8 * k;
      ctx.lineWidth = 1;
      for (let lado = -1; lado <= 1; lado += 2) {
        for (let i = 0; i < 5; i++) {
          const x = lado * (r0 + (16 + espacos[i]) * k);
          const osc = 0.6 + 0.4 * Math.sin(this.t * 2.1 + this.fases[i % 3] + i * 1.7);
          const altura = baseT + e * ganhos[i] * k * osc;
          const alfa = this.tickAtivo * (0.12 + e * 0.3);
          ctx.strokeStyle = `rgba(${cor},${alfa})`;
          ctx.beginPath();
          ctx.moveTo(x, -altura / 2);
          ctx.lineTo(x, altura / 2);
          ctx.stroke();
        }
      }
    }

    ctx.restore();
  }
}
