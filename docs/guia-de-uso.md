# Guia de Uso — Vox ao Vivo

Manual operacional do demonstrativo: como executar localmente, apresentar a demo com celular e resolver problemas comuns.

---

## 1. Executar no PC (local)

Pré-requisito único: runtime `nemo-speech` instalado (uma vez):

```bash
curl -fsSL https://github.com/NVIDIA/NeMo-Speech.cpp/raw/main/scripts/install.sh | sh
```

Depois, sempre que for usar:

```bash
cd vox-live-transcription
./iniciar.sh
```

O script:

1. Sobe o **motor ASR** em `127.0.0.1:8080` (primeira vez leva ~30–60 s para carregar o modelo);
2. Sobe a **aplicação** em `http://localhost:8300` (interface + hub WebSocket);
3. Mostra os endereços prontos para uso.

Uso neste PC: abra **http://localhost:8300** → **"Criar sala nesta tela"** → fale pelo microfone do próprio computador em outra aba (modo "Entrar para falar") ou use o celular (próxima seção).

Para encerrar: `Ctrl+C` no terminal do `iniciar.sh` (ele derruba os dois processos).

---

## 2. Ativar o CloudFlare Tunnel

É o modo de apresentação: **celular = microfone, PC = telão**.

```bash
./expor.sh
```

O `expor.sh`:

1. Garante a aplicação de pé (chama `iniciar.sh` se preciso);
2. Abre um **Cloudflare Tunnel** e imprime o link público `https://…trycloudflare.com` (com QR Code no próprio terminal).

Roteiro da demo:

1. **PC:** abra o link público no navegador → **"Criar sala nesta tela"**. O telão exibe: código da sala (4 letras), QR Code grande, a esfera de voz e a área de transcrição.
2. **Celular:** escaneie o QR → o navegador abre já no modo "falar" → autorize o microfone.
3. **Fale:**
   - **Segurar para falar** (push-to-talk): pressione e segure a pílula, fale, solte — a frase se finaliza ao soltar;
   - ou ative **"Fala livre"** para falar continuamente (o motor detecta o fim de cada frase pelo silêncio).
4. **Telão:** acompanhe o texto parcial se formando (itálico, com cursor) e a consolidação da frase com nome e horário. No rodapé: quantidade de frases, **latência de finalização** e **velocidade do motor** (× tempo real).
5. Ao final: **"Copiar"** (área de transferência) ou **"Baixar .txt"**.

Observações:

- O link `trycloudflare.com` é temporário: dura enquanto o túnel estiver aberto. A cada execução do `expor.sh`, um link novo é gerado.
- Várias pessoas podem **assistir** pelo mesmo link (espectadores ilimitados). Quem escanear o QR do telão entra para **falar** (um locutor por vez por sala).
- É possível criar **várias salas** (códigos diferentes) simultaneamente.

---

## 3. Solução de problemas

| Sintoma | Causa provável | Solução |
|---|---|---|
| `porta 8300 já em uso` | outro serviço na porta | `PORTA=8400 ./iniciar.sh` |
| Motor não sobe | modelo não encontrado | confira o caminho em `MODELO` no `iniciar.sh`; logs em `/tmp/vox-motor.log` |
| Celular não libera microfone | página sem HTTPS | use sempre o link `https://` gerado pelo `expor.sh` |
| QR do telão não abre no celular | telão foi aberto via `localhost` | abra o telão pelo **link público** e recrie a sala |
| "Sala não encontrada" | aplicação reiniciou (salas ficam em memória) | crie a sala de novo no telão |
| Texto não aparece | motor caiu | veja `/tmp/vox-motor.log`; o hub avisa na tela e tenta de novo ao próximo áudio |
| Áudio trava/engasga | máquina sobrecarregada | feche programas pesados; prefira "segurar para falar" na demo |

Verificar saúde dos serviços manualmente:

```bash
curl -s http://127.0.0.1:8080/ready     # motor ASR → {"ready": true, ...}
curl -s http://127.0.0.1:8300/healthz   # aplicação  → ok
```


## 4. Referência rápida

| Item | Valor |
|---|---|
| Porta da aplicação | `8300` (HTTP + WebSocket, mesma origem) |
| Porta do motor ASR | `8080` (apenas `127.0.0.1`) |
| Idioma configurado | `pt-BR` |
| Áudio do cliente | PCM16, 16 kHz, mono |
| Logs | `/tmp/vox-motor.log`, `/tmp/vox-app.log` (modo script) |
| Variáveis úteis | `MODELO=…`, `PORTA=…`, `PORTA_MOTOR=…`, `MOTOR_WS=…` |
