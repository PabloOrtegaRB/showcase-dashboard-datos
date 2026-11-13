"""Genera el conjunto de datos FICTICIO del panel, siempre igual gracias a una semilla fija.

Valdora es una empresa inventada de servicios técnicos. Los clientes, montos y resultados no son reales.
Los datos tienen una historia simple y creíble: en verano (diciembre a febrero) sube la demanda de
climatización y baja el cumplimiento de plazos; en invierno sube la demanda de electricidad.

Uso:     python scripts/generar_datos.py
Salida:  datos/ordenes-semilla.js  (window.Valdora.SEMILLA, se carga sin servidor ni red)
"""
from __future__ import annotations

import json
import pathlib
import random
from datetime import date, timedelta

SEMILLA = 2026
RAIZ = pathlib.Path(__file__).resolve().parents[1]
SALIDA = RAIZ / "datos" / "ordenes-semilla.js"

# Órdenes por mes, de noviembre de 2025 a octubre de 2026 (240 en total).
VOLUMEN = {(2025, 11): 18, (2025, 12): 24, (2026, 1): 26, (2026, 2): 22, (2026, 3): 19, (2026, 4): 17,
           (2026, 5): 18, (2026, 6): 20, (2026, 7): 21, (2026, 8): 19, (2026, 9): 16, (2026, 10): 20}
CORTE_RECIENTES = date(2026, 10, 1)  # las solicitudes desde esta fecha pueden seguir abiertas

CLIENTES = [
    "Bodegas Arrayán Sur SpA", "Comercial Maitén Ltda.", "Distribuidora Lenga S.A.", "Logística Peumo Alto SpA",
    "Alimentos Coigüe Ltda.", "Clínica Quillay S.A.", "Colegio Canelo Norte SpA", "Hotel Tralca Ltda.",
    "Farmacias Boldo SpA", "Constructora Raulí Ltda.", "Supermercados Ulmo S.A.", "Centro Médico Litre SpA",
    "Imprenta Tepa Ltda.", "Gimnasio Avellano SpA", "Restaurante Luma Ltda.", "Oficinas Notro S.A.",
]
COMUNAS = ["Santiago", "Providencia", "Las Condes", "Ñuñoa", "Maipú", "Pudahuel", "San Bernardo",
           "Puente Alto", "La Florida", "Quilicura"]
PESO_COMUNAS = [16, 14, 13, 11, 10, 8, 7, 8, 8, 5]
SERVICIOS = {  # código: (monto mínimo, monto máximo, peso base)
    "MANTENCION_PREVENTIVA": (80_000, 350_000, 30),
    "MANTENCION_CORRECTIVA": (120_000, 900_000, 22),
    "CLIMATIZACION": (150_000, 1_200_000, 18),
    "ELECTRICIDAD": (90_000, 700_000, 18),
    "INSPECCION": (60_000, 250_000, 12),
}
PRIORIDADES = {"BAJA": (10, 20, 0.95), "MEDIA": (5, 45, 1.0), "ALTA": (3, 25, 1.1), "CRITICA": (1, 10, 1.25)}
# prioridad: (plazo comprometido en días, peso, recargo sobre el monto)


def pesos_servicio(mes: int) -> list[float]:
    pesos = {codigo: datos[2] for codigo, datos in SERVICIOS.items()}
    if mes in (12, 1, 2):  # verano austral
        pesos["CLIMATIZACION"] *= 2.2
    if mes in (6, 7, 8):  # invierno
        pesos["ELECTRICIDAD"] *= 1.4
        pesos["CLIMATIZACION"] *= 0.6
    return list(pesos.values())


def generar() -> list[dict]:
    azar = random.Random(SEMILLA)
    filas = []
    for (anio, mes), cantidad in VOLUMEN.items():
        inicio = date(anio, mes, 1)
        dias_mes = ((inicio.replace(day=28) + timedelta(days=4)).replace(day=1) - inicio).days
        for _ in range(cantidad):
            fecha = inicio + timedelta(days=azar.randrange(dias_mes))
            servicio = azar.choices(list(SERVICIOS), weights=pesos_servicio(mes))[0]
            prioridad = azar.choices(list(PRIORIDADES), weights=[p[1] for p in PRIORIDADES.values()])[0]
            plazo, _, recargo = PRIORIDADES[prioridad]
            minimo, maximo, _ = SERVICIOS[servicio]
            monto = round(azar.uniform(minimo, maximo) * recargo / 1000) * 1000

            if fecha >= CORTE_RECIENTES:
                estado = azar.choices(["COMPLETADA", "EN_CURSO", "PROGRAMADA", "CANCELADA"], weights=[45, 30, 20, 5])[0]
            else:
                estado = azar.choices(["COMPLETADA", "CANCELADA"], weights=[91, 9])[0]

            dias = satisfaccion = None
            if estado == "COMPLETADA":
                a_tiempo = azar.random() < (0.78 if mes in (12, 1, 2) else 0.9)
                dias = azar.randint(0, plazo) if a_tiempo else azar.randint(plazo + 1, plazo + 6)
                if azar.random() < 0.85:  # no todos los clientes responden la encuesta
                    opciones = [5, 5, 5, 4, 4, 3] if a_tiempo else [4, 3, 3, 2, 2, 1]
                    satisfaccion = azar.choice(opciones)

            filas.append({
                "fecha": fecha.isoformat(),
                "cliente": azar.choice(CLIENTES),
                "comuna": azar.choices(COMUNAS, weights=PESO_COMUNAS)[0],
                "servicio": servicio,
                "prioridad": prioridad,
                "estado": estado,
                "monto": monto,
                "dias_resolucion": dias,
                "satisfaccion": satisfaccion,
            })
    filas.sort(key=lambda f: f["fecha"])
    return [{"folio": f"OS-{i:04d}", **fila} for i, fila in enumerate(filas, start=1)]


def main() -> None:
    ordenes = generar()
    lineas = ",\n".join("  " + json.dumps(o, ensure_ascii=False) for o in ordenes)
    SALIDA.parent.mkdir(parents=True, exist_ok=True)
    SALIDA.write_text(
        "// Datos FICTICIOS generados por scripts/generar_datos.py (semilla fija). No editar a mano.\n"
        "window.Valdora = window.Valdora || {};\n"
        f"window.Valdora.SEMILLA = [\n{lineas}\n];\n",
        encoding="utf-8", newline="\n")
    completadas = [o for o in ordenes if o["estado"] == "COMPLETADA"]
    print(f"{len(ordenes)} órdenes ({len(completadas)} completadas) escritas en {SALIDA.relative_to(RAIZ)}")


if __name__ == "__main__":
    main()
