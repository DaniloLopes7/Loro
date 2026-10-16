#!/usr/bin/env python3

import asyncio
import json
import os
import re
import secrets
import time
from http import HTTPStatus
from pathlib import Path
from urllib.parse import urlparse, parse_qs

from websockets.asyncio.server import serve
from websockets.asyncio.client import connect as ws_connect
from websockets.datastructures import Headers
from websockets.http11 import Response

BASE_DIR = Path(__file__).resolve().parent

MOTOR_WS = os.environ.get(
    "MOTOR_WS", "ws://127.0.0.1:8080/v1/audio/transcriptions/realtime"
)
IDIOMA = os.environ.get("IDIOMA", "pt-BR")
HOST = os.environ.get("HOST", "0.0.0.0")
PORTA = int(os.environ.get("PORTA", "8300"))

ALFABETO_SALA = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"
TAG_IDIOMA_RE = re.compile(r"\s*<[a-z]{2}(?:-[A-Z]{2})?>\s*$")

MIME = {
    ".html": "text/html; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".js": "text/javascript; charset=utf-8",
    ".map": "application/json",
    ".json": "application/json",
    ".svg": "image/svg+xml",
    ".png": "image/png",
    ".ico": "image/x-icon",
    ".woff": "font/woff",
    ".woff2": "font/woff2",
    ".webmanifest": "application/manifest+json",
    ".txt": "text/plain; charset=utf-8",
}


_cache_estatico: dict[Path, tuple[float, bytes]] = {}


def carregar_estatico(caminho: Path):
    try:
        caminho = caminho.resolve()
        if not caminho.is_file() or BASE_DIR not in caminho.parents:
            return None, None
        mtime = caminho.stat().st_mtime
        cache = _cache_estatico.get(caminho)
        if cache and cache[0] == mtime:
            dados = cache[1]
        else:
            dados = caminho.read_bytes()
            _cache_estatico[caminho] = (mtime, dados)
        return dados, MIME.get(caminho.suffix.lower(), "application/octet-stream")
    except OSError:
        return None, None


def http_resposta(status: int, corpo: bytes, content_type: str = "text/plain; charset=utf-8"):
    try:
        razao = HTTPStatus(status).phrase
    except ValueError:
        razao = "OK"
    return Response(
        status,
        razao,
        Headers(
            [
                ("Content-Type", content_type),
                ("Content-Length", str(len(corpo))),
                ("Cache-Control", "no-cache"),
                ("X-Content-Type-Options", "nosniff"),
            ]
        ),
        corpo,
    )


def process_request(conn, request):
    """Serve os estáticos; '/ws' segue para o handshake WebSocket."""
    rota = urlparse(request.path).path
    if rota == "/ws":
        return None
    if rota == "/healthz":
        return http_resposta(200, b"ok")
    if request.method != "GET":
        return http_resposta(405, b"metodo nao permitido")
    if rota in ("/", "/index.html"):
        alvo = BASE_DIR / "index.html"
    else:
        alvo = BASE_DIR / rota.lstrip("/")
    dados, mime = carregar_estatico(alvo)
    if dados is None:
        return http_resposta(404, b"nao encontrado")
    return http_resposta(200, dados, mime)


def novo_codigo() -> str:
    while True:
        codigo = "".join(secrets.choice(ALFABETO_SALA) for _ in range(4))
        if codigo not in SALAS:
            return codigo


class Cliente:
    __slots__ = ("ws", "papel", "nome", "id")

    def __init__(self, ws, papel: str, nome: str):
        self.ws = ws
        self.papel = papel
        self.nome = nome
        self.id = secrets.token_hex(4)


class Sala:
    __slots__ = (
        "codigo",
        "clientes",
        "locutor",
        "motor",
        "tarefa_leitor",
        "parcial",
        "falando",
        "t_primeiro_frame",
        "t_ultimo_frame",
        "lock_motor",
        "criada_em",
    )

    def __init__(self, codigo: str):
        self.codigo = codigo
        self.clientes: dict = {}
        self.locutor = None
        self.motor = None
        self.tarefa_leitor: asyncio.Task | None = None
        self.parcial = ""
        self.falando = False
        self.t_primeiro_frame = 0.0
        self.t_ultimo_frame = 0.0
        self.lock_motor = asyncio.Lock()
        self.criada_em = time.time()


SALAS: dict[str, Sala] = {}


async def enviar(ws, msg: dict) -> bool:
    try:
        await ws.send(json.dumps(msg, ensure_ascii=False))
        return True
    except Exception:
        return False


async def broadcast(sala: Sala, msg: dict):
    mortos = [ws for ws in sala.clientes if not await enviar(ws, msg)]
    for ws in mortos:
        sala.clientes.pop(ws, None)


def estado_msg(sala: Sala) -> dict:
    nome_locutor = None
    if sala.locutor and sala.locutor in sala.clientes:
        nome_locutor = sala.clientes[sala.locutor].nome
    return {
        "tipo": "estado",
        "estado": "ouvindo" if sala.locutor else "aguardando",
        "locutor": nome_locutor,
        "falando": sala.falando,
        "participantes": len(sala.clientes),
    }


async def garantir_motor(sala: Sala):
    """Abre (se necessário) a sessão realtime com o nemo-speech serve."""
    async with sala.lock_motor:
        if sala.motor is not None and sala.motor.state.name == "OPEN":
            return True
        try:
            motor = await ws_connect(MOTOR_WS, max_size=None, ping_interval=25)
            await motor.send(
                json.dumps(
                    {
                        "type": "session.update",
                        "session": {
                            "language": IDIOMA,
                            "sample_rate": 16000,
                            "automatic_punctuation": True,
                            "word_timestamps": False,
                        },
                    }
                )
            )
        except Exception as exc:
            await broadcast(
                sala,
                {
                    "tipo": "erro",
                    "msg": f"Motor ASR indisponível ({exc}). Verifique o nemo-speech serve.",
                },
            )
            return False
        sala.motor = motor
        sala.tarefa_leitor = asyncio.create_task(leitor_motor(sala, motor))
        return True


async def leitor_motor(sala: Sala, motor):
    """Lê eventos da engine e replica para a sala."""
    parcial_visto = False
    try:
        async for bruto in motor:
            if isinstance(bruto, bytes):
                continue
            try:
                ev = json.loads(bruto)
            except ValueError:
                continue
            tipo = ev.get("type", "")

            if tipo.endswith("input_audio_transcription.delta"):
                delta = ev.get("delta") or ""
                if not delta:
                    continue
                sala.parcial += delta
                parcial_visto = True
                nome = (
                    sala.clientes[sala.locutor].nome
                    if sala.locutor in sala.clientes
                    else "Locutor"
                )
                await broadcast(
                    sala, {"tipo": "parcial", "texto": sala.parcial, "nome": nome}
                )

            elif tipo.endswith("input_audio_transcription.completed"):
                texto = TAG_IDIOMA_RE.sub("", (ev.get("transcript") or "").strip())
                sala.parcial = ""
                if not texto:
                    texto = "(áudio sem fala detectada)"
                nome = (
                    sala.clientes[sala.locutor].nome
                    if sala.locutor in sala.clientes
                    else "Locutor"
                )
                agora = time.monotonic()
                latencia_ms = (
                    max(0, round((agora - sala.t_ultimo_frame) * 1000))
                    if sala.t_ultimo_frame and not sala.falando
                    else None
                )
                velocidade = None
                processados = ev.get("audio_processed")
                if processados and sala.t_primeiro_frame:
                    decorrido = agora - sala.t_primeiro_frame
                    if decorrido > 0.5:
                        velocidade = round(processados / decorrido, 1)
                await broadcast(
                    sala,
                    {
                        "tipo": "final",
                        "texto": texto,
                        "nome": nome,
                        "ts": time.time(),
                        "latencia_ms": latencia_ms,
                        "velocidade": velocidade,
                    },
                )

            elif tipo == "error":
                await broadcast(
                    sala,
                    {"tipo": "erro", "msg": ev.get("error", {}).get("message", "erro no motor")},
                )
    except Exception:
        pass
    finally:
        if parcial_visto and sala.parcial:
            sala.parcial = ""
            await broadcast(sala, {"tipo": "parcial", "texto": "", "nome": ""})
        sala.motor = None
        await broadcast(sala, estado_msg(sala))


async def fechar_motor(sala: Sala):
    motor, sala.motor = sala.motor, None
    if motor is not None:
        try:
            await motor.close()
        except Exception:
            pass
    if sala.tarefa_leitor is not None:
        sala.tarefa_leitor.cancel()
        sala.tarefa_leitor = None


async def tratar_entrar(ws, sala: Sala, dados: dict) -> Cliente:
    papel = "falar" if dados.get("papel") == "falar" else "ver"
    nome = (dados.get("nome") or "").strip()[:24] or None
    cliente = Cliente(ws, papel, nome or ("Locutor" if papel == "falar" else "Espectador"))

    papel_efetivo = papel
    if papel == "falar":
        if sala.locutor is None:
            sala.locutor = ws
            await garantir_motor(sala)
        else:
            papel_efetivo = "ver"
            await enviar(
                ws,
                {
                    "tipo": "aviso",
                    "msg": "Já existe um locutor ativo nesta sala. Você entrou como espectador.",
                },
            )
    cliente.papel = papel_efetivo
    sala.clientes[ws] = cliente

    await enviar(
        ws,
        {
            "tipo": "entrou",
            "sala": sala.codigo,
            "papel": papel_efetivo,
            "nome": cliente.nome,
            "id": cliente.id,
            "idioma": IDIOMA,
        },
    )
    if sala.parcial:
        nome = sala.clientes[sala.locutor].nome if sala.locutor in sala.clientes else "Locutor"
        await enviar(ws, {"tipo": "parcial", "texto": sala.parcial, "nome": nome})
    await broadcast(sala, estado_msg(sala))
    return cliente


async def sair_da_sala(sala: Sala, ws):
    cliente = sala.clientes.pop(ws, None)
    if cliente is None:
        return
    if sala.locutor is ws:
        sala.locutor = None
        sala.falando = False
        sala.parcial = ""
        await fechar_motor(sala)
    await broadcast(sala, estado_msg(sala))
    if not sala.clientes:
        SALAS.pop(sala.codigo, None)


async def handler(ws):
    query = parse_qs(urlparse(ws.request.path).query)
    codigo = (query.get("sala", [""])[0] or "").strip().upper()
    papel = query.get("papel", ["ver"])[0]
    nome = query.get("nome", [""])[0]

    if not codigo:
        sala = Sala(novo_codigo())
        SALAS[sala.codigo] = sala
    else:
        sala = SALAS.get(codigo)
        if sala is None:
            await enviar(
                ws,
                {
                    "tipo": "erro",
                    "codigo": "sala_nao_encontrada",
                    "msg": f"Sala {codigo} não encontrada. Confira o código no telão.",
                },
            )
            await ws.close(4004)
            return

    cliente = await tratar_entrar(ws, sala, {"papel": papel, "nome": nome})

    try:
        async for msg in ws:
            if isinstance(msg, bytes):
                if ws is not sala.locutor or not sala.falando:
                    continue
                if not await garantir_motor(sala):
                    continue
                agora = time.monotonic()
                if not sala.t_primeiro_frame:
                    sala.t_primeiro_frame = agora
                sala.t_ultimo_frame = agora
                try:
                    await sala.motor.send(msg)
                except Exception:
                    pass
                continue

            try:
                dados = json.loads(msg)
            except ValueError:
                continue
            tipo = dados.get("tipo")

            if tipo == "ptt" and ws is sala.locutor:
                sala.falando = bool(dados.get("ativo"))
                if sala.falando:
                    ok = await garantir_motor(sala)
                    if ok and sala.parcial:
                        sala.parcial = ""
                await broadcast(sala, estado_msg(sala))

            elif tipo == "nivel" and ws is sala.locutor and sala.falando:
                b = dados.get("b")
                if isinstance(b, list) and len(b) == 3:
                    try:
                        valores = [min(1.0, max(0.0, float(x))) for x in b]
                    except (TypeError, ValueError):
                        continue
                    payload = {"tipo": "nivel", "b": valores}
                    for outro in list(sala.clientes):
                        if outro is not ws:
                            await enviar(outro, payload)

            elif tipo == "commit" and ws is sala.locutor:
                if sala.motor is not None:
                    try:
                        await sala.motor.send(json.dumps({"type": "input_audio_buffer.commit"}))
                    except Exception:
                        pass

            elif tipo == "renomear":
                novo = (dados.get("nome") or "").strip()[:24]
                if novo:
                    cliente.nome = novo
                    await broadcast(sala, estado_msg(sala))

            elif tipo == "ping":
                await enviar(ws, {"tipo": "pong", "ts": dados.get("ts")})
    finally:
        await sair_da_sala(sala, ws)


async def faxina():
    while True:
        await asyncio.sleep(300)
        agora = time.time()
        for codigo, sala in list(SALAS.items()):
            if not sala.clientes and agora - sala.criada_em > 600:
                await fechar_motor(sala)
                SALAS.pop(codigo, None)


async def main():
    print(f"[vox-ao-vivo] motor ASR : {MOTOR_WS}")
    print(f"[vox-ao-vivo] idioma    : {IDIOMA}")
    print(f"[vox-ao-vivo] interface : http://localhost:{PORTA}")
    async with serve(
        handler,
        HOST,
        PORTA,
        process_request=process_request,
        ping_interval=25,
        ping_timeout=60,
        max_size=4 * 1024 * 1024,
    ):
        await faxina()


if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        pass
