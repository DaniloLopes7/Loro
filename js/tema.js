const CHAVE = "vox-tema";

export function temaAtual() {
  return document.documentElement.dataset.tema === "claro" ? "claro" : "escuro";
}

function aplicar(tema) {
  document.documentElement.dataset.tema = tema;
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute("content", tema === "claro" ? "#EDEDED" : "#0E0E0E");
  document.querySelectorAll(".btn-tema").forEach((b) => {
    b.textContent = tema === "claro" ? "Claro" : "Escuro";
    b.setAttribute("aria-label", `Alternar tema (atual: ${tema})`);
  });
  window.dispatchEvent(new CustomEvent("vox:tema", { detail: { tema } }));
}

export function iniciarTema() {
  aplicar(temaAtual());

  document.querySelectorAll(".btn-tema").forEach((b) =>
    b.addEventListener("click", () => {
      const novo = temaAtual() === "claro" ? "escuro" : "claro";
      try {
        localStorage.setItem(CHAVE, novo);
      } catch (_) {}
      aplicar(novo);
    })
  );

  window
    .matchMedia("(prefers-color-scheme: light)")
    .addEventListener?.("change", (ev) => {
      let salvo = null;
      try {
        salvo = localStorage.getItem(CHAVE);
      } catch (_) {}
      if (!salvo) aplicar(ev.matches ? "claro" : "escuro");
    });
}
