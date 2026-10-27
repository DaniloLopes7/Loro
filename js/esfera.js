const ESTADOS = new Set(["pausado", "pronto", "ouvindo", "processando"]);

export class VoiceSphere {
  constructor(el) {
    this.el = el;
    this.estado = "pronto";
    this.tema = "escuro";
    this.rodando = false;
    this.nivel = 0;
    this.el?.classList.add("orb-parado");
    this._aplicarEstado("pronto");
    this._aplicarNivel(0);
  }

  setEstado(estado) {
    const proximo = ESTADOS.has(estado) ? estado : "pausado";
    if (proximo === this.estado) return;
    this.estado = proximo;
    this._aplicarEstado(proximo);
  }

  setBandas(bandas) {
    if (!Array.isArray(bandas) || bandas.length === 0) return;
    let nivel = 0;
    for (let i = 0; i < Math.min(3, bandas.length); i++) {
      const valor = Number(bandas[i]);
      if (Number.isFinite(valor)) nivel = Math.max(nivel, valor);
    }
    this._aplicarNivel(Math.min(1, Math.max(0, nivel)));
  }

  setNivel(nivel) {
    const valor = Number(nivel);
    this._aplicarNivel(Number.isFinite(valor) ? Math.min(1, Math.max(0, valor)) : 0);
  }

  setTema(tema) {
    this.tema = tema === "claro" ? "claro" : "escuro";
  }

  start() {
    this.rodando = true;
    this.el?.classList.remove("orb-parado");
  }

  stop() {
    this.rodando = false;
    this.el?.classList.add("orb-parado");
  }

  _aplicarEstado(estado) {
    if (!this.el) return;
    this.el.dataset.estado = estado;
    if (estado !== "ouvindo") this._aplicarNivel(0);
  }

  _aplicarNivel(nivel) {
    this.nivel = nivel;
    this.el?.style.setProperty("--lv", nivel.toFixed(3));
  }
}
