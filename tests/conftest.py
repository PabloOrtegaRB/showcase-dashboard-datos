"""Fixtures compartidas: servidor HTTP local, navegador Playwright y datos de ejemplo.

Variable opcional PW_CHANNEL: por ejemplo "msedge" para usar el navegador Edge instalado
en lugar del Chromium que descarga `playwright install`.
"""
import functools
import http.server
import os
import socketserver
import threading

import pytest
from playwright.sync_api import sync_playwright

from tests.ayudas import RAIZ, cargar_semilla


class _ManejadorSilencioso(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *args):  # silencia el registro de cada petición
        pass


class _Servidor(socketserver.ThreadingMixIn, socketserver.TCPServer):
    daemon_threads = True
    allow_reuse_address = True


@pytest.fixture(scope="session")
def base_url():
    manejador = functools.partial(_ManejadorSilencioso, directory=str(RAIZ))
    with _Servidor(("127.0.0.1", 0), manejador) as servidor:
        threading.Thread(target=servidor.serve_forever, daemon=True).start()
        yield f"http://127.0.0.1:{servidor.server_address[1]}"
        servidor.shutdown()


@pytest.fixture(scope="session")
def navegador():
    with sync_playwright() as p:
        browser = p.chromium.launch(channel=os.environ.get("PW_CHANNEL") or None)
        yield browser
        browser.close()


@pytest.fixture(scope="session")
def semilla():
    return cargar_semilla()


def nueva_pagina(navegador, **opciones):
    """Cada prueba usa un contexto nuevo: almacenamiento local vacío y registro de errores de consola."""
    contexto = navegador.new_context(locale="es-CL", accept_downloads=True, **opciones)
    pagina = contexto.new_page()
    pagina.errores_consola = []
    pagina.on("console", lambda m: pagina.errores_consola.append(m.text) if m.type == "error" else None)
    pagina.on("pageerror", lambda e: pagina.errores_consola.append(str(e)))
    return contexto, pagina


@pytest.fixture
def pagina(navegador):
    contexto, pg = nueva_pagina(navegador, viewport={"width": 1366, "height": 900})
    yield pg
    contexto.close()


@pytest.fixture
def pagina_movil(navegador):
    contexto, pg = nueva_pagina(navegador, viewport={"width": 390, "height": 844}, is_mobile=True, has_touch=True)
    yield pg
    contexto.close()
