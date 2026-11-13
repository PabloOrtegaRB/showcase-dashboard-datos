"""Pruebas de los datos: crear, validar, editar, eliminar, persistir, exportar e importar CSV."""
from datetime import date, timedelta

from playwright.sync_api import expect

from tests.ayudas import ESTADOS, PRIORIDADES, RAIZ, SERVICIOS, abrir, clp, esperados
from tests.conftest import nueva_pagina

ENCABEZADO = "Folio;Fecha;Cliente;Comuna;Servicio;Prioridad;Estado;Monto (CLP);Días de resolución;Satisfacción"


def crear_orden(pagina, **campos):
    datos = {"fecha": "2026-10-30", "cliente": "Cafetería Demo Prueba SpA", "comuna": "Providencia",
             "servicio": "CLIMATIZACION", "prioridad": "ALTA", "estado": "COMPLETADA", "monto": "1.250.000",
             "dias_resolucion": "2", "satisfaccion": "5"}
    datos.update(campos)
    pagina.click("#boton-nueva")
    pagina.fill("#campo-fecha", datos["fecha"])
    pagina.fill("#campo-cliente", datos["cliente"])
    pagina.select_option("#campo-comuna", datos["comuna"])
    pagina.select_option("#campo-servicio", datos["servicio"])
    pagina.select_option("#campo-prioridad", datos["prioridad"])
    pagina.select_option("#campo-estado", datos["estado"])
    pagina.fill("#campo-monto", datos["monto"])
    if datos["estado"] == "COMPLETADA":
        pagina.fill("#campo-dias", datos["dias_resolucion"])
        pagina.select_option("#campo-satisfaccion", datos["satisfaccion"])
    pagina.get_by_role("button", name="Guardar orden").click()


def fila(pagina, folio):
    return pagina.locator("#cuerpo-tabla tr", has=pagina.locator("code", has_text=folio))


def descargar_csv(pagina):
    with pagina.expect_download() as info:
        pagina.click("#boton-exportar")
    descarga = info.value
    return descarga.suggested_filename, open(descarga.path(), "rb").read()


def test_crear_una_orden_valida_los_campos_y_persiste_al_recargar(pagina, base_url):
    abrir(pagina, base_url)
    pagina.click("#boton-nueva")
    expect(pagina.locator("#dialogo-orden")).to_be_visible()
    expect(pagina.locator("#titulo-formulario")).to_have_text("Nueva orden")
    pagina.get_by_role("button", name="Guardar orden").click()  # cliente y monto vacíos
    expect(pagina.locator("#resumen-errores")).to_have_text("Revisa los 2 campos marcados.")
    expect(pagina.locator("#campo-cliente")).to_have_attribute("aria-invalid", "true")
    expect(pagina.locator("#error-cliente")).to_have_text("Debe tener entre 3 y 80 caracteres.")
    expect(pagina.locator("#error-monto")).to_have_text("Debe ser un número entero entre 0 y 20.000.000.")
    expect(pagina.locator("#campo-cliente")).to_be_focused()
    pagina.click("#cancelar-formulario")

    crear_orden(pagina)
    expect(pagina.locator("#dialogo-orden")).to_be_hidden()
    expect(pagina.locator("#anuncio")).to_have_text("Orden OS-0241 creada.")
    expect(pagina.locator("#kpi-ordenes")).to_have_text("241")
    expect(fila(pagina, "OS-0241")).to_contain_text("Cafetería Demo Prueba SpA")
    expect(fila(pagina, "OS-0241")).to_contain_text("$1.250.000")

    pagina.reload()
    pagina.wait_for_selector("html[data-listo]", state="attached")
    expect(pagina.locator("#kpi-ordenes")).to_have_text("241")
    expect(fila(pagina, "OS-0241")).to_contain_text("Cafetería Demo Prueba SpA")
    assert pagina.errores_consola == []


def test_reglas_de_cierre_y_fecha_futura(pagina, base_url):
    abrir(pagina, base_url)
    pagina.click("#boton-nueva")
    pagina.select_option("#campo-estado", "PROGRAMADA")
    expect(pagina.locator("#campo-dias")).to_be_disabled()
    expect(pagina.locator("#campo-satisfaccion")).to_be_disabled()
    pagina.select_option("#campo-estado", "COMPLETADA")
    expect(pagina.locator("#campo-dias")).to_be_enabled()
    pagina.fill("#campo-fecha", (date.today() + timedelta(days=1)).isoformat())
    pagina.fill("#campo-cliente", "Cliente Demo Reglas SpA")
    pagina.fill("#campo-monto", "300000")
    pagina.get_by_role("button", name="Guardar orden").click()
    expect(pagina.locator("#error-fecha")).to_have_text("La fecha no puede ser posterior a hoy.")
    expect(pagina.locator("#error-dias_resolucion")).to_have_text("Es obligatorio cuando la orden está completada.")
    expect(pagina.locator("#kpi-ordenes")).to_have_text("240")


def test_editar_una_orden_actualiza_la_tabla_y_los_indicadores(pagina, base_url, semilla):
    abrir(pagina, base_url)
    recientes = sorted(semilla, key=lambda o: (o["fecha"], o["folio"]), reverse=True)[:10]
    orden = next(o for o in recientes if o["estado"] == "COMPLETADA")
    pagina.click(f'button[data-accion="editar"][data-folio="{orden["folio"]}"]')
    expect(pagina.locator("#titulo-formulario")).to_have_text(f"Editar orden {orden['folio']}")
    expect(pagina.locator("#campo-monto")).to_have_value(str(orden["monto"]))
    pagina.fill("#campo-monto", str(orden["monto"] + 100000))
    pagina.get_by_role("button", name="Guardar orden").click()
    expect(pagina.locator("#anuncio")).to_have_text(f"Orden {orden['folio']} actualizada.")
    expect(fila(pagina, orden["folio"])).to_contain_text(clp(orden["monto"] + 100000))
    editadas = [dict(o, monto=o["monto"] + 100000) if o["folio"] == orden["folio"] else o for o in semilla]
    expect(pagina.locator("#kpi-ingresos")).to_have_text(esperados(editadas)["kpi-ingresos"])


def test_eliminar_pide_confirmacion(pagina, base_url):
    abrir(pagina, base_url)
    pagina.click('button[data-accion="eliminar"][data-folio="OS-0240"]')
    expect(pagina.locator("#dialogo-confirmar")).to_be_visible()
    expect(pagina.locator("#confirmar-titulo")).to_have_text("¿Eliminar la orden OS-0240?")
    pagina.click("#confirmar-cancelar")
    expect(pagina.locator("#dialogo-confirmar")).to_be_hidden()
    expect(fila(pagina, "OS-0240")).to_have_count(1)

    pagina.click('button[data-accion="eliminar"][data-folio="OS-0240"]')
    pagina.click("#confirmar-aceptar")
    expect(pagina.locator("#anuncio")).to_have_text("Orden OS-0240 eliminada.")
    expect(fila(pagina, "OS-0240")).to_have_count(0)
    expect(pagina.locator("#kpi-ordenes")).to_have_text("239")


def test_exportar_csv_con_formato_para_planillas(pagina, base_url, semilla):
    abrir(pagina, base_url)
    nombre, contenido = descargar_csv(pagina)
    assert nombre == f"ordenes-valdora-{date.today().isoformat()}.csv"
    assert contenido.startswith(b"\xef\xbb\xbf")  # BOM: Excel reconoce las tildes
    lineas = contenido.decode("utf-8-sig").split("\r\n")
    assert lineas[0] == ENCABEZADO
    assert lineas[-1] == ""  # termina con salto de línea
    assert len(lineas) == 240 + 2
    assert lineas[1].startswith("OS-0240;")  # mismo orden que la tabla: fecha descendente
    o = next(x for x in semilla if x["folio"] == "OS-0001")
    esperada = ";".join([o["folio"], o["fecha"], o["cliente"], o["comuna"], SERVICIOS[o["servicio"]], PRIORIDADES[o["prioridad"]],
                         ESTADOS[o["estado"]], str(o["monto"]), "" if o["dias_resolucion"] is None else str(o["dias_resolucion"]),
                         "" if o["satisfaccion"] is None else str(o["satisfaccion"])])
    assert lineas[-2] == esperada
    expect(pagina.locator("#anuncio")).to_have_text("Se exportaron 240 órdenes a CSV.")


def test_exportar_respeta_los_filtros_y_neutraliza_formulas(pagina, base_url):
    abrir(pagina, base_url)
    crear_orden(pagina, cliente="@Demo Fórmula SpA", estado="PROGRAMADA")
    pagina.fill("#filtro-texto", "formula")
    expect(pagina.locator("#kpi-ordenes")).to_have_text("1")
    expect(pagina.locator("#cuerpo-tabla td.cliente")).to_have_text("@Demo Fórmula SpA")  # en pantalla, texto tal cual
    _, contenido = descargar_csv(pagina)
    lineas = contenido.decode("utf-8-sig").split("\r\n")
    assert len(lineas) == 3
    # En la planilla, la celda empieza con apóstrofo: se muestra como texto y no se ejecuta como fórmula.
    assert lineas[1].split(";")[2] == "'@Demo Fórmula SpA"


def test_importar_csv_informa_las_filas_con_errores(pagina, base_url, semilla):
    abrir(pagina, base_url)
    pagina.set_input_files("#archivo-csv", str(RAIZ / "datos" / "ejemplo-importacion.csv"))
    informe = pagina.locator("#dialogo-informe")
    expect(informe).to_be_visible()
    expect(pagina.locator("#informe-archivo")).to_have_text("ejemplo-importacion.csv")
    expect(pagina.locator("#informe-cifras li")).to_have_text(["10 filas leídas", "7 importadas", "3 con errores"])
    errores = pagina.locator("#informe-errores li")
    expect(errores).to_have_count(3)
    expect(errores.nth(0)).to_contain_text("Fila 5:")
    expect(errores.nth(0)).to_contain_text("Monto (CLP)")
    expect(errores.nth(1)).to_contain_text("Fila 6:")
    expect(errores.nth(1)).to_contain_text("Comuna")
    expect(errores.nth(2)).to_contain_text("Fila 8:")
    expect(errores.nth(2)).to_contain_text("Días de resolución")
    pagina.click("#cerrar-informe")
    expect(informe).to_be_hidden()
    expect(pagina.locator("#kpi-ordenes")).to_have_text(str(len(semilla) + 7))
    expect(pagina.locator("#anuncio")).to_have_text("Se importaron 7 órdenes desde ejemplo-importacion.csv.")
    # Etiquetas sin tilde, en mayúsculas o con código y montos con puntos se normalizan.
    pagina.fill("#filtro-texto", "Viña Pangue")
    expect(pagina.locator("#cuerpo-tabla tr").first).to_contain_text("Climatización")
    expect(pagina.locator("#cuerpo-tabla tr").first).to_contain_text("$1.250.000")


def test_importar_un_archivo_sin_columnas_obligatorias_no_importa_nada(pagina, base_url, tmp_path):
    archivo = tmp_path / "planilla-incorrecta.csv"
    archivo.write_text("Nombre;Valor\nA;1\n", encoding="utf-8")
    abrir(pagina, base_url)
    pagina.set_input_files("#archivo-csv", str(archivo))
    expect(pagina.locator("#informe-resumen")).to_have_text(
        "Faltan columnas obligatorias: Fecha, Cliente, Comuna, Servicio, Prioridad, Estado, Monto (CLP). No se importó ninguna fila.")
    pagina.click("#cerrar-informe")
    expect(pagina.locator("#kpi-ordenes")).to_have_text("240")


def test_restablecer_vuelve_a_los_datos_de_ejemplo(pagina, base_url):
    abrir(pagina, base_url)
    pagina.click('button[data-accion="eliminar"][data-folio="OS-0240"]')
    pagina.click("#confirmar-aceptar")
    expect(pagina.locator("#kpi-ordenes")).to_have_text("239")
    pagina.click("#boton-restablecer")
    expect(pagina.locator("#confirmar-titulo")).to_have_text("¿Restablecer los datos de ejemplo?")
    pagina.click("#confirmar-aceptar")
    expect(pagina.locator("#kpi-ordenes")).to_have_text("240")
    assert pagina.evaluate("localStorage.getItem('valdora-panel-ordenes-v1')") is None


def test_funciona_aunque_el_navegador_bloquee_el_almacenamiento(navegador, base_url):
    contexto, pagina = nueva_pagina(navegador, viewport={"width": 1366, "height": 900})
    contexto.add_init_script("Object.defineProperty(window, 'localStorage', { get() { throw new DOMException('bloqueado', 'SecurityError'); } });")
    try:
        abrir(pagina, base_url)
        expect(pagina.locator("#aviso-almacen")).to_be_visible()
        expect(pagina.locator("#kpi-ordenes")).to_have_text("240")
        crear_orden(pagina)
        expect(pagina.locator("#kpi-ordenes")).to_have_text("241")  # sigue funcionando en memoria
        assert pagina.errores_consola == []
    finally:
        contexto.close()


def test_exportar_e_importar_conserva_exactamente_los_datos(pagina, base_url):
    abrir(pagina, base_url)
    resultado = pagina.evaluate("""() => {
        const V = window.Valdora;
        const r = V.csv.importar(V.csv.serializar(V.SEMILLA), [], { hoy: "2099-12-31" });
        return { errores: r.errores.length, importadas: r.importadas.length,
                 iguales: JSON.stringify(r.importadas) === JSON.stringify(V.SEMILLA) };
    }""")
    assert resultado == {"errores": 0, "importadas": 240, "iguales": True}


def test_lector_csv_y_reglas_de_interpretacion(pagina, base_url):
    abrir(pagina, base_url)
    texto_csv = 'a,b,c\r\n"x, y","con ""comillas""","línea\nnueva"\r\n\r\n1,2,3'
    r = pagina.evaluate("""(texto) => {
        const V = window.Valdora, I = V.validacion;
        const p = V.csv.parsear(texto);
        const programada = V.validarOrden({ fecha: "2026-01-10", cliente: "Cliente Demo", comuna: "ñuñoa", servicio: "Inspección",
                                            prioridad: "baja", estado: "Programada", monto: "100.000", dias_resolucion: "3" });
        return {
            separador: p.separador, filas: p.filas.map(f => [f.numero, f.valores]),
            fechas: [I.interpretarFecha("31-12-2025"), I.interpretarFecha("31/02/2026"), I.interpretarFecha("2026-02-29")],
            montos: [I.interpretarEntero("$1.250.000"), I.interpretarEntero("12,5"), I.interpretarEntero("1.5")],
            servicio: I.codigoDe(V.SERVICIOS, "climatizacion"),
            neutralizada: V.csv.neutralizar("=1+1"),
            programada: { comuna: programada.orden.comuna, error: programada.errores.dias_resolucion }
        };
    }""", texto_csv)
    assert r["separador"] == ","
    assert r["filas"] == [[1, ["a", "b", "c"]], [2, ["x, y", 'con "comillas"', "línea\nnueva"]], [4, ["1", "2", "3"]]]
    assert r["fechas"] == ["2025-12-31", None, None]
    assert r["montos"] == [1250000, None, None]
    assert r["servicio"] == "CLIMATIZACION"
    assert r["neutralizada"] == "'=1+1"
    assert r["programada"] == {"comuna": "Ñuñoa", "error": "Solo se registra cuando la orden está completada."}
