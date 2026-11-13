"""Genera las capturas reales de docs/capturas con Playwright.

Uso:  python scripts/capturas.py                   (usa Chromium de Playwright)
      PW_CHANNEL=msedge python scripts/capturas.py   (usa Edge instalado)
"""
import functools
import http.server
import os
import pathlib
import socketserver
import threading

from playwright.sync_api import sync_playwright

RAIZ = pathlib.Path(__file__).resolve().parents[1]
SALIDA = RAIZ / "docs" / "capturas"


class _Silencioso(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *args):
        pass


def abrir(pagina, base):
    pagina.goto(f"{base}/index.html")
    pagina.wait_for_selector("html[data-listo]", state="attached")


def main():
    SALIDA.mkdir(parents=True, exist_ok=True)
    manejador = functools.partial(_Silencioso, directory=str(RAIZ))
    with socketserver.ThreadingTCPServer(("127.0.0.1", 0), manejador) as srv:
        threading.Thread(target=srv.serve_forever, daemon=True).start()
        base = f"http://127.0.0.1:{srv.server_address[1]}"
        with sync_playwright() as p:
            navegador = p.chromium.launch(channel=os.environ.get("PW_CHANNEL") or None)

            escritorio = navegador.new_context(locale="es-CL", viewport={"width": 1440, "height": 900}).new_page()
            abrir(escritorio, base)
            escritorio.screenshot(path=SALIDA / "01-panel-escritorio.png", full_page=True)

            # Filtro cruzado: clic en la barra de Climatización y tooltip sobre enero.
            escritorio.set_viewport_size({"width": 1440, "height": 1400})
            escritorio.locator('#grafico-servicios .zona[data-clave="CLIMATIZACION"]').click()
            escritorio.evaluate("document.activeElement.blur()")
            escritorio.locator('#grafico-ingresos .zona[data-clave="2026-01"]').hover()
            arriba = escritorio.locator(".filtros").bounding_box()
            abajo = escritorio.locator("#grafico-servicios").bounding_box()
            escritorio.screenshot(path=SALIDA / "02-filtro-cruzado.png", clip={
                "x": arriba["x"] - 10, "y": arriba["y"] - 10, "width": arriba["width"] + 20,
                "height": abajo["y"] + abajo["height"] - arriba["y"] + 20})
            escritorio.mouse.move(5, 5)
            escritorio.click("#limpiar-filtros")

            # Formulario con errores de validación.
            escritorio.click("#boton-nueva")
            escritorio.fill("#campo-cliente", "Va")
            escritorio.select_option("#campo-estado", "COMPLETADA")
            escritorio.fill("#campo-monto", "12,5")
            escritorio.get_by_role("button", name="Guardar orden").click()
            escritorio.locator("#dialogo-orden").screenshot(path=SALIDA / "03-formulario-validacion.png")
            escritorio.keyboard.press("Escape")

            # Informe de una importación CSV con filas inválidas.
            escritorio.set_input_files("#archivo-csv", str(RAIZ / "datos" / "ejemplo-importacion.csv"))
            escritorio.locator("#dialogo-informe").screenshot(path=SALIDA / "04-informe-importacion.png")
            escritorio.click("#cerrar-informe")

            movil = navegador.new_context(locale="es-CL", viewport={"width": 390, "height": 844}, is_mobile=True,
                                          has_touch=True).new_page()
            abrir(movil, base)
            movil.evaluate("document.querySelector('.kpis').scrollIntoView({ block: 'start' })")
            movil.screenshot(path=SALIDA / "05-movil-indicadores.png")
            movil.evaluate("document.querySelector('.tabla-tarjeta').scrollIntoView({ block: 'start' })")
            movil.screenshot(path=SALIDA / "06-movil-tabla.png")

            oscuro = navegador.new_context(locale="es-CL", viewport={"width": 1440, "height": 900}, color_scheme="dark").new_page()
            abrir(oscuro, base)
            oscuro.screenshot(path=SALIDA / "07-modo-oscuro.png")
            navegador.close()
        srv.shutdown()
    print("Capturas generadas en", SALIDA.relative_to(RAIZ))


if __name__ == "__main__":
    main()
