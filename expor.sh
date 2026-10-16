#!/usr/bin/env bash
set -euo pipefail

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CLOUDFLARED="${CLOUDFLARED:-$HOME/.local/bin/cloudflared}"
PORTA_APP="${PORTA:-8300}"

PIDS=()
limpeza() {
  echo
  echo "[vox] fechando túnel…"
  for pid in "${PIDS[@]:-}"; do
    [ -n "$pid" ] && kill "$pid" 2>/dev/null || true
  done
  wait 2>/dev/null || true
}
trap limpeza EXIT INT TERM

if [ ! -x "$CLOUDFLARED" ]; then
  echo "[erro] cloudflared não encontrado em $CLOUDFLARED"
  echo "       baixe: https://github.com/cloudflare/cloudflared/releases"
  exit 1
fi

if ! curl -sf "http://127.0.0.1:${PORTA_APP}/healthz" >/dev/null 2>&1; then
  echo "[vox] aplicação não está rodando — iniciando…"
  "$DIR/iniciar.sh" &
  PIDS+=($!)
  for _ in $(seq 1 200); do
    curl -sf "http://127.0.0.1:${PORTA_APP}/healthz" >/dev/null 2>&1 && break
    sleep 1
  done
fi
curl -sf "http://127.0.0.1:${PORTA_APP}/healthz" >/dev/null || {
  echo "[erro] aplicação não respondeu em :${PORTA_APP}"; exit 1; }

echo "[vox] criando túnel público (Cloudflare)…"
LOG="$(mktemp /tmp/vox-tunnel.XXXX.log)"
"$CLOUDFLARED" tunnel --no-autoupdate --url "http://127.0.0.1:${PORTA_APP}" >"$LOG" 2>&1 &
PIDS+=($!)

URL=""
for _ in $(seq 1 60); do
  URL="$(grep -oE 'https://[a-z0-9-]+\.trycloudflare\.com' "$LOG" | head -1 || true)"
  [ -n "$URL" ] && break
  sleep 1
done

if [ -z "$URL" ]; then
  echo "[erro] não consegui obter a URL do túnel. Log: $LOG"
  tail -20 "$LOG"
  exit 1
fi

cat <<MSG

  Vox ao Vivo — NO AR NA INTERNET

    Link público (telão no PC):
      $URL

    No PC  : abra o link → "Criar sala nesta tela"
    Celular: escaneie o QR exibido no telão (ou o QR abaixo)

    O áudio sai do celular → motor ASR local (CPU) → texto no telão.

MSG

[[ "$URL" == http* ]] && "$DIR/.venv/bin/python" - "$URL" <<'PY' 2>/dev/null || true
import sys
try:
    import qrcode
except Exception:
    sys.exit(0)
qr = qrcode.QRCode(border=1)
qr.add_data(sys.argv[1])
qr.make()
qr.print_ascii(invert=True)
PY

echo "  Ctrl-C fecha o túnel (o link deixa de funcionar)."
echo
wait "${PIDS[@]:-}"
