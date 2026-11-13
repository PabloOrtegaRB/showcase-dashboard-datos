"""Ayudas de prueba: carga los datos de ejemplo y calcula en Python, de forma independiente, lo que el panel
debería mostrar. Si el JavaScript calcula mal un indicador, estas cifras no coinciden."""
import json
import math
import pathlib
from decimal import ROUND_HALF_UP, Decimal

RAIZ = pathlib.Path(__file__).resolve().parents[1]
PLAZOS = {"BAJA": 10, "MEDIA": 5, "ALTA": 3, "CRITICA": 1}
SERVICIOS = {"MANTENCION_PREVENTIVA": "Mantención preventiva", "MANTENCION_CORRECTIVA": "Mantención correctiva",
             "CLIMATIZACION": "Climatización", "ELECTRICIDAD": "Electricidad", "INSPECCION": "Inspección"}
ESTADOS = {"COMPLETADA": "Completada", "EN_CURSO": "En curso", "PROGRAMADA": "Programada", "CANCELADA": "Cancelada"}
PRIORIDADES = {"BAJA": "Baja", "MEDIA": "Media", "ALTA": "Alta", "CRITICA": "Crítica"}


def cargar_semilla() -> list[dict]:
    texto = (RAIZ / "datos" / "ordenes-semilla.js").read_text(encoding="utf-8")
    return json.loads(texto[texto.index("["): texto.rindex("]") + 1])


def clp(valor: float) -> str:
    """Igual que el panel: redondeo de Math.round y separador de miles con punto."""
    return "$" + f"{math.floor(valor + 0.5):,}".replace(",", ".")


def un_decimal(valor: float) -> str:
    """Igual que Intl.NumberFormat("es-CL") con 1 decimal: redondeo hacia arriba sobre el valor binario exacto."""
    return str(Decimal(valor).quantize(Decimal("0.1"), rounding=ROUND_HALF_UP)).replace(".", ",")


def entero_desde_clp(texto: str) -> int:
    return int(texto.replace("$", "").replace(".", "").strip())


def en_meses(ordenes: list[dict], desde: str, hasta: str) -> list[dict]:
    return [o for o in ordenes if desde <= o["fecha"][:7] <= hasta]


def esperados(ordenes: list[dict]) -> dict:
    completadas = [o for o in ordenes if o["estado"] == "COMPLETADA"]
    ingresos = sum(o["monto"] for o in completadas)
    a_tiempo = sum(1 for o in completadas if o["dias_resolucion"] <= PLAZOS[o["prioridad"]])
    respuestas = [o["satisfaccion"] for o in completadas if o["satisfaccion"] is not None]
    n = len(completadas)
    return {
        "kpi-ordenes": str(len(ordenes)),
        "kpi-ingresos": clp(ingresos),
        "kpi-ticket": clp(ingresos / n),
        "kpi-cumplimiento": un_decimal(a_tiempo / n * 100) + " %",
        "kpi-tiempo": un_decimal(sum(o["dias_resolucion"] for o in completadas) / n) + " días",
        "kpi-satisfaccion": un_decimal(sum(respuestas) / len(respuestas)) + " de 5",
    }


def abrir(pagina, base_url: str) -> None:
    pagina.goto(f"{base_url}/index.html")
    pagina.wait_for_selector("html[data-listo]", state="attached")
