#!/usr/bin/env bash
set -euo pipefail

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
NEMO="${NEMO_SPEECH:-$HOME/.local/bin/nemo-speech}"
MODELO="${MODELO:-$DIR/modelo/nemotron-3.5-asr-streaming-0.6b.q8_0.gguf}"
PORTA_MOTOR="${PORTA_MOTOR:-8080}"
PORTA_APP="${PORTA:-8300}"

PIDS=()
limpeza() {
  echo
  echo "[vox] encerrando…"
  for pid in "${PIDS[@]:-}"; do
    [ -n "$pid" ] && kill "$pid" 2>/dev/null || true
  done
  wait 2>/dev/null || true
}
trap limpeza EXIT INT TERM

if [ ! -x "$NEMO" ]; then
  echo "[erro] nemo-speech não encontrado em $NEMO"
  echo "       instale com: curl -fsSL https://github.com/NVIDIA/NeMo-Speech.cpp/raw/main/scripts/install.sh | sh"
  exit 1
fi
if [ ! -f "$MODELO" ]; then
  echo "[erro] modelo GGUF não encontrado: $MODELO"
  echo "       baixe o modelo conforme a seção \"O Modelo\" do README"
  echo "       e salve em modelo/, ou aponte com MODELO=/caminho/arquivo.gguf"
  exit 1
fi
if [ ! -x "$DIR/.venv/bin/python" ]; then
  echo "[vox] criando ambiente Python (.venv)…"
  python3 -m venv "$DIR/.venv"
  "$DIR/.venv/bin/pip" install -q -r "$DIR/requirements.txt"
fi

if curl -sf "http://127.0.0.1:${PORTA_MOTOR}/ready" >/dev/null 2>&1; then
  echo "[vox] motor ASR já está no ar (:${PORTA_MOTOR})"
else
  echo "[vox] subindo motor ASR (CPU)… modelo: $(basename "$MODELO")"
  "$NEMO" serve --asr-model "$MODELO" --device cpu --no-ui \
       --host 127.0.0.1 --port "$PORTA_MOTOR" > /tmp/vox-motor.log 2>&1 &
  PIDS+=($!)
  echo -n "[vox] carregando modelo"
  for _ in $(seq 1 180); do
    if curl -sf "http://127.0.0.1:${PORTA_MOTOR}/ready" >/dev/null 2>&1; then
      echo " — pronto!"
      break
    fi
    sleep 1; echo -n "."
  done
  curl -sf "http://127.0.0.1:${PORTA_MOTOR}/ready" >/dev/null || {
    echo; echo "[erro] motor não respondeu a tempo. Veja /tmp/vox-motor.log"; exit 1; }
fi

if curl -sf "http://127.0.0.1:${PORTA_APP}/healthz" >/dev/null 2>&1; then
  echo "[vox] interface já está no ar (:${PORTA_APP})"
  ESPERA_PID=""
else
  echo "[vox] subindo interface + hub WebSocket (:${PORTA_APP})…"
  MOTOR_WS="ws://127.0.0.1:${PORTA_MOTOR}/v1/audio/transcriptions/realtime" \
  PORTA="$PORTA_APP" \
    "$DIR/.venv/bin/python" "$DIR/servidor.py" > /tmp/vox-app.log 2>&1 &
  PIDS+=($!)
  ESPERA_PID="${PIDS[-1]}"
  sleep 1
fi

IP_LAN=$(hostname -I 2>/dev/null | awk '{print $1}')
cat <<MSG

  Vox ao Vivo — TUDO PRONTO

    Telão neste PC : http://localhost:${PORTA_APP}
    Mesma rede     : http://${IP_LAN:-<ip-do-pc>}:${PORTA_APP}
    Celular (fora) : rode ./expor.sh para o link https

  Ctrl-C encerra tudo.
MSG

[ -n "$ESPERA_PID" ] && wait "$ESPERA_PID" || wait
