<h1>Vox</h1>

Transcrição de voz ao vivo: fale pelo celular e veja o texto aparecer palavra por palavra no telão.

## O que o Vox faz

O Vox é um demonstrativo de ditado por voz em tempo real. O celular captura o microfone, envia o áudio e o telão da sala exibe a transcrição ao vivo, palavra por palavra. Todo o reconhecimento acontece localmente em CPU, sem enviar áudio para serviços de nuvem de IA.

O fluxo acontece dentro de uma sala: quem cria a sala vira o telão, e quem entra pelo QR Code vira o locutor. O texto do locutor surge na tela à medida que é finalizado pelo motor de reconhecimento.

## O modelo

O motor de reconhecimento de voz utiliza o Nemotron (NVIDIA), um modelo de ASR (*Automatic Speech Recognition*) com arquitetura FastConformer cache-aware + RNN-T, cerca de 600 milhões de parâmetros e design voltado a streaming de baixa latência.

O modelo base reconhecia apenas inglês. Para habilitar o reconhecimento de português brasileiro, foi realizado fine-tuning utilizando o dataset [CORAA](https://github.com/nilc-nlp/CORAA) (*Corpus of Annotated Audios*), um corpus brasileiro de áudio transcrito.

### Treinamento

O fine-tuning foi executado no Google Colab Pro (GPU). Após o treino, o modelo foi convertido e quantizado para rodar localmente em CPU.

### Execução local

O modelo é distribuído no formato GGUF quantizado q8_0 (~742 MB) e executado pelo runtime nativo [NeMo-Speech.cpp](https://github.com/NVIDIA/NeMo-Speech.cpp).

**O modelo treinado em português brasileiro não está disponível para download.** Este projeto é um demonstrativo de tecnologia e não um projeto finalizado; os pesos do fine-tuning não são distribuídos.

## Estados da esfera

![Pronto](assets/orb/orb-pronto.svg)
![Ouvindo](assets/orb/orb-ouvindo.svg)
![Processando](assets/orb/orb-processando.svg)
![Pausado](assets/orb/orb-pausado.svg)

## Como funciona

```text
 CELULAR (locutor / microfone)
      │  HTTPS/WSS — link público do túnel
      ▼
servidor.py :8300 ── hub de salas + proxy
      │  WebSocket (loopback)
      ▼
nemo-speech :8080 ── motor ASR Nemotron + CORAA (GGUF q8_0, CPU local)
      │
      ▼  broadcast: texto parcial → final
PC / TELÃO (quem criou a sala)
```

1. O celular entra na sala pelo QR Code, captura o microfone, faz resample para PCM16 @ 16 kHz (AudioWorklet) e envia o áudio por WebSocket seguro.
2. O hub (`servidor.py`) administra salas (1 locutor por sala, N espectadores) e retransmite o áudio ao motor ASR local.
3. O motor transcreve em tempo real (parciais, texto se formando; finais, frase consolidada com pontuação).
4. O hub faz broadcast dos eventos para o telão, que exibe linhas de transcrição palavra a palavra, com nome, horário e métricas.

Segurança e privacidade: o motor ASR fica restrito ao loopback (`127.0.0.1`); apenas a aplicação é exposta. Todo o processamento é local.

## Requisitos

| Requisito | Detalhe |
|---|---|
| Sistema | Linux x86_64 ou aarch64 (testado) |
| Memória | ~8 GB RAM livres |
| CPU | 4+ núcleos |
| Python | 3.10+ |
| Runtime | [`nemo-speech`](https://github.com/NVIDIA/NeMo-Speech.cpp) |
| Modelo | GGUF q8_0 (~742 MB) — veja [`docs/modelo.md`](docs/modelo.md) |
| Túnel (opcional) | [`cloudflared`](https://github.com/cloudflare/cloudflared) |

Runtime nemo-speech (sem sudo):

```bash
curl -fsSL https://github.com/NVIDIA/NeMo-Speech.cpp/raw/main/scripts/install.sh | sh
```

Baixar o modelo GGUF q8_0:

```bash
curl -fSL -o modelo/nemotron-3.5-asr-streaming-0.6b.q8_0.gguf --create-dirs \
  "https://huggingface.co/nvidia/nemotron-3.5-asr-streaming-0.6b/resolve/main/nemotron-3.5-asr-streaming-0.6b.q8_0.gguf"
```

## Quickstart

### Uso local

```bash
./iniciar.sh
```

Abra **http://localhost:8300** → **"Criar sala nesta tela"**. Essa tela vira o telão.

### Demonstração com celular (modo sala)

```bash
./expor.sh
```

O script sobe a aplicação e publica um link público `https://…trycloudflare.com` (com QR no terminal). Então:

1. **PC:** abra o link público → **Criar sala nesta tela** (o telão exibe o código da sala + QR).
2. **Celular:** escaneie o QR → autorize o microfone → segure o botão para falar (ou ative **Fala livre**).
3. **Telão:** acompanhe a transcrição palavra por palavra; ao final, copie ou baixe `.txt`.

O HTTPS do túnel é o que permite ao navegador do celular liberar o microfone. O link temporário expira ao fechar o túnel.

## Identidade visual — Sinal Silencioso

Interface em preto e off-white, tipografia Inter em pesos leves, linhas de 1px e um único acento: o verde da esfera de voz, que reage ao áudio real do microfone (bandas graves/médios/agudos via AnalyserNode). Tema claro e escuro seguem o sistema por padrão, com escolha manual persistida no navegador.

A esfera é desenhada em `<canvas>` (um por view: home, telão e celular) e tem quatro estados: **Pronto**, **Ouvindo**, **Processando** e **Pausado** — os mesmos SVGs de referência em [`assets/orb/`](assets/orb/).

## Estrutura do projeto

```text
vox-live-transcription/
├── index.html            # SPA: home / telão / celular
├── css/style.css         # identidade Sinal Silencioso (tokens claro/escuro, responsivo)
├── js/app.js             # estado, WebSocket, salas, transcrição palavra a palavra
├── js/esfera.js          # esfera de voz: canvas por estado (pronto/ouvindo/…), bandas reais
├── js/tema.js            # tema claro/escuro (segue o sistema, preferência persistida)
├── js/captura.js         # microfone → PCM16 16 kHz (resample linear) + AnalyserNode
├── js/audio-worklet.js   # AudioWorkletProcessor (blocos + nível RMS)
├── js/qrcode.min.js      # gerador de QR Code (MIT, K. Arase) — vendored
├── servidor.py           # HTTP estáticos + hub WS de salas + proxy p/ motor
├── requirements.txt      # websockets
├── iniciar.sh            # motor (:8080) + aplicação (:8300)
├── expor.sh              # Cloudflare Tunnel → link público HTTPS
└── docs/
    ├── documentacao.md   # documentação do projeto (modelo, arquitetura, resultados)
    ├── guia-de-uso.md    # manual operacional
    └── modelo.md         # qual modelo de IA baixar, onde baixar e instalar
```

## Autor

**Danilo Almeida Lopes** — estudante de Ciência de Dados.

## Licenças

- Código deste repositório: uso livre no contexto do projeto
- Modelo Nemotron: licença [OpenMDW-1.1](https://openmdw.ai/license/1-1/)
- Dataset [CORAA](https://github.com/nilc-nlp/CORAA): ver termos de uso público do corpus
- Componentes: NeMo-Speech.cpp e cloudflared (Apache-2.0), qrcode-generator (MIT)
