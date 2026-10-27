import { VoiceSphere } from "./esfera.js";
import { iniciarCaptura } from "./captura.js";
import { iniciarTema, temaAtual } from "./tema.js";

const S = {
  ws: null,
  sala: "",
  papel: "ver",
  papelEfetivo: "ver",
  nome: "",
  id: "",
  idioma: "",
  locutor: "",
  ouvindoSala: false,
  falando: false,
  falaLivre: false,
  pttSegurado: false,
  captura: null,
  capturandoMic: false,
  erroMic: false,
  erroMotor: false,
  processando: false,
  processandoTimer: null,
  recebeuNivel: false,
  wakeLock: null,
  reconectarTimer: null,
  tentativas: 0,
  finalizadas: [],
  encerrado: false,
  duracao: 0,
  nivelRaf: 0,
  ultimoEnvioNivel: 0,
};

const $ = (sel) => document.querySelector(sel);
const params = new URLSearchParams(location.search);

const esferas = {
  home: new VoiceSphere($("#orb-home")),
  telao: new VoiceSphere($("#orb-telao")),
  falar: new VoiceSphere($("#orb-falar")),
};

iniciarTema();
const aplicarTemaEsferas = (tema) => {
  for (const orb of Object.values(esferas)) orb.setTema(tema);
};
aplicarTemaEsferas(temaAtual());
window.addEventListener("vox:tema", (ev) => aplicarTemaEsferas(ev.detail.tema));

function toast(msg, tipo = "") {
  const el = document.createElement("div");
  el.className = `toast ${tipo}`;
  el.textContent = msg;
  $("#toasts").appendChild(el);
  setTimeout(() => el.remove(), 4200);
}

let viewAtual = "home";

function mostrarView(nome) {
  document.querySelectorAll(".view").forEach((v) => v.classList.remove("ativa"));
  $(`#view-${nome}`).classList.add("ativa");
  viewAtual = nome;
  for (const [k, orb] of Object.entries(esferas)) {
    if (k === nome) orb.start();
    else orb.stop();
  }
  if (nome !== "falar") liberarWakeLock();
}

const horaBR = (ts) =>
  new Date(ts ? ts * 1000 : Date.now()).toLocaleTimeString("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
  });

function setStatus(el, classe, texto) {
  el.className = `status${classe ? " " + classe : ""}`;
  el.textContent = texto;
}

async function copiarTexto(txt) {
  try {
    await navigator.clipboard.writeText(txt);
    toast("Copiado para a área de transferência", "ok");
  } catch {
    toast("Não foi possível copiar", "erro");
  }
}

async function manterTelaAtiva() {
  try {
    S.wakeLock = await navigator.wakeLock?.request("screen");
  } catch (_) {}
}
function liberarWakeLock() {
  try { S.wakeLock?.release(); } catch (_) {}
  S.wakeLock = null;
}
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible" && viewAtual === "falar") manterTelaAtiva();
});

function formatarDuracao(s) {
  const h = Math.floor(s / 3600);
  const m = String(Math.floor((s % 3600) / 60)).padStart(2, "0");
  const seg = String(s % 60).padStart(2, "0");
  return h > 0 ? `${h}:${m}:${seg}` : `${m}:${seg}`;
}

function atualizarDuracao() {
  const el = $("#meta-duracao");
  if (el) el.textContent = formatarDuracao(S.duracao);
}

setInterval(() => {
  if (!S.falando) return;
  S.duracao += 1;
  atualizarDuracao();
}, 1000);

function marcarProcessando() {
  S.processando = true;
  clearTimeout(S.processandoTimer);
  S.processandoTimer = setTimeout(() => {
    S.processando = false;
    if (S.papelEfetivo === "falar") atualizarFalar();
    else atualizarTelao();
  }, 8000);
}

function atualizarTelao() {
  const elTexto = $("#telao-orbtexto");
  const st = $("#telao-status");
  const tst = $("#transcricao-estado");
  const me = $("#meta-estado");
  const painelSala = $("#painel-sala");

  if (S.erroMotor) {
    esferas.telao.setEstado("erro");
    elTexto.textContent = "Motor ASR indisponível";
    setStatus(st, "", "motor indisponível");
    tst.textContent = "Erro no motor";
    me.textContent = "erro no motor";
    return;
  }

  if (!S.ouvindoSala) {
    esferas.telao.setEstado("pronto");
    elTexto.textContent = "Pronto para ouvir";
    setStatus(st, "", "aguardando locutor");
    tst.textContent = "Aguardando áudio";
    me.textContent = "aguardando locutor";
    painelSala.classList.remove("oculto");
    return;
  }

  painelSala.classList.add("oculto");

  if (S.falando) {
    esferas.telao.setEstado("ouvindo");
    elTexto.textContent = "Ouvindo";
    setStatus(st, "ativo", `${S.locutor} falando`);
    me.textContent = "ouvindo";
  } else if (S.processando) {
    esferas.telao.setEstado("processando");
    elTexto.textContent = "Processando transcrição";
    setStatus(st, "ativo", "processando");
    me.textContent = "processando";
  } else {
    esferas.telao.setEstado("pausado");
    elTexto.textContent = "Pausado";
    setStatus(st, "", `${S.locutor} conectado`);
    me.textContent = "pausado";
  }

  if (S.falando) {
    tst.textContent = document.querySelector(".linha-transcricao.parcial")
      ? "Transcrição em andamento"
      : "Captura ativa";
  } else if (S.processando) {
    tst.textContent = "Processando transcrição";
  } else {
    tst.textContent = "Aguardando áudio";
  }
}

function atualizarFalar() {
  const el = $("#falar-orbtexto");
  if (S.erroMic) {
    esferas.falar.setEstado("erro");
    el.textContent = "Microfone indisponível — verifique a permissão";
    return;
  }
  if (S.falando) {
    esferas.falar.setEstado("ouvindo");
    el.textContent = "Ouvindo";
  } else if (S.processando) {
    esferas.falar.setEstado("processando");
    el.textContent = "Processando transcrição";
  } else {
    esferas.falar.setEstado("pronto");
    el.textContent = "Pronto para ouvir";
  }
}

function criarLinha({ nome, parcial = false }) {
  const el = document.createElement("article");
  el.className = "linha-transcricao" + (parcial ? " parcial" : "");
  el.innerHTML = `
    <div class="linha-cabecalho">
      <span class="linha-nome"></span>
      <time class="linha-hora"></time>
    </div>
    <p class="linha-texto"></p>
    <p class="linha-meta" hidden></p>`;
  el.querySelector(".linha-nome").textContent = nome || "Locutor";
  el.querySelector(".linha-hora").textContent = horaBR();
  return el;
}

function rolarSeNoFim(lista) {
  const perto = lista.scrollHeight - lista.scrollTop - lista.clientHeight < 140;
  if (perto) lista.scrollTo({ top: lista.scrollHeight, behavior: "smooth" });
}

function mostrarParcial(texto, nome) {
  const listas = [$("#chat-lista"), $("#falar-feed")];
  for (const lista of listas) {
    let linha = lista.querySelector(".linha-transcricao.parcial");
    if (!texto) {
      linha?.remove();
      continue;
    }
    if (!linha) {
      $("#chat-vazio")?.classList.add("oculto");
      linha = criarLinha({ nome, parcial: true });
      lista.appendChild(linha);
    }
    linha.querySelector(".linha-texto").innerHTML =
      `${escapeHtml(texto)}<span class="caret"></span>`;
    rolarSeNoFim(lista);
  }
}

function mostrarFinal({ texto, nome, ts, latencia_ms, velocidade }) {
  S.finalizadas.push({ nome, texto, ts });
  for (const lista of [$("#chat-lista"), $("#falar-feed")]) {
    let linha = lista.querySelector(".linha-transcricao.parcial");
    if (!linha) {
      linha = criarLinha({ nome });
      lista.appendChild(linha);
    }
    $("#chat-vazio")?.classList.add("oculto");
    linha.classList.remove("parcial");
    linha.querySelector(".linha-hora").textContent = horaBR(ts);
    linha.querySelector(".linha-texto").textContent = texto;
    const meta = linha.querySelector(".linha-meta");
    const partes = [];
    if (latencia_ms != null) partes.push(`finalizada em ${latencia_ms} ms`);
    if (velocidade != null) partes.push(`${velocidade}× tempo real`);
    if (partes.length) {
      meta.hidden = false;
      meta.textContent = partes.join(" · ");
    }
    rolarSeNoFim(lista);
  }

  $("#meta-frases").textContent = S.finalizadas.length;
  if (latencia_ms != null) $("#meta-latencia").textContent = `${latencia_ms} ms`;
  if (velocidade != null) $("#meta-velocidade").textContent = `${velocidade}×`;
  atualizarAcoes();
}

function atualizarAcoes() {
  const tem = S.finalizadas.length > 0;
  const copiar = $("#btn-copiar");
  const baixar = $("#btn-baixar");
  if (copiar) copiar.disabled = !tem;
  if (baixar) baixar.disabled = !tem;
}

function escapeHtml(s) {
  return s.replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])
  );
}

function configurarTelao() {
  $("#telao-codigo").textContent = S.sala;
  const url = `${location.origin}${location.pathname}?r=${S.sala}&papel=falar`;
  const qr = qrcode(0, "M");
  qr.addData(url);
  qr.make();
  $("#qrcode").innerHTML = qr.createSvgTag({ cellSize: 5, margin: 0, scalable: true });

  const local = ["localhost", "127.0.0.1"].includes(location.hostname);
  $("#aviso-local").classList.toggle("oculto", !local);

  $("#btn-copiar-link").onclick = () => copiarTexto(url);
  $("#btn-copiar").onclick = () => copiarTexto(formatarTranscricao());
  $("#btn-baixar").onclick = () => {
    const blob = new Blob([formatarTranscricao()], { type: "text/plain;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `transcricao-sala-${S.sala}.txt`;
    a.click();
    URL.revokeObjectURL(a.href);
  };
  $("#btn-nova-sala").onclick = () => location.replace(location.pathname);
  atualizarAcoes();
}

function formatarTranscricao() {
  const cab = `Vox ao Vivo — sala ${S.sala}\nMotor: Haku ASR (CPU local)\n${"-".repeat(52)}\n\n`;
  return (
    cab +
    S.finalizadas.map((f) => `[${horaBR(f.ts)}] ${f.nome}: ${f.texto}`).join("\n") +
    "\n"
  );
}

function iniciarNivelLoop() {
  if (S.nivelRaf) return;
  const passo = () => {
    S.nivelRaf = 0;
    if (!S.falando || !S.captura) return;
    const b = S.captura.bandas();
    esferas.falar.setBandas(b);
    const agora = performance.now();
    if (agora - S.ultimoEnvioNivel >= 100) {
      S.ultimoEnvioNivel = agora;
      wsEnviar({ tipo: "nivel", b: b.map((v) => Math.round(v * 1000) / 1000) });
    }
    S.nivelRaf = requestAnimationFrame(passo);
  };
  S.nivelRaf = requestAnimationFrame(passo);
}

function pararNivelLoop() {
  if (S.nivelRaf) {
    cancelAnimationFrame(S.nivelRaf);
    S.nivelRaf = 0;
  }
}

function atualizarBotaoPTT() {
  const ptt = $("#btn-ptt");
  const dica = $("#ptt-dica");
  if (S.falaLivre) {
    ptt.disabled = true;
    ptt.classList.add("ativo");
    ptt.textContent = "Fala livre ativa";
    dica.textContent = "toque no interruptor para parar";
  } else {
    ptt.disabled = false;
    ptt.classList.toggle("ativo", S.falando);
    ptt.textContent = S.falando ? "Falando — solte para finalizar" : "Segure para falar";
    dica.textContent = S.falando
      ? "capturando áudio"
      : "segure para falar · use a fala livre para mãos livres";
  }
}

function configurarSpeaker() {
  $("#falar-codigo").textContent = S.sala;
  manterTelaAtiva();

  const ptt = $("#btn-ptt");
  const toggle = $("#toggle-livre");

  const iniciarMicSeNecessario = async () => {
    if (S.capturandoMic) return true;
    try {
      S.captura = await iniciarCaptura((pcm) => {
        if (S.falando && S.ws?.readyState === WebSocket.OPEN) {
          S.ws.send(pcm.buffer);
        }
      });
      S.capturandoMic = true;
      S.erroMic = false;
      return true;
    } catch (err) {
      S.erroMic = true;
      atualizarFalar();
      toast("Sem acesso ao microfone: " + (err.message || err), "erro");
      return false;
    }
  };

  const aplicarFalando = async (ativo) => {
    if (ativo) {
      if (!(await iniciarMicSeNecessario())) return false;
      await S.captura.retomar();
      S.processando = false;
      clearTimeout(S.processandoTimer);
    }
    S.falando = ativo;
    atualizarFalar();
    atualizarBotaoPTT();
    wsEnviar({ tipo: "ptt", ativo });
    if (ativo) {
      iniciarNivelLoop();
    } else {
      pararNivelLoop();
      esferas.falar.setBandas([0, 0, 0]);
      wsEnviar({ tipo: "commit" });
      marcarProcessando();
      atualizarFalar();
    }
    navigator.vibrate?.(ativo ? 30 : [15, 40, 15]);
    return true;
  };

  ptt.addEventListener("pointerdown", async (ev) => {
    ev.preventDefault();
    if (S.falaLivre || S.pttSegurado) return;
    ptt.setPointerCapture(ev.pointerId);
    if (await aplicarFalando(true)) S.pttSegurado = true;
  });
  const soltar = async () => {
    if (!S.pttSegurado) return;
    S.pttSegurado = false;
    await aplicarFalando(false);
  };
  ptt.addEventListener("pointerup", soltar);
  ptt.addEventListener("pointercancel", soltar);
  ptt.addEventListener("contextmenu", (ev) => ev.preventDefault());
  ptt.addEventListener("keydown", async (ev) => {
    if (ev.code !== "Space" && ev.code !== "Enter") return;
    ev.preventDefault();
    if (S.falaLivre || S.pttSegurado || ev.repeat) return;
    if (await aplicarFalando(true)) S.pttSegurado = true;
  });
  ptt.addEventListener("keyup", (ev) => {
    if (ev.code !== "Space" && ev.code !== "Enter") return;
    ev.preventDefault();
    soltar();
  });

  toggle.addEventListener("click", async () => {
    const ligar = toggle.getAttribute("aria-checked") !== "true";
    if (ligar) {
      if (await aplicarFalando(true)) {
        S.falaLivre = true;
        toggle.setAttribute("aria-checked", "true");
        atualizarBotaoPTT();
      }
    } else {
      S.falaLivre = false;
      S.pttSegurado = false;
      toggle.setAttribute("aria-checked", "false");
      await aplicarFalando(false);
    }
  });

  $("#btn-sair").onclick = () => {
    try { S.ws?.close(); } catch (_) {}
    pararNivelLoop();
    S.captura?.parar();
    location.replace(location.pathname);
  };
}

function wsUrl() {
  const proto = location.protocol === "https:" ? "wss" : "ws";
  const q = new URLSearchParams({
    sala: S.sala,
    papel: S.papel,
    nome: S.nome,
  });
  return `${proto}://${location.host}/ws?${q}`;
}

function wsEnviar(obj) {
  if (S.ws?.readyState === WebSocket.OPEN) {
    S.ws.send(JSON.stringify(obj));
    return true;
  }
  return false;
}

function conectar() {
  clearTimeout(S.reconectarTimer);
  const ws = new WebSocket(wsUrl());
  S.ws = ws;
  ws.binaryType = "arraybuffer";

  ws.onopen = () => {
    S.tentativas = 0;
  };

  ws.onmessage = (ev) => {
    let msg;
    try { msg = JSON.parse(ev.data); } catch { return; }

    switch (msg.tipo) {
      case "entrou": {
        S.sala = msg.sala;
        S.papelEfetivo = msg.papel;
        S.nome = msg.nome;
        S.id = msg.id;
        S.idioma = msg.idioma || "";
        $("#meta-idioma").textContent = S.idioma || "—";
        history.replaceState(
          null,
          "",
          `${location.pathname}?r=${S.sala}${S.papelEfetivo === "falar" ? "&papel=falar" : ""}`
        );
        if (S.papelEfetivo === "falar") {
          configurarSpeaker();
          mostrarView("falar");
          setStatus($("#falar-status"), "ativo", "conectado");
        } else {
          configurarTelao();
          mostrarView("telao");
        }
        break;
      }

      case "estado": {
        $("#meta-participantes").textContent = msg.participantes;
        S.ouvindoSala = msg.estado === "ouvindo";
        if (msg.locutor) S.locutor = msg.locutor;
        if (S.papelEfetivo !== "falar") {
          const antes = S.falando;
          S.falando = !!msg.falando;
          if (S.falando) {
            S.erroMotor = false;
            S.processando = false;
            clearTimeout(S.processandoTimer);
            S.recebeuNivel = false;
            setTimeout(() => {
              if (S.falando && !S.recebeuNivel && S.papelEfetivo !== "falar") {
                esferas.telao.setBandas([0.16, 0.16, 0.16]);
              }
            }, 1200);
          } else if (antes) {
            marcarProcessando();
          }
          atualizarTelao();
        } else {
          setStatus($("#falar-status"), "ativo", msg.falando ? "transmitindo" : "conectado");
        }
        break;
      }

      case "nivel":
        if (S.papelEfetivo !== "falar") {
          S.recebeuNivel = true;
          esferas.telao.setBandas(msg.b);
        }
        break;

      case "parcial":
        mostrarParcial(msg.texto, msg.nome);
        if (S.papelEfetivo !== "falar") atualizarTelao();
        break;

      case "final":
        S.processando = false;
        clearTimeout(S.processandoTimer);
        S.recebeuNivel = false;
        mostrarFinal(msg);
        if (S.papelEfetivo === "falar") atualizarFalar();
        else atualizarTelao();
        break;

      case "aviso":
        toast(msg.msg);
        break;

      case "erro":
        toast(msg.msg, "erro");
        if (/motor asr/i.test(msg.msg)) {
          S.erroMotor = true;
          if (S.papelEfetivo !== "falar") atualizarTelao();
        }
        if (msg.codigo === "sala_nao_encontrada") {
          S.encerrado = true;
          clearTimeout(S.reconectarTimer);
          setTimeout(() => location.replace(location.pathname), 2200);
        }
        break;

      case "pong":
        break;
    }
  };

  ws.onclose = () => {
    const eraFalando = S.falando;
    S.falando = false;
    S.pttSegurado = false;
    S.processando = false;
    clearTimeout(S.processandoTimer);
    S.ouvindoSala = false;
    if (S.papelEfetivo === "falar") {
      atualizarFalar();
      atualizarBotaoPTT();
      setStatus($("#falar-status"), "", "reconectando…");
    } else if (viewAtual === "telao") {
      atualizarTelao();
      setStatus($("#telao-status"), "", "reconectando…");
    }
    if (eraFalando) pararNivelLoop();
    esferas.telao.setBandas([0, 0, 0]);
    if (S.encerrado) return;
    const espera = Math.min(5000, 800 * 2 ** S.tentativas++);
    S.reconectarTimer = setTimeout(conectar, espera);
  };

  ws.onerror = () => ws.close();
}

function entrar(sala, papel, nome) {
  S.sala = (sala || "").trim().toUpperCase();
  S.papel = papel;
  S.nome = nome;
  conectar();
}

function init() {
  esferas.home.start();

  const codigoUrl = (params.get("r") || "").trim().toUpperCase();
  const papelUrl = params.get("papel");

  if (codigoUrl) {
    entrar(codigoUrl, papelUrl === "falar" ? "falar" : "ver", "");
    return;
  }

  $("#btn-criar").onclick = () => entrar("", "ver", "");
  $("#btn-falar").onclick = () => {
    const codigo = $("#inp-codigo").value.trim().toUpperCase();
    if (codigo.length !== 4) return toast("Digite o código de 4 caracteres da sala", "erro");
    entrar(codigo, "falar", $("#inp-nome").value.trim());
  };
  $("#btn-assistir").onclick = () => {
    const codigo = $("#inp-codigo").value.trim().toUpperCase();
    if (codigo.length !== 4) return toast("Digite o código de 4 caracteres da sala", "erro");
    entrar(codigo, "ver", $("#inp-nome").value.trim());
  };
  $("#inp-codigo").addEventListener("input", (ev) => {
    ev.target.value = ev.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "");
  });
}

init();
