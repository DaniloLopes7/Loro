<p align="center">
  <img src="assets/loro.svg" width="140" alt="Loro">
</p>

<h1 align="center">Loro</h1>

<p align="center">
  <b>Transcrição de voz ao vivo </b><br>
  Fale pelo celular e veja o texto aparecer palavra por palavra no telão — reconhecimento 100% local, em CPU.
</p>

<p align="center">
  <img alt="Status: demonstrativo" src="https://img.shields.io/badge/status-demonstrativo-0F9A52?style=for-the-badge">
  <img alt="Idioma: pt-BR" src="https://img.shields.io/badge/idioma-pt--BR-111111?style=for-the-badge">
  <img alt="Reconhecimento 100% local em CPU" src="https://img.shields.io/badge/reconhecimento-100%25%20local%20(CPU)-0F9A52?style=for-the-badge">
  <img alt="Python 3.10+" src="https://img.shields.io/badge/python-3.10%2B-666666?style=for-the-badge">
</p>

---

<p align="center">
  <b>Estados da esfera</b>
</p>

<p align="center">
  <img src="assets/orb/orb-pausado.gif" width="110" alt="Pausado">
  <img src="assets/orb/orb-pronto.gif" width="110" alt="Pronto">
  <img src="assets/orb/orb-ouvindo-small.gif" width="110" alt="Ouvindo">
  <img src="assets/orb/orb-processando.gif" width="110" alt="Processando">
</p>

<p align="center">
  <b>Pausado</b> &nbsp;·&nbsp; <b>Pronto</b> &nbsp;·&nbsp; <b>Ouvindo</b> &nbsp;·&nbsp; <b>Processando</b>
</p>

---

## O que o Loro faz

O **Loro** é um demonstrativo de ditado por voz em tempo real. O celular captura a fala, gera e envia um arquivo de áudio de forma segura e o telão da sala exibe a transcrição ao vivo, palavra por palavra — tudo reconhecido localmente em CPU, sem enviar áudio para serviços de nuvem de IA. 
O fluxo acontece dentro de uma **sala**: quem cria a sala assume a função do telão, e quem entra pelo QR Code se transforma em locutor. A transcrição da fala do locutor surge na tela à medida que é finalizada pelo motor de reconhecimento, com pontuação, nome do locutor, horário e métricas de desempenho (latência de finalização e velocidade relativa ao tempo real).

---

## O Modelo — Haku ASR

O motor de reconhecimento de voz do Loro roda o **Haku ASR**, um modelo de ASR (*Automatic Speech Recognition*) derivado do **Nemotron 3.5 ASR Streaming 0.6B** (NVIDIA), que usa arquitetura **FastConformer cache-aware + RNN-T** com cerca de **600 milhões de parâmetros** e design voltado a *streaming* de baixa latência.

O **Haku ASR** foi criado por **Danilo Almeida Lopes**, a partir do **treinamento do Nemotron 3.5 ASR para Português Brasileiro**. Além do ajuste de idioma, o modelo recebeu modificações estruturais: foram **removidas as camadas internas responsáveis pela transcrição em inglês e pela tentativa de previsão antecipada**, de modo que o Haku ASR transcreve **apenas em tempo real**. Também foram adicionadas **otimizações para áudio longo ou contínuo**, que passa a ser analisado em **blocos maiores de áudio**, reduzindo o custo por bloco e aumentando a eficiência do processamento.

| Característica | Valor |
|---|---|
| Tarefa | Reconhecimento automático de fala (ASR) em *streaming* |
| Arquitetura | FastConformer *cache-aware* + decodificador RNN-T |
| Parâmetros (modelo base) | ~600 milhões (0.6B) |
| Modelo base | Nemotron 3.5 ASR Streaming 0.6B (só inglês) |
| Criação do Haku ASR | **Danilo Almeida Lopes** |
| Modelo final | **Haku ASR** — fine-tune pt-BR, com as camadas de inglês e de previsão antecipada removidas |
| Tamanho do modelo | ~350 MB (GGUF q8_0) — Haku ASR pt-BR |
| Formato de execução | GGUF quantizado **q8_0** (roda em CPU, sem GPU) |

O modelo base reconhecia apenas **Inglês**. Para habilitar o reconhecimento de **Português Brasileiro**, foi realizado **fine-tuning utilizando o dataset [CORAA](https://github.com/nilc-nlp/CORAA)** (*Corpus of Annotated Audios*), um corpus brasileiro de áudio transcrito — dando origem ao **Haku ASR**.

### Treinamento

O treinamento/fine-tuning foi executado no **Google Colab Pro** (GPU). Após o treino, as camadas internas de inglês e de tentativa de previsão foram removidas, e o modelo foi convertido e quantizado para o formato **GGUF q8_0** (~350 MB) e executado localmente pelo runtime nativo **[NeMo-Speech.cpp](https://github.com/NVIDIA/NeMo-Speech.cpp)**, sem frameworks pesados de deep learning.

> **Disponibilidade do modelo:** as características do **Haku ASR** treinado estão disponíveis nesta documentação; o download dos pesos e do arquivo GGUF não está disponível. Este projeto é um **demonstrativo de tecnologia** e não um projeto finalizado. Para estudar ou reproduzir o pipeline, utilize o modelo base oficial **Nemotron 3.5 ASR** (só-Inglês), indicado em [Requisitos](#requisitos).

### Configuração de inferência

- Amostragem de entrada: **16 kHz, mono, PCM 16 bits** (o celular faz o resample do áudio do navegador para essa taxa);
- Idioma do decodificador: **pt-BR**;
- Transcrição **estritamente em tempo real**, sem tentativa de previsão antecipada;
- **Áudio longo ou contínuo**: analisado em **blocos maiores de áudio**, o que reduz o overhead por bloco e melhora a eficiência em sessões longas;
- Pontuação e capitalização automáticas **ativadas**;
- Normalização inversa de texto ativa (ex.: "19" → "dezenove");
- Detecção automática de fim de enunciado por silêncio (*endpointing*).

<details>
<summary><b>Detalhes técnicos (ASR, streaming e quantização)</b></summary>

- **FastConformer**: variação eficiente da arquitetura Conformer (convoluções + autoatenção) para codificação acústica de fala.
- ***Cache-aware* (streaming)**: o codificador reutiliza ativações de quadros anteriores ("cache"), processando apenas os novos quadros de áudio a cada passo — elimina recomputação e reduz a latência ponta a ponta, requisito essencial para transcrição ao vivo.
- **RNN-T** (*Recurrent Neural Network Transducer*): decodificador que emite o texto em *streaming* (token a token), permitindo exibir **resultados parciais** enquanto a pessoa ainda fala e **resultados finais** ao fim de cada enunciado.
- **Haku ASR**: fine-tune pt-BR do Nemotron 3.5 ASR. As camadas internas de transcrição em inglês e de tentativa de previsão antecipada foram removidas — o modelo trabalha **apenas em tempo real**.
- **Blocos maiores para áudio longo/contínuo**: em vez de processar o fluxo em blocos pequenos, o Haku ASR agrupa o áudio em blocos maiores, reduzindo o overhead por bloco e acelerando sessões longas.
- **Quantização q8_0**: pesos em 8 bits, o que permite executar o modelo **100% local em CPU**, sem GPU e sem enviar áudio para a nuvem.

</details>

---

## Performance — Haku ASR vs. modelo base

A comparação abaixo mostra a **taxa de acerto** do **Haku ASR** (modelo otimizado, treinado com o CORAA para Português Brasileiro) em relação ao modelo base **NVIDIA Nemotron-3.5**:

<p align="center">
  <img src="assets/performance-haku-vs-nemotron.png" width="640" alt="Gráfico de taxa de acerto: Haku ASR 93% vs NVIDIA Nemotron-3.5 61,3%">
</p>

| Modelo | Taxa de acerto | Taxa de erro |
|---|---|---|
| **Haku ASR** (fine-tune pt-BR com CORAA) | **93,0%** | 7,0% |
| NVIDIA Nemotron-3.5 (base) | 61,3% | 38,7% |

O Haku ASR entrega **+31,7 pontos percentuais** de acerto — cerca de **51,7% mais acertos** em termos relativos — e reduz a taxa de erro de **38,7% para 7,0%** (queda de ≈82%).

Além do treino com o CORAA, as otimizações do Haku ASR — remoção das camadas internas de inglês e de tentativa de previsão antecipada (transcrição apenas em tempo real) e o processamento de áudio longo/contínuo em **blocos maiores** — tornam o modelo mais enxuto e eficiente para o uso ao vivo.

---

## Como funciona

```text
 CELULAR (locutor / microfone)
      │  HTTPS/WSS — link público do túnel
      ▼
servidor.py :8300 ── hub de salas + proxy
      │  WebSocket (loopback)
      ▼
nemo-speech :8080 ── motor Haku ASR (GGUF q8_0, CPU local)
      │
      ▼  broadcast: texto parcial → final
PC / TELÃO (quem criou a sala)
```

1. O **celular** entra na sala pelo QR Code, captura o microfone, faz resample para **PCM16 @ 16 kHz** (AudioWorklet) e envia o áudio por WebSocket seguro.
2. O **hub** (`servidor.py`) administra salas (1 locutor por sala, N espectadores) e retransmite o áudio ao motor ASR local.
3. O **motor** transcreve em tempo real (parciais → texto se formando; finais → frase consolidada com pontuação).
4. O hub faz **broadcast** dos eventos para o telão, que exibe bolhas de chat palavra a palavra, com nome, horário e métricas.

**Segurança e privacidade:** o motor ASR fica restrito ao *loopback* (`127.0.0.1`); apenas a aplicação é exposta. Todo o processamento é local.

<details>
<summary><b>Arquitetura e protocolos (detalhes)</b></summary>

O sistema é composto por quatro blocos:

1. **Motor ASR** (`nemo-speech serve`): carrega o GGUF q8_0 do **Haku ASR** e expõe, apenas em *loopback* (`127.0.0.1:8080`), um WebSocket de transcrição em tempo real. Nunca é exposto à rede.
2. **Hub da aplicação** (`servidor.py`, Python + `websockets`): em uma única porta (`8300`) entrega a interface estática, administra **salas** (código curto de 4 caracteres), controla **papéis** (um locutor por sala; espectadores ilimitados), faz *proxy* do áudio do locutor ao motor, *broadcast* dos eventos de texto e **métricas** (latência de finalização; velocidade em múltiplos do tempo real).
3. **Interface web** (HTML/CSS/JS, sem framework/build): três telas — *home* (criar/entrar), *telão* (código + QR + chat em tempo real + métricas + exportação) e *celular* (captura do microfone com AudioWorklet, "segurar para falar", modo "fala livre", esfera reativa à voz).
4. **Exposição pública** (Cloudflare Tunnel): gera uma URL `https://…trycloudflare.com` que aponta para a aplicação local. O HTTPS é requisito dos navegadores para liberar o microfone fora de `localhost`.

**Cliente ↔ aplicação** (`ws(s)://host:8300/ws?sala=•&papel=•&nome=•`):

| Direção | Tipo | Uso |
|---|---|---|
| binário | PCM16 @16 kHz | áudio do locutor (só em fluxo "falando") |
| JSON `ptt` | `{tipo:"ptt", ativo}` | início/fim de fala |
| JSON `commit` | `{tipo:"commit"}` | finalizar enunciado imediatamente |
| JSON | `entrou`, `estado`, `parcial`, `final`, `erro`/`aviso` | eventos do hub aos clientes |

**Aplicação ↔ motor** (`ws://127.0.0.1:8080/v1/audio/transcriptions/realtime`): `session.update` (idioma pt-BR, taxa 16 kHz) → quadros binários PCM16 → eventos `…transcription.delta` (texto parcial) e `…transcription.completed` (enunciado final, com pontuação).

**Decisões de design:** mesma origem para página e WebSocket (evita CORS e simplifica o HTTPS pelo túnel); motor em *loopback* (superfície de exposição mínima); salas em memória (o demonstrativo não requer banco de dados); um locutor por vez por sala (previsibilidade de áudio; espectadores ilimitados); interface sem build (facilita reprodução).

</details>

---

## Requisitos

| Requisito | Detalhe |
|---|---|
| Sistema | Linux x86_64 ou aarch64 (testado) |
| Memória | ~8 GB RAM livres |
| CPU | 4+ núcleos |
| Python | 3.10+ |
| Runtime | [`nemo-speech`](https://github.com/NVIDIA/NeMo-Speech.cpp) |
| Modelo | **Haku ASR** (GGUF q8_0; download não disponível) — base Nemotron 3.5 ASR para estudo; veja [O Modelo](#o-modelo--haku-asr) |
| Túnel (opcional) | [`cloudflared`](https://github.com/cloudflare/cloudflared) |

Runtime nemo-speech (sem sudo; instala em `~/.local/bin/nemo-speech`):

```bash
curl -fsSL https://github.com/NVIDIA/NeMo-Speech.cpp/raw/main/scripts/install.sh | sh
```

O **Haku ASR** é o modelo pt-BR usado na demo e **não está disponível para download**. Para estudar o pipeline, baixe o modelo base só-inglês (~700 MB) do Nemotron 3.5 ASR — o `iniciar.sh` procura por padrão `modelo/nemotron-3.5-asr-streaming-0.6b.q8_0.gguf`; se o seu arquivo tiver outro nome, aponte com `MODELO=<caminho> ./iniciar.sh`:

```bash
curl -fSL -o modelo/nemotron-speech-streaming-en-0.6b.q8_0.gguf --create-dirs \
  "https://huggingface.co/nvidia/nemotron-speech-streaming-en-0.6b/resolve/main/nemotron-speech-streaming-en-0.6b.q8_0.gguf"
```

```bash
# ou com a CLI do Hugging Face
pip install -U "huggingface_hub[cli]"
huggingface-cli download nvidia/nemotron-speech-streaming-en-0.6b \
  nemotron-speech-streaming-en-0.6b.q8_0.gguf --local-dir modelo
```

> **Modelo e scripts:** os scripts de inicialização (`iniciar.sh` e `expor.sh`) foram adequados ao **Nemotron 3.5 ASR** em GGUF q8_0 executado pelo `nemo-speech`. Para usar **outro modelo**, os scripts precisam ser ajustados (caminho, formato e runtime); trocar apenas o arquivo GGUF não garante compatibilidade.

A pasta `modelo/` está no `.gitignore` — o arquivo nunca será commitado.

---

## Quickstart

### Uso local

```bash
./iniciar.sh
```

O script sobe o **motor ASR** em `127.0.0.1:8080` (a primeira carga do modelo leva ~30–60 s) e a **aplicação** em `http://localhost:8300`. Abra **http://localhost:8300** → **"Criar sala nesta tela"**. Essa tela se torna o telão. Para encerrar tudo, `Ctrl+C` no terminal.

### Demonstração com celular (modo sala)

```bash
./expor.sh
```

O script garante a aplicação de pé (chama o `iniciar.sh` se preciso) e publica um link público `https://…trycloudflare.com` (com QR no terminal). Então:

1. **PC:** abra o link público → **Criar sala nesta tela** (o telão exibe o código da sala + QR).
2. **Celular:** escaneie o QR → autorize o microfone → segure o botão para falar (ou ative **Fala livre**).
3. **Telão:** acompanhe a transcrição palavra por palavra; ao final, copie ou baixe `.txt`.

> O HTTPS do túnel é o que permite ao navegador do celular liberar o microfone. O link temporário expira ao fechar o túnel — cada execução do `expor.sh` gera um link novo.

É possível criar **várias salas** (códigos diferentes) ao mesmo tempo. Várias pessoas podem **assistir** pelo mesmo link, mas há **um locutor por vez por sala**. Se a porta 8300 estiver em uso: `PORTA=8400 ./iniciar.sh`.

---

## Solução de problemas

| Sintoma | Causa provável | Solução |
|---|---|---|
| `porta 8300 já em uso` | outro serviço na porta | `PORTA=8400 ./iniciar.sh` |
| Motor não sobe | modelo não encontrado | confira o caminho em `MODELO` no `iniciar.sh`; logs em `/tmp/vox-motor.log` |
| Celular não libera microfone | página sem HTTPS | use sempre o link `https://` gerado pelo `expor.sh` |
| QR do telão não abre no celular | telão foi aberto via `localhost` | abra o telão pelo **link público** e recrie a sala |
| "Sala não encontrada" | aplicação reiniciou (salas ficam em memória) | crie a sala de novo no telão |
| Texto não aparece | motor caiu | veja `/tmp/vox-motor.log`; o hub avisa na tela e tenta de novo ao próximo áudio |
| Áudio trava/engasga | máquina sobrecarregada | feche programas pesados; prefira "segurar para falar" na demo |

Verificar a saúde dos serviços manualmente:

```bash
curl -s http://127.0.0.1:8080/ready     # motor ASR → {"ready": true, ...}
curl -s http://127.0.0.1:8300/healthz   # aplicação  → ok
```

---

## Referência rápida

| Item | Valor |
|---|---|
| Porta da aplicação | `8300` (HTTP + WebSocket, mesma origem) |
| Porta do motor ASR | `8080` (apenas `127.0.0.1`) |
| Idioma configurado | `pt-BR` |
| Áudio do cliente | PCM16, 16 kHz, mono |
| Logs | `/tmp/vox-motor.log`, `/tmp/vox-app.log` (modo script) |
| Variáveis úteis | `MODELO=…`, `PORTA=…`, `PORTA_MOTOR=…`, `MOTOR_WS=…`, `IDIOMA=…` |

---

## Resultados

Testes executados em tempo de desenvolvimento, na máquina-alvo (Linux, CPU de 12 núcleos, ~14 GB RAM, **sem GPU**), com `nemo-speech 0.2.0`:

| Validação | Resultado |
|---|---|
| Transcrição offline pt-BR (arquivo WAV) | Texto correto, com pontuação e normalização ("19" → "dezenove") |
| Velocidade do motor em CPU | **≈ 2,6× o tempo real** (11 s de áudio transcritos em ≈ 4 s, incluindo carga do modelo) |
| Streaming via WebSocket (protocolo do motor) | Deltas parciais emitidos durante a fala; enunciado final ao fim do silêncio |
| Testes ponta a ponta (sala → áudio → broadcast) | **11/11 aprovados** (criação de sala, entrada de locutor/espectador, parciais, final, métricas) |
| Casos de borda | Sala inexistente rejeitada; segundo locutor rebaixado a espectador com aviso; reconexão automática |
| Exposição pública (Cloudflare Tunnel) | Interface e WebSocket funcionais sobre HTTPS |
| Latência percebida na demo | Texto parcial praticamente imediato; finalização típica na casa das centenas de ms após a pausa |

As métricas de latência de finalização e velocidade do motor são exibidas ao vivo no rodapé do telão, reforçando o caráter de demonstrativo de tecnologia.

### Trabalhos futuros

- Suporte a múltiplos locutores simultâneos e diarização (identificação de *quem* falou);
- URL fixa com hospedagem em servidor gratuito (cloud) para demonstrações remotas contínuas;
- Exportação de relatórios de sessão.

---

## Estrutura do projeto

```text
vox-live-transcription/
├── index.html            # SPA: home / telão / celular
├── css/style.css         # tema premium (vidro, animações, responsivo)
├── js/app.js             # estado, WebSocket, salas, chat palavra a palavra
├── js/captura.js         # microfone → PCM16 16 kHz (resample linear)
├── js/audio-worklet.js   # AudioWorkletProcessor (blocos + nível RMS)
├── js/esfera.js          # esfera de voz (CSS) que reage ao áudio real
├── js/tema.js            # tema automático/claro/escuro (segue o sistema, persistido)
├── js/ui.js              # ajustes de interface e acessibilidade
├── js/config.js          # configuração opcional do app
├── js/qrcode.min.js      # gerador de QR Code (MIT, K. Arase) — vendored
├── assets/loro.svg       # ícone do Loro
├── assets/fonts/         # fonte Inter local (woff2)
├── assets/orb/           # GIFs animados dos 4 estados da esfera
├── assets/performance-haku-vs-nemotron.png  # gráfico comparativo de acerto
├── servidor.py           # HTTP estáticos + hub WS de salas + proxy p/ motor
├── requirements.txt      # websockets
├── iniciar.sh            # motor (:8080) + aplicação (:8300)
├── expor.sh              # Cloudflare Tunnel → link público HTTPS
└── modelo/               # GGUF do Haku ASR (ignorado pelo git)
```

---

## Autores

**Danilo Almeida Lopes** — estudante de Ciência de Dados e criador do modelo **Haku ASR**.

**Murilo Saraiva Aguiar** e **Raquel Gutierrez Oliveira** — participaram da idealização e da pesquisa do projeto, incluindo a identificação do dataset [CORAA](https://github.com/nilc-nlp/CORAA); não atuaram na implementação do código.

---

## Licenças

- Código deste repositório: uso livre no contexto do projeto
- Modelo base Nemotron 3.5 ASR Streaming (só-inglês): licença [NVIDIA Open Model License](https://www.nvidia.com/en-us/agreements/enterprise-software/nvidia-open-model-license/)
- **Haku ASR** (fine-tune pt-BR do Nemotron 3.5 ASR): derivado do modelo base sob os mesmos termos; pesos não distribuídos
- Dataset [CORAA](https://github.com/nilc-nlp/CORAA): ver termos de uso público do corpus
- Componentes: NeMo-Speech.cpp e cloudflared (Apache-2.0), qrcode-generator (MIT)
