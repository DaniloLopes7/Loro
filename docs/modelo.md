# Modelo de IA — o que baixar e onde baixar

O motor de transcrição **não está incluído neste repositório** (são centenas de MB e há limite de tamanho no GitHub). Esta página explica exatamente **qual modelo baixar**, **onde baixar** e **onde colocar o arquivo**.

---

## 1. Qual modelo

**NVIDIA Nemotron 3.5 ASR Streaming 0.6B**

| Característica | Valor |
|---|---|
| Tarefa | Reconhecimento automático de fala (ASR) em *streaming* |
| Arquitetura | FastConformer *cache-aware* + decodificador RNN-T |
| Parâmetros | ~600 milhões (0.6B) |
| Arquivo necessário | `nemotron-3.5-asr-streaming-0.6b.q8_0.gguf` |
| Tamanho do arquivo | ~742 MB (quantização q8_0 — roda em CPU) |
| Licença do modelo | [OpenMDW-1.1](https://openmdw.ai/license/1-1/) |

O formato **GGUF q8_0** é o que permite executar o modelo **100% local em CPU**, sem GPU e sem enviar áudio para a nuvem. 

> Contexto do projeto: conforme descrito em [documentacao.md](documentacao.md), o modelo base foi adaptado ao português brasileiro por *fine-tuning* com o dataset **CORAA** (*Corpus of Annotated Audios*). O artefato de inferência distribuído no repositório do Hugging Face é o utilizado pelo demonstrativo.

## 2. Onde baixar

Repositório oficial no Hugging Face:

**https://huggingface.co/nvidia/nemotron-3.5-asr-streaming-0.6b**

### Opção A — apenas o arquivo GGUF (recomendado, ~742 MB)

```bash
# curl (link direto)
curl -fSL -o nemotron-3.5-asr-streaming-0.6b.q8_0.gguf \
  "https://huggingface.co/nvidia/nemotron-3.5-asr-streaming-0.6b/resolve/main/nemotron-3.5-asr-streaming-0.6b.q8_0.gguf"
```

```bash
# ou com a CLI do Hugging Face
pip install -U "huggingface_hub[cli]"
huggingface-cli download nvidia/nemotron-3.5-asr-streaming-0.6b \
  nemotron-3.5-asr-streaming-0.6b.q8_0.gguf --local-dir .
```

### Opção B — repositório completo (~11 GB — só para estudo/retreino)

Inclui o checkpoint `.nemo`, os pesos `.safetensors`, tokenizer e os gráficos do model card. Requer [Git LFS](https://git-lfs.com):

```bash
git lfs install
git clone https://huggingface.co/nvidia/nemotron-3.5-asr-streaming-0.6b
```

## 3. Onde colocar o arquivo

O script `iniciar.sh` procura o modelo por padrão em:

```
vox-live-transcription/modelo/nemotron-3.5-asr-streaming-0.6b.q8_0.gguf
```

Então:

```bash
cd vox-live-transcription
mkdir -p modelo
# baixe o GGUF para dentro de modelo/ (ou mova um download existente para lá)
mv ~/Downloads/nemotron-3.5-asr-streaming-0.6b.q8_0.gguf modelo/
./iniciar.sh
```

A pasta `modelo/` está no `.gitignore` — o arquivo nunca será commitado.

### Caminho personalizado

Se o arquivo estiver em outro lugar, aponte com a variável `MODELO`:

```bash
MODELO="/caminho/para/nemotron-3.5-asr-streaming-0.6b.q8_0.gguf" ./iniciar.sh
```

## 4. Runtime necessário

Além do modelo, é preciso o runtime nativo que executa o GGUF — **NeMo-Speech.cpp** (NVIDIA, Apache-2.0):

```bash
curl -fsSL https://github.com/NVIDIA/NeMo-Speech.cpp/raw/main/scripts/install.sh | sh
```

O binário é instalado em `~/.local/bin/nemo-speech` (sem `sudo`). O `iniciar.sh` verifica automaticamente se ele existe antes de subir o motor.

## 5. Verificação rápida

```bash
# depois de ./iniciar.sh:
curl -s http://127.0.0.1:8080/ready     # motor ASR → {"ready": true, ...}
curl -s http://127.0.0.1:8300/healthz   # aplicação  → ok
```

Problemas? Consulte a seção **Solução de problemas** em [guia-de-uso.md](guia-de-uso.md).
