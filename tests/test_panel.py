"""Pruebas de extremo a extremo del panel: carga, indicadores, gráficos, filtros, tabla y diseño adaptable."""
from collections import Counter

from playwright.sync_api import expect

from tests.ayudas import SERVICIOS, abrir, clp, en_meses, entero_desde_clp, esperados
from tests.conftest import nueva_pagina

KPIS = ["kpi-ordenes", "kpi-ingresos", "kpi-ticket", "kpi-cumplimiento", "kpi-tiempo", "kpi-satisfaccion"]


def leer_kpis(pagina):
    return {k: pagina.locator(f"#{k}").inner_text() for k in KPIS}


def test_carga_sin_errores_y_con_aviso_demostrativo(pagina, base_url):
    abrir(pagina, base_url)
    expect(pagina).to_have_title("Panel de indicadores · Valdora (demostrativo)")
    expect(pagina.locator(".demo-aviso")).to_contain_text("Proyecto demostrativo — desarrollo propio, no asociado a un cliente real.")
    expect(pagina.locator("#periodo-texto")).to_have_text("Últimos 12 meses: nov 2025 – oct 2026 · 240 órdenes en la selección")
    expect(pagina.locator("#aviso-almacen")).to_be_hidden()
    assert pagina.errores_consola == []


def test_los_indicadores_coinciden_con_un_calculo_independiente(pagina, base_url, semilla):
    abrir(pagina, base_url)
    assert leer_kpis(pagina) == esperados(semilla)
    completadas = sum(1 for o in semilla if o["estado"] == "COMPLETADA")
    expect(pagina.locator("#kpi-ordenes-detalle")).to_have_text(f"{completadas} completadas")


def test_cada_grafico_tiene_sus_marcas_y_una_tabla_de_datos_equivalente(pagina, base_url, semilla):
    abrir(pagina, base_url)
    assert pagina.locator("#grafico-ingresos .zona").count() == 12
    assert pagina.locator("#grafico-plazos .zona").count() == 12
    assert pagina.locator("#grafico-plazos path.trazo").count() == 1
    assert pagina.locator("#grafico-servicios .zona").count() == 5
    assert pagina.locator("#grafico-comunas .zona").count() == 10
    assert pagina.locator("#grafico-estados .segmento").count() == len({o["estado"] for o in semilla})
    expect(pagina.locator("#grafico-estados .leyenda li")).to_have_count(4)

    # La tabla de datos del gráfico de ingresos suma lo mismo que el indicador.
    pagina.locator("#grafico-ingresos summary").click()
    filas = pagina.locator("#grafico-ingresos .tabla-mini tbody tr")
    expect(filas).to_have_count(12)
    suma = sum(entero_desde_clp(t) for t in pagina.locator("#grafico-ingresos .tabla-mini tbody td:nth-of-type(1)").all_inner_texts())
    assert clp(suma) == pagina.locator("#kpi-ingresos").inner_text()

    pagina.locator("#grafico-servicios summary").click()
    conteo = Counter(o["servicio"] for o in semilla)
    filas_servicio = pagina.locator("#grafico-servicios .tabla-mini tbody tr")
    leidas = {filas_servicio.nth(i).locator("th").inner_text(): int(filas_servicio.nth(i).locator("td").inner_text())
              for i in range(filas_servicio.count())}
    assert leidas == {SERVICIOS[k]: v for k, v in conteo.items()}


def test_filtrar_por_servicio_actualiza_todo_y_resalta_la_barra(pagina, base_url, semilla):
    abrir(pagina, base_url)
    pagina.select_option("#filtro-servicio", "CLIMATIZACION")
    clima = [o for o in semilla if o["servicio"] == "CLIMATIZACION"]
    assert leer_kpis(pagina) == esperados(clima)
    expect(pagina.locator("#resumen-tabla")).to_have_text(f"Mostrando 1–10 de {len(clima)} órdenes")
    expect(pagina.locator('#grafico-servicios .zona[data-clave="CLIMATIZACION"]')).to_have_attribute("aria-pressed", "true")
    # Las demás barras siguen visibles como contexto, pero atenuadas.
    assert pagina.locator("#grafico-servicios path.atenuada").count() == 4
    assert set(pagina.locator("#cuerpo-tabla td:nth-child(5)").all_inner_texts()) == {"Climatización"}


def test_clic_y_teclado_sobre_las_barras_alternan_el_filtro(pagina, base_url, semilla):
    abrir(pagina, base_url)
    pagina.locator('#grafico-servicios .zona[data-clave="ELECTRICIDAD"]').click()
    expect(pagina.locator("#filtro-servicio")).to_have_value("ELECTRICIDAD")
    expect(pagina.locator("#kpi-ordenes")).to_have_text(str(sum(o["servicio"] == "ELECTRICIDAD" for o in semilla)))
    # El foco vuelve a la misma barra después de redibujar: Enter quita el filtro.
    expect(pagina.locator('#grafico-servicios .zona[data-clave="ELECTRICIDAD"]')).to_be_focused()
    pagina.keyboard.press("Enter")
    expect(pagina.locator("#filtro-servicio")).to_have_value("")
    expect(pagina.locator("#kpi-ordenes")).to_have_text("240")


def test_un_bloque_de_la_barra_de_estados_filtra_por_estado(pagina, base_url, semilla):
    abrir(pagina, base_url)
    pagina.locator('#grafico-estados .segmento[data-clave="CANCELADA"]').click()
    canceladas = [o for o in semilla if o["estado"] == "CANCELADA"]
    expect(pagina.locator("#kpi-ordenes")).to_have_text(str(len(canceladas)))
    expect(pagina.locator("#kpi-ticket")).to_have_text("—")  # ninguna cancelada está completada
    assert set(pagina.locator("#cuerpo-tabla .estado").all_inner_texts()) == {"Cancelada"}


def test_periodos_predefinidos_y_rango_personalizado(pagina, base_url, semilla):
    abrir(pagina, base_url)
    pagina.select_option("#filtro-periodo", "3")
    trimestre = en_meses(semilla, "2026-08", "2026-10")
    expect(pagina.locator("#periodo-texto")).to_have_text(f"Último trimestre: ago 2026 – oct 2026 · {len(trimestre)} órdenes en la selección")
    assert leer_kpis(pagina) == esperados(trimestre)
    assert pagina.locator("#grafico-ingresos .zona").count() == 3

    pagina.select_option("#filtro-periodo", "personalizado")
    expect(pagina.locator("#filtro-rango")).to_be_visible()
    pagina.select_option("#filtro-desde", "2026-02")
    pagina.select_option("#filtro-hasta", "2026-01")  # al revés: el panel ordena el rango
    verano = en_meses(semilla, "2026-01", "2026-02")
    expect(pagina.locator("#kpi-ordenes")).to_have_text(str(len(verano)))
    assert pagina.locator("#grafico-ingresos .zona").count() == 2


def test_la_busqueda_ignora_mayusculas_y_tildes(pagina, base_url, semilla):
    abrir(pagina, base_url)
    pagina.fill("#filtro-texto", "clinica quillay")
    esperadas = [o for o in semilla if o["cliente"] == "Clínica Quillay S.A."]
    expect(pagina.locator("#kpi-ordenes")).to_have_text(str(len(esperadas)))
    assert set(pagina.locator("#cuerpo-tabla td.cliente").all_inner_texts()) == {"Clínica Quillay S.A."}
    pagina.fill("#filtro-texto", "OS-0007")
    expect(pagina.locator("#kpi-ordenes")).to_have_text("1")


def test_una_combinacion_sin_resultados_muestra_estados_vacios(pagina, base_url):
    abrir(pagina, base_url)
    pagina.select_option("#filtro-periodo", "personalizado")
    pagina.select_option("#filtro-desde", "2025-11")
    pagina.select_option("#filtro-hasta", "2025-11")
    pagina.select_option("#filtro-estado", "PROGRAMADA")  # las programadas son todas de octubre de 2026
    expect(pagina.locator("#kpi-ordenes")).to_have_text("0")
    expect(pagina.locator("#kpi-ticket")).to_have_text("—")
    expect(pagina.locator("#cuerpo-tabla")).to_have_text("No hay órdenes con los filtros seleccionados.")
    expect(pagina.locator("#grafico-ingresos .grafico-vacio")).to_be_visible()
    expect(pagina.locator("#grafico-plazos .grafico-vacio")).to_be_visible()
    expect(pagina.locator("#boton-exportar")).to_be_disabled()


def test_limpiar_filtros_restaura_la_vista_inicial(pagina, base_url, semilla):
    abrir(pagina, base_url)
    expect(pagina.locator("#limpiar-filtros")).to_be_disabled()
    pagina.select_option("#filtro-comuna", "Maipú")
    pagina.select_option("#filtro-periodo", "6")
    expect(pagina.locator("#limpiar-filtros")).to_be_enabled()
    pagina.click("#limpiar-filtros")
    assert leer_kpis(pagina) == esperados(semilla)
    expect(pagina.locator("#filtro-comuna")).to_have_value("")
    expect(pagina.locator("#filtro-periodo")).to_have_value("12")


def test_ordenar_columnas_y_paginar(pagina, base_url, semilla):
    abrir(pagina, base_url)
    expect(pagina.locator('th[data-campo="fecha"]')).to_have_attribute("aria-sort", "descending")
    primera_fila = pagina.locator("#cuerpo-tabla tr").first
    pagina.click('th button[data-campo="monto"]')
    expect(pagina.locator('th[data-campo="monto"]')).to_have_attribute("aria-sort", "ascending")
    expect(primera_fila.locator("td").nth(7)).to_have_text(clp(min(o["monto"] for o in semilla)))
    pagina.click('th button[data-campo="monto"]')
    expect(pagina.locator('th[data-campo="monto"]')).to_have_attribute("aria-sort", "descending")
    expect(primera_fila.locator("td").nth(7)).to_have_text(clp(max(o["monto"] for o in semilla)))

    expect(pagina.locator("#resumen-tabla")).to_have_text("Mostrando 1–10 de 240 órdenes")
    expect(pagina.locator("#pagina-anterior")).to_be_disabled()
    pagina.click("#pagina-siguiente")
    expect(pagina.locator("#resumen-tabla")).to_have_text("Mostrando 11–20 de 240 órdenes")
    pagina.select_option("#por-pagina", "50")
    expect(pagina.locator("#cuerpo-tabla tr")).to_have_count(50)
    expect(pagina.locator("#pagina-actual")).to_have_text("Página 1 de 5")


def test_el_tooltip_aparece_al_pasar_el_puntero_y_al_enfocar(pagina, base_url, semilla):
    abrir(pagina, base_url)
    diciembre = sum(o["monto"] for o in semilla if o["fecha"].startswith("2025-12") and o["estado"] == "COMPLETADA")
    tooltip = pagina.locator("#grafico-ingresos .tooltip")
    pagina.locator('#grafico-ingresos .zona[data-clave="2025-12"]').hover()
    expect(tooltip).to_be_visible()
    expect(tooltip).to_contain_text("Diciembre 2025")
    expect(tooltip).to_contain_text(clp(diciembre))
    pagina.mouse.move(5, 5)
    expect(tooltip).to_be_hidden()
    pagina.locator('#grafico-plazos .zona[data-clave="2026-01"]').focus()
    expect(pagina.locator("#grafico-plazos .tooltip")).to_contain_text("Enero 2026")
    expect(pagina.locator("#grafico-plazos .cruz")).to_have_attribute("visibility", "visible")


def test_en_movil_no_hay_desplazamiento_horizontal(pagina_movil, base_url):
    abrir(pagina_movil, base_url)
    medidas = pagina_movil.evaluate("""() => ({
        pagina: document.documentElement.scrollWidth, ventana: document.documentElement.clientWidth,
        svgs: Math.max(...[...document.querySelectorAll('.lienzo svg')].map(s => s.getBoundingClientRect().right)),
        fila: getComputedStyle(document.querySelector('#cuerpo-tabla tr')).display })""")
    assert medidas["pagina"] <= medidas["ventana"]
    assert medidas["svgs"] <= medidas["ventana"]
    assert medidas["fila"] == "grid"  # cada orden se muestra como ficha
    assert pagina_movil.errores_consola == []


def test_el_modo_oscuro_usa_su_propia_paleta(navegador, base_url):
    contexto, pagina = nueva_pagina(navegador, viewport={"width": 1366, "height": 900}, color_scheme="dark")
    try:
        abrir(pagina, base_url)
        colores = pagina.evaluate("""() => ({
            fondo: getComputedStyle(document.body).backgroundColor,
            serie: getComputedStyle(document.querySelector('#grafico-ingresos path.marca')).fill })""")
        assert colores["fondo"] == "rgb(11, 21, 32)"
        assert colores["serie"] == "rgb(57, 135, 229)"  # paso oscuro validado del azul (#3987e5)
        assert pagina.errores_consola == []
    finally:
        contexto.close()
