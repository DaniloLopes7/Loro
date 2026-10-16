# Documentação do Projeto — Vox ao Vivo

**Sala de transcrição de voz em tempo real com IA 100% local (CPU)**

---

## 1. Objetivo e o demonstrativo construído

O objetivo do projeto é aplicar um modelo de inteligência artificial de reconhecimento automático de fala (ASR, do inglês *Automatic Speech Recognition*) em um **demonstrativo de tecnologia funcional**, executado integralmente de forma local e em CPU, sem dependência de serviços de nuvem de IA.

O demonstrativo construído chama-se **Vox ao Vivo**: uma **sala de transcrição em tempo real** na qual:

- o **celular** funciona como microfone — o participante entra na sala escaneando um QR Code e fala pelo aparelho;
- o **modelo de IA**, executado localmente em CPU, transcreve a fala em tempo real;
- o **PC** funciona como telão — a transcrição surge palavra por palavra, com pontuação, nome do locutor, horário e métricas de desempenho (latência de finalização e velocidade relativa ao tempo real).

Tudo ocorre por meio de uma interface web com identidade visual própria — **Sinal Silencioso** (preto e off-white, tipografia sóbria, esfera de voz em canvas que reage ao áudio em tempo real e linhas de transcrição) — disponível em tema claro e escuro, acessível por navegador comum, sem instalação de aplicativos.

---

## 2. Fundamentação teórica

### 2.1 Reconhecimento automático de fala (ASR)

ASR é a tarefa de converter sinal de fala em texto. Sistemas modernos utilizam arquiteturas de redes neurais profundas treinadas sobre grandes volumes de áudio transcrito. Neste projeto, utiliza-se um modelo de arquitetura **FastConformer cache-aware com decodificador RNN-T**.

- **FastConformer**: variação eficiente da arquitetura Conformer (convoluções + autoatenção) para codificação acústica de fala.
- **Cache-aware (streaming)**: o codificador reutiliza ativações de quadros anteriores ("cache"), processando apenas os novos quadros de áudio a cada passo — elimina recomputação e reduz a latência ponta a ponta, requisito essencial para transcrição ao vivo.
- **RNN-T** (*Recurrent Neural Network Transducer*): decodificador que emite o texto em *streaming* (token a token), permitindo exibir **resultados parciais** enquanto a pessoa ainda fala e **resultados finais** ao fim de cada enunciado.

### 2.2 Quantização e execução em CPU

Para viabilizar a execução local em CPU (sem GPU), o modelo é utilizado no formato **GGUF** com quantização **q8_0** (pesos em 8 bits): o artefato resultante tem cerca de **742 MB** e é executado por um runtime C++ nativo otimizado, o **NeMo-Speech.cpp**, sem necessidade de frameworks pesados de deep learning.

### 2.3 Comunicação em tempo real

A transcrição ao vivo exige canal bidirecional persistente. Utiliza-se **WebSocket**:

- celular/PC ↔ aplicação: WebSocket (nível de aplicação: salas, eventos de texto);
- aplicação ↔ motor ASR: WebSocket em *loopback* (protocolo de eventos do runtime, com *deltas* de texto e enunciados completos).

---

## 3. Modelo e treinamento

### 3.1 Modelo base

O motor de reconhecimento é o **Nemotron** (família Nemotron ASR da NVIDIA), com aproximadamente **600 milhões de parâmetros**. O modelo base disponibilizado pelo desenvolvedor reconhecia apenas **inglês**.

### 3.2 Adaptação para o português — dataset CORAA

Para habilitar o reconhecimento de **português brasileiro**, foi realizado **fine-tuning** do modelo utilizando o dataset **CORAA** (*Corpus of Annotated Audios*), um corpus brasileiro de áudio transcrito, de uso público, amplamente adotado em trabalhos de reconhecimento de fala em português.

O fine-tuning adapta os pesos do modelo base aos padrões acústicos e linguísticos do português falado no Brasil, preservando as características do modelo original importantes ao demonstrativo: emissão em *streaming*, pontuação automática e capitalização.

### 3.3 Distribuição do artefato

O modelo adaptado é empacotado em **GGUF q8_0** e executado pelo **NeMo-Speech.cpp** com inferência em CPU, resultando em um pipeline leve, reproduzível em computador pessoal comum e adequado a demonstrações ao vivo.

### 3.4 Configuração de inferência adotada

- Amostragem de entrada: **16 kHz, mono, PCM 16 bits** (o celular faz o resample do áudio do navegador para essa taxa);
- Idioma do decodificador: **pt-BR**;
- Pontuação/capitalização automáticas: **ativadas**;
- Normalização inversa de texto ativa (ex.: "19" → "dezenove");
- Detecção automática de fim de enunciado por silêncio (*endpointing*).

---

## 4. Arquitetura do sistema

### 4.1 Visão geral

```
 CELULAR (microfone)
      │  HTTPS/WSS — link público do túnel
      ▼
servidor.py :8300 ── interface web + hub de salas + proxy
      │  WebSocket (loopback)
      ▼
nemo-speech :8080 ── motor ASR Nemotron + CORAA (GGUF q8_0, CPU local)
      │
      ▼  broadcast: texto parcial → final
PC / TELÃO (espectadores da sala)
```

O sistema é composto por quatro blocos:

1. **Motor ASR** (`nemo-speech serve`): runtime nativo que carrega o GGUF q8_0 e expõe, apenas em *loopback* (`127.0.0.1:8080`), um endpoint WebSocket de transcrição em tempo real. Nunca é exposto à rede.
2. **Hub da aplicação** (`servidor.py`, Python + `websockets`): em uma única porta (`8300`) entrega a interface estática, administra **salas** (código curto de 4 caracteres), controla **papéis** (um locutor por sala; espectadores ilimitados) e faz *proxy* do áudio do locutor ao motor, **broadcast** dos eventos de texto a todos da sala e **métricas** (latência de finalização; velocidade em múltiplos do tempo real).
3. **Interface web** (HTML/CSS/JS, sem framework/build): três telas — *home* (criar/entrar), *telão* (código + QR + chat em tempo real + métricas + exportação) e *celular* (captura do microfone com AudioWorklet, botão "segurar para falar", modo "fala livre", orb reativo à voz).
4. **Exposição pública** (Cloudflare Tunnel): gera URL `https://…trycloudflare.com` que aponta para a aplicação local. O HTTPS é requisito dos navegadores para liberar o microfone fora de `localhost`.

### 4.2 Protocolos

**Cliente ↔ aplicação** (`ws(s)://host:8300/ws?sala=•&papel=•&nome=•`):

| Direção | Tipo | Uso |
|---|---|---|
| binário | PCM16 @16 kHz | áudio do locutor (só em fluxo "falando") |
| JSON `ptt` | `{tipo:"ptt", ativo}` | início/fim de fala |
| JSON `commit` | `{tipo:"commit"}` | finalizar enunciado imediatamente |
| JSON | `entrou`, `estado`, `parcial`, `final`, `erro`/`aviso` | eventos do hub aos clientes |

**Aplicação ↔ motor** (`ws://127.0.0.1:8080/v1/audio/transcriptions/realtime`):
`session.update` (idioma/pt-BR, taxa 16 kHz) → quadros binários PCM16 → eventos `…transcription.delta` (texto parcial) e `…transcription.completed` (enunciado final, com pontuação).

### 4.3 Decisões de design

- **Mesma origem** para página e WebSocket (evita CORS e simplifica o HTTPS pelo túnel);
- **Motor em loopback** (superfície de exposição mínima);
- **Salas em memória** (o demonstrativo não requer banco de dados);
- **Um locutor por vez por sala** (previsibilidade de áudio; viewers ilimitados);
- **Interface sem build** (facilita reprodução).

---

## 5. Metodologia de execução

1. **Ambiente**: Linux, Python 3.14, 12 núcleos de CPU, ~14 GB RAM, **sem uso de GPU**.
2. **Runtime**: instalação do binário CPU oficial do NeMo-Speech.cpp (sem compilação), `nemo-speech 0.2.0`.
3. **Modelo**: artefato GGUF q8_0 do projeto, carregado via `--asr-model`.
4. **Backend**: `servidor.py` — estáticos + hub WS + proxy do motor (dependência única: `websockets`).
5. **Captura**: navegador (`getUserMedia` + `AudioWorklet`), resample linear para 16 kHz, envio em quadros de ~160 ms.
6. **Exposição**: `cloudflared` (*quick tunnel*) para HTTPS público gratuito.
7. **Validação**: testes de ponta a ponta automatizados e casos de borda (seção 6).

Para reproduzir: consultar o [guia de uso](guia-de-uso.md) e os scripts `iniciar.sh` / `expor.sh`.

---

## 6. Resultados

Os testes foram executados em tempo de desenvolvimento, na máquina-alvo (CPU, sem GPU):

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

---

## 7. Conclusão e trabalhos futuros

O projeto resultou em um demonstrativo funcional de transcrição de voz em tempo real, executado localmente em CPU, com modelo Nemotron adaptado ao português brasileiro por fine-tuning com o dataset CORAA, e uma experiência de uso simples: **o celular fala, o telão mostra**.

Como evoluções previstas: suporte a múltiplos locutores simultâneos, diarização (identificação de *quem* falou), URL fixa com hospedagem em servidor gratuito (cloud) para demonstrações remotas contínuas e exportação de relatórios de sessão.

---

## Referências

1. NVIDIA — *Nemotron 3.5 ASR Streaming 0.6B* (modelo base). Disponível em: https://huggingface.co/nvidia/nemotron-3.5-asr-streaming-0.6b
2. NVIDIA — *NeMo-Speech.cpp* (runtime nativo de inferência). Disponível em: https://github.com/NVIDIA/NeMo-Speech.cpp
3. CORAA — *Corpus of Annotated Audios* (dataset de fala em português brasileiro utilizado no fine-tuning). Disponível em: https://github.com/nilc-nlp/CORAA
4. Cloudflare — *cloudflared* (túnel HTTPS). Disponível em: https://github.com/cloudflare/cloudflared
5. Documento de operação do sistema: [guia-de-uso.md](guia-de-uso.md)
