const $ = (sel) => document.querySelector(sel);

function anunciarFrasesFinais() {
  const regiao = document.createElement("div");
  regiao.id = "anuncio-final";
  regiao.className = "sr-only";
  regiao.setAttribute("role", "status");
  regiao.setAttribute("aria-live", "polite");
  regiao.setAttribute("aria-atomic", "true");
  document.body.appendChild(regiao);

  const vistos = new WeakSet();
  const listas = [$("#chat-lista"), $("#falar-feed")].filter(Boolean);

  const anunciar = (lista) => {
    if (!lista.closest(".view.ativa")) return;
    lista.querySelectorAll(".linha-transcricao:not(.parcial)").forEach((linha) => {
      if (vistos.has(linha)) return;
      vistos.add(linha);
      const nome = linha.querySelector(".linha-nome")?.textContent.trim() || "";
      const texto = linha.querySelector(".linha-texto")?.textContent.trim() || "";
      if (texto) regiao.textContent = nome ? `${nome}: ${texto}` : texto;
    });
  };

  listas.forEach((lista) => {
    new MutationObserver(() => anunciar(lista)).observe(lista, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["class"],
    });
    anunciar(lista);
  });
}

function validarEntradaDaHome() {
  const campo = $("#inp-codigo");
  const erro = $("#home-erro");
  const caixaToasts = $("#toasts");
  if (!campo || !erro) return;

  const limpar = () => {
    erro.textContent = "";
  };

  campo.addEventListener("input", limpar);

  document.addEventListener(
    "click",
    (ev) => {
      const botao = ev.target.closest("#btn-falar, #btn-assistir");
      if (!botao) return;
      const codigo = campo.value.trim();
      if (codigo.length === 4) {
        limpar();
        return;
      }
      ev.preventDefault();
      ev.stopImmediatePropagation();
      erro.textContent = "Digite os 4 caracteres do código.";
      campo.focus();
    },
    true
  );

  if (!caixaToasts) return;
  new MutationObserver((mutacoes) => {
    if (!$("#view-home")?.classList.contains("ativa")) return;
    for (const mutacao of mutacoes) {
      for (const node of mutacao.addedNodes) {
        if (!(node instanceof HTMLElement) || !node.classList.contains("toast")) continue;
        const texto = node.textContent || "";
        if (/não encontrada/i.test(texto)) {
          erro.textContent = "Sala não encontrada. Crie a sala no telão primeiro.";
          node.remove();
        } else if (/4 caracteres|código de 4/i.test(texto)) {
          erro.textContent = "Digite os 4 caracteres do código.";
        }
      }
    }
  }).observe(caixaToasts, { childList: true });
}

function espelharCodigoDaSala() {
  const fonte = $("#telao-codigo");
  const destino = $("#telao-codigo-grande");
  if (!fonte || !destino) return;

  const espelhar = () => {
    destino.textContent = fonte.textContent;
  };

  new MutationObserver(espelhar).observe(fonte, {
    childList: true,
    characterData: true,
    subtree: true,
  });
  espelhar();
}

function formatarMetricas() {
  const velocidade = $("#meta-velocidade");
  if (velocidade) {
    const formatar = () => {
      const atual = velocidade.textContent || "";
      const proximo = atual.replace(/(\d)\.(\d)/g, "$1,$2");
      if (proximo !== atual) velocidade.textContent = proximo;
    };
    new MutationObserver(formatar).observe(velocidade, {
      childList: true,
      characterData: true,
      subtree: true,
    });
    formatar();
  }

  const participantes = $("#meta-participantes");
  const pessoasTexto = $("#pessoas-texto");
  const statusTelao = $("#telao-status");
  if (participantes && pessoasTexto) {
    const ajustar = () => {
      const total = Number.parseInt(participantes.textContent || "", 10);
      const status = (statusTelao?.textContent || "").toLowerCase();
      const temLocutor =
        !/aguardando locutor|motor indisponível|pausad/.test(status) &&
        /falando|conectado|transmitindo|processando|ouvindo/.test(status);
      if (temLocutor) {
        pessoasTexto.textContent = total === 1
          ? "pessoa na sala · 1 locutor"
          : "pessoas na sala · 1 locutor";
      } else {
        pessoasTexto.textContent = total === 1 ? "pessoa na sala" : "pessoas na sala";
      }
    };
    new MutationObserver(ajustar).observe(participantes, {
      childList: true,
      characterData: true,
      subtree: true,
    });
    if (statusTelao) {
      new MutationObserver(ajustar).observe(statusTelao, {
        childList: true,
        characterData: true,
        subtree: true,
      });
    }
    ajustar();
  }
}

function acompanharMotor() {
  const estado = $("#meta-estado");
  const status = document.querySelector(".status-local");
  const rotulo = $("#motor-status");
  if (!estado || !status || !rotulo) return;

  const atualizar = () => {
    const falhou = /erro|indispon/i.test(estado.textContent || "");
    status.classList.toggle("alerta", falhou);
    rotulo.textContent = falhou ? "Motor indisponível" : "Motor pronto · pt-BR";
  };

  new MutationObserver(atualizar).observe(estado, {
    childList: true,
    characterData: true,
    subtree: true,
  });
  atualizar();
}

anunciarFrasesFinais();
validarEntradaDaHome();
espelharCodigoDaSala();
formatarMetricas();
acompanharMotor();
