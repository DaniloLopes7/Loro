const CHAVE = "vox-tema";
const PREFERENCIAS = ["auto", "claro", "escuro"];
const CORES = { claro: "#F9F7F5", escuro: "#121614" };

const sistemaEscuro = window.matchMedia("(prefers-color-scheme: dark)");

export function temaAtual() {
  return document.documentElement.dataset.tema === "claro" ? "claro" : "escuro";
}

function lerPreferencia() {
  try {
    const salvo = localStorage.getItem(CHAVE);
    return PREFERENCIAS.includes(salvo) ? salvo : "auto";
  } catch (_) {
    return "auto";
  }
}

function salvarPreferencia(pref) {
  try {
    localStorage.setItem(CHAVE, pref);
  } catch (_) {}
}

function resolver(pref) {
  if (pref === "claro" || pref === "escuro") return pref;
  return sistemaEscuro.matches ? "escuro" : "claro";
}

function atualizarBotoes(pref) {
  document.querySelectorAll(".tema-toggle").forEach((grupo) => {
    const botoes = [...grupo.querySelectorAll(".btn-tema")];
    const ativo = botoes.findIndex((b) => b.dataset.pref === pref);
    grupo.style.setProperty("--i", String(ativo < 0 ? 0 : ativo));
    botoes.forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.pref === pref)));
  });
}

function aplicar(pref) {
  const tema = resolver(pref);
  const raiz = document.documentElement;
  raiz.dataset.tema = tema;
  raiz.dataset.pref = pref;
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute("content", CORES[tema]);
  atualizarBotoes(pref);
  window.dispatchEvent(new CustomEvent("vox:tema", { detail: { tema } }));
}

function avisar(pref) {
  const caixa = document.querySelector("#toasts");
  if (!caixa) return;
  const rotulos = { auto: "Automático", claro: "Claro", escuro: "Escuro" };
  const el = document.createElement("div");
  el.className = "toast";
  el.textContent = `Tema: ${rotulos[pref]}`;
  caixa.appendChild(el);
  setTimeout(() => el.remove(), 2400);
}

export function iniciarTema() {
  const pref = lerPreferencia();
  aplicar(pref);

  document.querySelectorAll(".btn-tema").forEach((botao) => {
    botao.addEventListener("click", () => {
      const escolha = botao.dataset.pref;
      if (!PREFERENCIAS.includes(escolha)) return;
      salvarPreferencia(escolha);
      aplicar(escolha);
      avisar(escolha);
    });
  });

  sistemaEscuro.addEventListener?.("change", () => {
    if (lerPreferencia() === "auto") aplicar("auto");
  });
}
