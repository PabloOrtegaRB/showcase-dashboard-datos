// Interfaz del panel: estado, filtros, indicadores, gráficos, tabla, formulario e importación/exportación CSV.
(function (V) {
  "use strict";

  var I = V.indicadores, F = V.formato;
  var $ = function (id) { return document.getElementById(id); };
  // El color sigue a la entidad: cada estado conserva su color aunque cambien los filtros.
  var SERIE_ESTADO = { COMPLETADA: "serie-1", EN_CURSO: "serie-2", PROGRAMADA: "serie-3", CANCELADA: "serie-4" };
  var RANGO_PRIORIDAD = { CRITICA: 0, ALTA: 1, MEDIA: 2, BAJA: 3 };
  var RANGO_ESTADO = { COMPLETADA: 0, EN_CURSO: 1, PROGRAMADA: 2, CANCELADA: 3 };
  var PERIODOS = { "12": "Últimos 12 meses", "6": "Últimos 6 meses", "3": "Último trimestre", "1": "Último mes",
    todo: "Todo el historial", personalizado: "Rango personalizado" };
  var META_PLAZO = 90;
  var COLUMNAS = [
    { campo: "folio", titulo: "Folio" }, { campo: "fecha", titulo: "Fecha" }, { campo: "cliente", titulo: "Cliente" },
    { campo: "comuna", titulo: "Comuna" }, { campo: "servicio", titulo: "Servicio" }, { campo: "prioridad", titulo: "Prioridad" },
    { campo: "estado", titulo: "Estado" }, { campo: "monto", titulo: "Monto", num: true },
    { campo: "dias_resolucion", titulo: "Días", num: true }, { campo: "satisfaccion", titulo: "Satisf.", num: true }
  ];
  var FILTROS_INICIALES = { periodo: "12", desde: "", hasta: "", servicio: "", estado: "", comuna: "", texto: "" };

  var estado = {
    ordenes: [],
    filtros: Object.assign({}, FILTROS_INICIALES),
    orden: { campo: "fecha", dir: "desc" },
    pagina: 1,
    porPagina: 10,
    ordenadas: [],
    editando: null,
    ultimoFoco: null
  };

  function mayuscula(t) { return t.charAt(0).toUpperCase() + t.slice(1); }
  function plural(n, uno, varios) { return F.numero(n) + " " + (n === 1 ? uno : varios); }

  // ---------- Período ----------
  function limitesDatos() {
    if (!estado.ordenes.length) { var hoy = V.hoyIso().slice(0, 7); return { min: hoy, max: hoy }; }
    var min = "9999-99", max = "0000-00";
    estado.ordenes.forEach(function (o) { var m = o.fecha.slice(0, 7); if (m < min) min = m; if (m > max) max = m; });
    return { min: min, max: max };
  }

  function restarMeses(clave, n) {
    var anio = +clave.slice(0, 4), mes = +clave.slice(5, 7) - n;
    while (mes < 1) { mes += 12; anio -= 1; }
    return anio + "-" + String(mes).padStart(2, "0");
  }

  // "Últimos N meses" se cuenta desde el último mes con datos, para que el conjunto de ejemplo siga
  // mostrándose completo aunque se abra el panel años después.
  function resolverPeriodo() {
    var lim = limitesDatos(), f = estado.filtros;
    if (f.periodo === "todo") return { desde: lim.min, hasta: lim.max };
    if (f.periodo === "personalizado") {
      var d = f.desde || lim.min, h = f.hasta || lim.max;
      return d <= h ? { desde: d, hasta: h } : { desde: h, hasta: d };
    }
    return { desde: restarMeses(lim.max, parseInt(f.periodo, 10) - 1), hasta: lim.max };
  }

  function actualizarSelectoresMes() {
    var lim = limitesDatos();
    var meses = V.rangoMeses(lim.min, lim.max);
    [["filtro-desde", "desde", lim.min], ["filtro-hasta", "hasta", lim.max]].forEach(function (c) {
      var select = $(c[0]);
      select.replaceChildren();
      meses.forEach(function (m) { select.appendChild(V.el("option", { value: m }, F.mesConAnio(m))); });
      if (meses.indexOf(estado.filtros[c[1]]) < 0) estado.filtros[c[1]] = c[2];
      select.value = estado.filtros[c[1]];
    });
  }

  function hayFiltros() {
    var f = estado.filtros;
    return f.periodo !== FILTROS_INICIALES.periodo || !!(f.servicio || f.estado || f.comuna || f.texto.trim());
  }

  // ---------- Pintado ----------
  function render() {
    var periodo = resolverPeriodo();
    var filtros = Object.assign({}, estado.filtros, periodo);
    var meses = V.rangoMeses(periodo.desde, periodo.hasta);
    var filtradas = I.filtrar(estado.ordenes, filtros);

    var rango = periodo.desde === periodo.hasta ? F.mesConAnio(periodo.desde) : F.mesConAnio(periodo.desde) + " – " + F.mesConAnio(periodo.hasta);
    $("periodo-texto").textContent = PERIODOS[estado.filtros.periodo] + ": " + rango + " · " + plural(filtradas.length, "orden", "órdenes") + " en la selección";
    $("limpiar-filtros").disabled = !hayFiltros();

    pintarKpis(I.kpis(filtradas));
    pintarGraficos(filtros, filtradas, meses);
    pintarTabla(filtradas);
  }

  function pintarKpis(k) {
    $("kpi-ordenes").textContent = F.numero(k.ordenes);
    $("kpi-ordenes-detalle").textContent = plural(k.completadas, "completada", "completadas");
    $("kpi-ingresos").textContent = F.clp(k.ingresos);
    $("kpi-ticket").textContent = k.ticket === null ? "—" : F.clp(k.ticket);
    $("kpi-cumplimiento").textContent = k.cumplimiento === null ? "—" : F.porcentaje(k.cumplimiento);
    $("kpi-cumplimiento-detalle").textContent = k.completadas ?
      F.numero(k.aTiempo) + " de " + F.numero(k.completadas) + " · meta " + META_PLAZO + " %" : "Sin órdenes completadas";
    $("kpi-tiempo").textContent = k.tiempoMedio === null ? "—" : F.decimal(k.tiempoMedio) + " días";
    $("kpi-satisfaccion").textContent = k.satisfaccion === null ? "—" : F.decimal(k.satisfaccion) + " de 5";
    $("kpi-satisfaccion-detalle").textContent = plural(k.respuestas, "respuesta", "respuestas") + " a la encuesta";
  }

  function pintarGraficos(filtros, filtradas, meses) {
    var mensual = I.porMes(filtradas, meses);

    dibujar("grafico-ingresos", V.graficos.columnas, mensual.map(function (m) {
      return {
        clave: m.mes, eje: F.mesCorto(m.mes), nombre: mayuscula(F.mesLargo(m.mes)), valor: m.ingresos,
        filas: [{ serie: "serie-1", valor: F.clp(m.ingresos), etiqueta: "en ingresos" },
          { valor: F.numero(m.completadas), etiqueta: m.completadas === 1 ? "orden completada" : "órdenes completadas" }]
      };
    }), {
      descripcion: "Columnas: ingresos por mes. El detalle está en la tabla de datos del gráfico.",
      formatoEje: function (v) { return v === 0 ? "$0" : F.clpCompacto(v); },
      formatoEtiqueta: F.clpCompacto,
      etiquetaAria: function (d) { return d.nombre + ": " + F.clp(d.valor) + " en ingresos"; }
    });
    V.graficos.tablaDatos($("grafico-ingresos"), ["Mes", "Ingresos", "Órdenes completadas"], mensual.map(function (m) {
      return [mayuscula(F.mesLargo(m.mes)), F.clp(m.ingresos), F.numero(m.completadas)];
    }));

    dibujar("grafico-plazos", V.graficos.linea, mensual.map(function (m) {
      return {
        clave: m.mes, eje: F.mesCorto(m.mes), nombre: mayuscula(F.mesLargo(m.mes)), valor: m.cumplimiento,
        detalle: m.completadas ? F.numero(m.aTiempo) + " de " + F.numero(m.completadas) + " a tiempo" : "Sin órdenes completadas"
      };
    }), {
      meta: META_PLAZO,
      descripcion: "Línea: porcentaje de órdenes completadas dentro del plazo, por mes, con la meta de " + META_PLAZO + " %.",
      etiquetaAria: function (d) {
        return d.nombre + ": " + (d.valor === null ? "sin órdenes completadas" : F.porcentaje(d.valor) + " dentro del plazo, " + d.detalle);
      }
    });
    V.graficos.tablaDatos($("grafico-plazos"), ["Mes", "Dentro del plazo", "A tiempo", "Completadas"], mensual.map(function (m) {
      return [mayuscula(F.mesLargo(m.mes)), m.cumplimiento === null ? "—" : F.porcentaje(m.cumplimiento), F.numero(m.aTiempo), F.numero(m.completadas)];
    }));

    // Los gráficos de una dimensión no se filtran por ella misma: la selección se resalta en su contexto.
    var servicios = I.porServicio(I.filtrar(estado.ordenes, filtros, "servicio")).map(function (s) {
      return { clave: s.clave, nombre: V.SERVICIOS[s.clave], valor: s.valor };
    });
    dibujar("grafico-servicios", V.graficos.barras, servicios, {
      seleccion: estado.filtros.servicio,
      descripcion: "Barras: órdenes por servicio. Activa una barra para filtrar por ese servicio.",
      formatoValor: F.numero,
      filasTooltip: function (d) { return [{ serie: "serie-1", valor: F.numero(d.valor), etiqueta: d.valor === 1 ? "orden" : "órdenes" }]; },
      etiquetaAria: function (d, sel) { return d.nombre + ": " + plural(d.valor, "orden", "órdenes") + ". " + (sel ? "Quitar el filtro por servicio" : "Filtrar por este servicio"); },
      alActivar: function (clave) { alternarFiltro("servicio", clave, "grafico-servicios"); }
    });
    V.graficos.tablaDatos($("grafico-servicios"), ["Servicio", "Órdenes"], servicios.map(function (s) { return [s.nombre, F.numero(s.valor)]; }));

    var comunas = I.porComuna(I.filtrar(estado.ordenes, filtros, "comuna")).map(function (c) {
      return { clave: c.clave, nombre: c.clave, valor: c.valor };
    });
    dibujar("grafico-comunas", V.graficos.barras, comunas, {
      seleccion: estado.filtros.comuna,
      descripcion: "Barras: ingresos por comuna. Activa una barra para filtrar por esa comuna.",
      formatoValor: function (v) { return v === 0 ? "$0" : F.clpCompacto(v); },
      filasTooltip: function (d) { return [{ serie: "serie-1", valor: F.clp(d.valor), etiqueta: "en ingresos" }]; },
      etiquetaAria: function (d, sel) { return d.nombre + ": " + F.clp(d.valor) + " en ingresos. " + (sel ? "Quitar el filtro por comuna" : "Filtrar por esta comuna"); },
      alActivar: function (clave) { alternarFiltro("comuna", clave, "grafico-comunas"); }
    });
    V.graficos.tablaDatos($("grafico-comunas"), ["Comuna", "Ingresos"], comunas.map(function (c) { return [c.nombre, F.clp(c.valor)]; }));

    var estados = I.porEstado(I.filtrar(estado.ordenes, filtros, "estado"));
    var totalEstados = estados.reduce(function (t, e) { return t + e.valor; }, 0);
    V.graficos.segmentos($("grafico-estados"), estados.map(function (e) {
      return { clave: e.clave, nombre: V.ESTADOS[e.clave], valor: e.valor, serie: SERIE_ESTADO[e.clave], textoOscuro: e.clave === "CANCELADA" };
    }), {
      seleccion: estado.filtros.estado,
      descripcion: "Barra segmentada: distribución de las órdenes por estado. Activa un bloque para filtrar por ese estado.",
      etiquetaAria: function (d, cuota) { return d.nombre + ": " + plural(d.valor, "orden", "órdenes") + " (" + cuota + "). " +
        (estado.filtros.estado === d.clave ? "Quitar el filtro por estado" : "Filtrar por este estado"); },
      alActivar: function (clave) { alternarFiltro("estado", clave, "grafico-estados"); }
    });
    V.graficos.tablaDatos($("grafico-estados"), ["Estado", "Órdenes", "Participación"], estados.map(function (e) {
      return [V.ESTADOS[e.clave], F.numero(e.valor), totalEstados ? F.porcentaje(e.valor / totalEstados * 100) : "—"];
    }));
    rellenarAlturas();
  }

  // Los gráficos se dibujan con su alto mínimo. Si la fila de la rejilla estira una tarjeta (porque su vecina
  // es más alta), el gráfico se vuelve a dibujar para ocupar ese espacio en vez de dejarlo vacío.
  var dibujados = {};
  function dibujar(id, funcion, datos, opciones) {
    dibujados[id] = { funcion: funcion, datos: datos, opciones: opciones };
    funcion($(id), datos, opciones);
  }

  function rellenarAlturas() {
    Object.keys(dibujados).forEach(function (id) {
      var area = $(id).querySelector(".area-grafico"), svg = area.querySelector(".lienzo svg");
      if (!svg) return;
      var disponible = Math.floor(area.getBoundingClientRect().height);
      if (disponible - svg.getBoundingClientRect().height > 8) {
        var d = dibujados[id];
        d.funcion($(id), d.datos, Object.assign({}, d.opciones, { alto: disponible }));
      }
    });
  }

  function alternarFiltro(campo, clave, idGrafico) {
    estado.filtros[campo] = estado.filtros[campo] === clave ? "" : clave;
    $("filtro-" + campo).value = estado.filtros[campo];
    estado.pagina = 1;
    render();
    // El gráfico se redibuja: se devuelve el foco al mismo elemento para no perder la posición del teclado.
    var zona = $(idGrafico).querySelector('[data-clave="' + clave + '"]');
    if (zona) zona.focus();
  }

  // ---------- Tabla ----------
  function comparador(campo) {
    if (campo === "servicio") return function (a, b) { return V.SERVICIOS[a.servicio].localeCompare(V.SERVICIOS[b.servicio], "es"); };
    if (campo === "prioridad") return function (a, b) { return RANGO_PRIORIDAD[a.prioridad] - RANGO_PRIORIDAD[b.prioridad]; };
    if (campo === "estado") return function (a, b) { return RANGO_ESTADO[a.estado] - RANGO_ESTADO[b.estado]; };
    if (campo === "monto" || campo === "dias_resolucion" || campo === "satisfaccion") return function (a, b) { return a[campo] - b[campo]; };
    return function (a, b) { return String(a[campo]).localeCompare(String(b[campo]), "es"); };
  }

  function ordenar(lista) {
    var campo = estado.orden.campo, sentido = estado.orden.dir === "asc" ? 1 : -1, comparar = comparador(campo);
    return lista.slice().sort(function (a, b) {
      var vacios = (a[campo] === null) - (b[campo] === null);
      if (vacios) return vacios; // los valores vacíos van siempre al final
      return comparar(a, b) * sentido || a.folio.localeCompare(b.folio) * sentido;
    });
  }

  function celda(etiqueta, clase, texto) { return V.el("td", { clase: clase || null, "data-etiqueta": etiqueta }, texto); }

  function filaOrden(o) {
    var tr = V.el("tr");
    var folio = celda("Folio", "folio"); folio.appendChild(V.el("code", null, o.folio)); tr.appendChild(folio);
    tr.appendChild(celda("Fecha", "fecha", F.fecha(o.fecha)));
    tr.appendChild(V.el("td", { clase: "cliente" }, o.cliente));
    tr.appendChild(celda("Comuna", null, o.comuna));
    tr.appendChild(celda("Servicio", null, V.SERVICIOS[o.servicio]));
    tr.appendChild(celda("Prioridad", null, V.PRIORIDADES[o.prioridad]));
    var celdaEstado = celda("Estado");
    var insignia = V.el("span", { clase: "estado" });
    insignia.appendChild(V.el("span", { clase: "punto-estado " + SERIE_ESTADO[o.estado], "aria-hidden": "true" }));
    insignia.appendChild(document.createTextNode(V.ESTADOS[o.estado]));
    celdaEstado.appendChild(insignia);
    tr.appendChild(celdaEstado);
    tr.appendChild(celda("Monto", "num", F.clp(o.monto)));
    tr.appendChild(celda("Días", "num", o.dias_resolucion === null ? "—" : F.numero(o.dias_resolucion)));
    tr.appendChild(celda("Satisf.", "num", o.satisfaccion === null ? "—" : o.satisfaccion + " de 5"));
    var acciones = V.el("td", { clase: "acciones" });
    acciones.appendChild(V.el("button", { type: "button", clase: "boton-mini", "data-accion": "editar", "data-folio": o.folio, "aria-label": "Editar " + o.folio }, "Editar"));
    acciones.appendChild(V.el("button", { type: "button", clase: "boton-mini peligro", "data-accion": "eliminar", "data-folio": o.folio, "aria-label": "Eliminar " + o.folio }, "Eliminar"));
    tr.appendChild(acciones);
    return tr;
  }

  function pintarTabla(filtradas) {
    estado.ordenadas = ordenar(filtradas);
    var total = estado.ordenadas.length;
    var paginas = Math.max(1, Math.ceil(total / estado.porPagina));
    estado.pagina = Math.min(Math.max(1, estado.pagina), paginas);
    var inicio = (estado.pagina - 1) * estado.porPagina;
    var visibles = estado.ordenadas.slice(inicio, inicio + estado.porPagina);
    var cuerpo = $("cuerpo-tabla");
    cuerpo.replaceChildren();
    if (!total) {
      var fila = V.el("tr");
      fila.appendChild(V.el("td", { clase: "vacio", colspan: COLUMNAS.length + 1 }, "No hay órdenes con los filtros seleccionados."));
      cuerpo.appendChild(fila);
    }
    visibles.forEach(function (o) { cuerpo.appendChild(filaOrden(o)); });
    $("resumen-tabla").textContent = total ? "Mostrando " + F.numero(inicio + 1) + "–" + F.numero(inicio + visibles.length) + " de " +
      plural(total, "orden", "órdenes") : "Sin resultados";
    $("pagina-actual").textContent = "Página " + estado.pagina + " de " + paginas;
    $("pagina-anterior").disabled = estado.pagina <= 1;
    $("pagina-siguiente").disabled = estado.pagina >= paginas;
    $("boton-exportar").disabled = !total;
    document.querySelectorAll("#tabla-ordenes th[data-campo]").forEach(function (th) {
      th.setAttribute("aria-sort", th.dataset.campo !== estado.orden.campo ? "none" : estado.orden.dir === "asc" ? "ascending" : "descending");
    });
  }

  function construirEncabezado() {
    var fila = $("encabezado-tabla");
    COLUMNAS.forEach(function (c) {
      var th = V.el("th", { scope: "col", "data-campo": c.campo, clase: c.num ? "num" : null, "aria-sort": "none" });
      var boton = V.el("button", { type: "button", "data-campo": c.campo }, c.titulo);
      boton.appendChild(V.el("span", { clase: "flecha", "aria-hidden": "true" }));
      th.appendChild(boton);
      fila.appendChild(th);
    });
    var acciones = V.el("th", { scope: "col" });
    acciones.appendChild(V.el("span", { clase: "oculto" }, "Acciones"));
    fila.appendChild(acciones);
  }

  // ---------- Avisos ----------
  function anunciar(texto) { $("anuncio").textContent = texto; }

  function guardar() {
    var ok = V.almacen.guardar(estado.ordenes);
    $("aviso-almacen").hidden = ok;
  }

  // ---------- Formulario ----------
  function llenarSelect(select, opciones, primera) {
    if (primera !== undefined) select.appendChild(V.el("option", { value: "" }, primera));
    if (Array.isArray(opciones)) opciones.forEach(function (o) { select.appendChild(V.el("option", { value: o }, o)); });
    else Object.keys(opciones).forEach(function (k) { select.appendChild(V.el("option", { value: k }, opciones[k])); });
  }

  function limpiarErrores() {
    var form = $("form-orden");
    form.querySelectorAll("[aria-invalid]").forEach(function (c) { c.removeAttribute("aria-invalid"); });
    form.querySelectorAll(".error-campo").forEach(function (p) { p.textContent = ""; });
    $("resumen-errores").hidden = true;
  }

  function mostrarErrores(errores) {
    var form = $("form-orden"), primero = null;
    Object.keys(errores).forEach(function (campo) {
      $("error-" + campo).textContent = errores[campo];
      form.elements[campo].setAttribute("aria-invalid", "true");
      primero = primero || form.elements[campo];
    });
    var n = Object.keys(errores).length;
    $("resumen-errores").textContent = n === 1 ? "Revisa el campo marcado." : "Revisa los " + n + " campos marcados.";
    $("resumen-errores").hidden = false;
    if (primero) primero.focus();
  }

  function actualizarCamposDeCierre() {
    var form = $("form-orden");
    var completada = form.elements.estado.value === "COMPLETADA";
    ["dias_resolucion", "satisfaccion"].forEach(function (n) {
      form.elements[n].disabled = !completada;
      if (!completada) form.elements[n].value = "";
    });
  }

  function abrirFormulario(orden, disparador) {
    var form = $("form-orden");
    estado.editando = orden ? orden.folio : null;
    estado.ultimoFoco = disparador || document.activeElement;
    form.reset();
    limpiarErrores();
    $("titulo-formulario").textContent = orden ? "Editar orden " + orden.folio : "Nueva orden";
    var hoy = V.hoyIso();
    form.elements.fecha.max = hoy;
    var d = orden || { fecha: hoy, cliente: "", comuna: V.COMUNAS[0], servicio: "MANTENCION_PREVENTIVA", prioridad: "MEDIA",
      estado: "PROGRAMADA", monto: "", dias_resolucion: null, satisfaccion: null };
    form.elements.fecha.value = d.fecha;
    form.elements.cliente.value = d.cliente;
    form.elements.comuna.value = d.comuna;
    form.elements.servicio.value = d.servicio;
    form.elements.prioridad.value = d.prioridad;
    form.elements.estado.value = d.estado;
    actualizarCamposDeCierre();
    form.elements.monto.value = d.monto === "" ? "" : String(d.monto);
    form.elements.dias_resolucion.value = d.dias_resolucion === null ? "" : String(d.dias_resolucion);
    form.elements.satisfaccion.value = d.satisfaccion === null ? "" : String(d.satisfaccion);
    $("dialogo-orden").showModal();
    form.elements.cliente.focus();
  }

  function guardarFormulario(evento) {
    evento.preventDefault();
    var form = $("form-orden"), e = form.elements;
    var resultado = V.validarOrden({
      folio: estado.editando, fecha: e.fecha.value, cliente: e.cliente.value, comuna: e.comuna.value, servicio: e.servicio.value,
      prioridad: e.prioridad.value, estado: e.estado.value, monto: e.monto.value,
      dias_resolucion: e.dias_resolucion.disabled ? "" : e.dias_resolucion.value,
      satisfaccion: e.satisfaccion.disabled ? "" : e.satisfaccion.value
    });
    limpiarErrores();
    if (!resultado.ok) { mostrarErrores(resultado.errores); return; }
    var orden = resultado.orden;
    if (estado.editando) {
      orden.folio = estado.editando;
      estado.ordenes = estado.ordenes.map(function (o) { return o.folio === orden.folio ? orden : o; });
      anunciar("Orden " + orden.folio + " actualizada.");
    } else {
      orden.folio = V.siguienteFolio(estado.ordenes);
      estado.ordenes = estado.ordenes.concat([orden]);
      anunciar("Orden " + orden.folio + " creada.");
    }
    guardar();
    actualizarSelectoresMes();
    $("dialogo-orden").close();
    render();
  }

  // ---------- Confirmación e informe ----------
  function confirmar(titulo, mensaje, accion) {
    return new Promise(function (resolver) {
      var dialogo = $("dialogo-confirmar");
      $("confirmar-titulo").textContent = titulo;
      $("confirmar-mensaje").textContent = mensaje;
      $("confirmar-aceptar").textContent = accion;
      dialogo.returnValue = "";
      dialogo.addEventListener("close", function () { resolver(dialogo.returnValue === "aceptar"); }, { once: true });
      dialogo.showModal();
      $("confirmar-cancelar").focus();
    });
  }

  function mostrarInforme(nombreArchivo, r) {
    $("informe-archivo").textContent = nombreArchivo;
    var cifras = $("informe-cifras"), lista = $("informe-errores");
    cifras.replaceChildren();
    lista.replaceChildren();
    if (r.faltantes && r.faltantes.length) {
      $("informe-resumen").textContent = "Faltan columnas obligatorias: " + r.faltantes.join(", ") + ". No se importó ninguna fila.";
    } else {
      $("informe-resumen").textContent = r.importadas.length ? "La importación terminó. Las filas con errores no se importaron." :
        "No se importó ninguna fila.";
      [[r.leidas, "filas leídas"], [r.importadas.length, "importadas"], [r.errores.length, "con errores"]].forEach(function (c) {
        var li = V.el("li");
        li.appendChild(V.el("strong", null, F.numero(c[0])));
        li.appendChild(document.createTextNode(" " + c[1]));
        cifras.appendChild(li);
      });
      r.errores.slice(0, 50).forEach(function (err) {
        var li = V.el("li");
        li.appendChild(V.el("strong", null, "Fila " + err.fila + ": "));
        li.appendChild(document.createTextNode(err.mensajes.join(" · ")));
        lista.appendChild(li);
      });
      if (r.errores.length > 50) lista.appendChild(V.el("li", null, "… y " + F.numero(r.errores.length - 50) + " filas más con errores."));
    }
    $("dialogo-informe").showModal();
  }

  function importarArchivo(archivo) {
    if (archivo.size > 1024 * 1024) {
      mostrarInforme(archivo.name, { faltantes: [], leidas: 0, importadas: [], errores: [{ fila: 1, mensajes: ["El archivo supera 1 MB."] }] });
      return Promise.resolve();
    }
    return archivo.text().then(function (texto) {
      var r = V.csv.importar(texto, estado.ordenes);
      if (r.importadas.length) {
        estado.ordenes = estado.ordenes.concat(r.importadas);
        guardar();
        actualizarSelectoresMes();
        anunciar("Se importaron " + plural(r.importadas.length, "orden", "órdenes") + " desde " + archivo.name + ".");
        render();
      }
      mostrarInforme(archivo.name, r);
    });
  }

  function exportar() {
    var lista = estado.ordenadas;
    var url = URL.createObjectURL(new Blob([V.csv.serializar(lista)], { type: "text/csv;charset=utf-8" }));
    var enlace = V.el("a", { href: url, download: "ordenes-valdora-" + V.hoyIso() + ".csv" });
    document.body.appendChild(enlace);
    enlace.click();
    enlace.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
    anunciar("Se exportaron " + plural(lista.length, "orden", "órdenes") + " a CSV.");
  }

  // ---------- Eventos ----------
  function sincronizarControles() {
    $("filtro-periodo").value = estado.filtros.periodo;
    $("filtro-servicio").value = estado.filtros.servicio;
    $("filtro-estado").value = estado.filtros.estado;
    $("filtro-comuna").value = estado.filtros.comuna;
    $("filtro-texto").value = estado.filtros.texto;
    $("filtro-rango").hidden = estado.filtros.periodo !== "personalizado";
  }

  function enlazarEventos() {
    function alCambiar(id, campo) {
      $(id).addEventListener("change", function () {
        estado.filtros[campo] = this.value;
        estado.pagina = 1;
        sincronizarControles();
        render();
      });
    }
    alCambiar("filtro-periodo", "periodo");
    alCambiar("filtro-desde", "desde");
    alCambiar("filtro-hasta", "hasta");
    alCambiar("filtro-servicio", "servicio");
    alCambiar("filtro-estado", "estado");
    alCambiar("filtro-comuna", "comuna");

    var espera = null;
    $("filtro-texto").addEventListener("input", function () {
      var valor = this.value;
      clearTimeout(espera);
      espera = setTimeout(function () { estado.filtros.texto = valor; estado.pagina = 1; render(); }, 200);
    });

    $("limpiar-filtros").addEventListener("click", function () {
      var lim = limitesDatos();
      estado.filtros = Object.assign({}, FILTROS_INICIALES, { desde: lim.min, hasta: lim.max });
      estado.pagina = 1;
      actualizarSelectoresMes();
      sincronizarControles();
      render();
    });

    $("encabezado-tabla").addEventListener("click", function (e) {
      var boton = e.target.closest("button[data-campo]");
      if (!boton) return;
      var campo = boton.dataset.campo;
      estado.orden = { campo: campo, dir: estado.orden.campo === campo && estado.orden.dir === "asc" ? "desc" : "asc" };
      estado.pagina = 1;
      render();
      $("encabezado-tabla").querySelector('button[data-campo="' + campo + '"]').focus();
    });

    $("pagina-anterior").addEventListener("click", function () { estado.pagina -= 1; render(); });
    $("pagina-siguiente").addEventListener("click", function () { estado.pagina += 1; render(); });
    $("por-pagina").addEventListener("change", function () { estado.porPagina = parseInt(this.value, 10); estado.pagina = 1; render(); });

    $("cuerpo-tabla").addEventListener("click", function (e) {
      var boton = e.target.closest("button[data-accion]");
      if (!boton) return;
      var orden = estado.ordenes.find(function (o) { return o.folio === boton.dataset.folio; });
      if (!orden) return;
      if (boton.dataset.accion === "editar") { abrirFormulario(orden, boton); return; }
      confirmar("¿Eliminar la orden " + orden.folio + "?", orden.cliente + " · " + V.SERVICIOS[orden.servicio] + " · " + F.clp(orden.monto) +
        ". Para recuperarla tendrás que restablecer los datos de ejemplo.", "Eliminar").then(function (ok) {
        if (!ok) { boton.focus(); return; }
        estado.ordenes = estado.ordenes.filter(function (o) { return o.folio !== orden.folio; });
        guardar();
        actualizarSelectoresMes();
        anunciar("Orden " + orden.folio + " eliminada.");
        render();
        $("boton-nueva").focus();
      });
    });

    $("boton-nueva").addEventListener("click", function () { abrirFormulario(null, this); });
    $("form-orden").addEventListener("submit", guardarFormulario);
    $("form-orden").elements.estado.addEventListener("change", actualizarCamposDeCierre);
    $("cancelar-formulario").addEventListener("click", function () { $("dialogo-orden").close(); });
    $("dialogo-orden").addEventListener("close", function () {
      if (estado.ultimoFoco && document.body.contains(estado.ultimoFoco)) estado.ultimoFoco.focus();
    });

    $("boton-exportar").addEventListener("click", exportar);
    $("boton-importar").addEventListener("click", function () { $("archivo-csv").click(); });
    $("archivo-csv").addEventListener("change", function () {
      var entrada = this, archivo = entrada.files[0];
      if (!archivo) return;
      importarArchivo(archivo).then(function () { entrada.value = ""; });
    });
    $("cerrar-informe").addEventListener("click", function () { $("dialogo-informe").close(); $("boton-importar").focus(); });

    $("boton-restablecer").addEventListener("click", function () {
      confirmar("¿Restablecer los datos de ejemplo?", "Se descartan las órdenes creadas, editadas, eliminadas o importadas en este navegador.",
        "Restablecer").then(function (ok) {
        if (!ok) return;
        estado.ordenes = V.almacen.restablecer();
        estado.pagina = 1;
        actualizarSelectoresMes();
        anunciar("Se restablecieron los datos de ejemplo.");
        render();
      });
    });

    // Abrir o cerrar una tabla de datos cambia el alto de la fila: se recalculan los gráficos vecinos.
    document.querySelectorAll(".ver-datos").forEach(function (d) { d.addEventListener("toggle", render); });

    var anchoPrevio = window.innerWidth, demora = null;
    window.addEventListener("resize", function () {
      clearTimeout(demora);
      demora = setTimeout(function () {
        if (window.innerWidth !== anchoPrevio) { anchoPrevio = window.innerWidth; render(); }
      }, 150);
    });
  }

  function iniciar() {
    llenarSelect($("filtro-servicio"), V.SERVICIOS, "Todos");
    llenarSelect($("filtro-estado"), V.ESTADOS, "Todos");
    llenarSelect($("filtro-comuna"), V.COMUNAS, "Todas");
    var form = $("form-orden");
    llenarSelect(form.elements.comuna, V.COMUNAS);
    llenarSelect(form.elements.servicio, V.SERVICIOS);
    llenarSelect(form.elements.prioridad, V.PRIORIDADES);
    llenarSelect(form.elements.estado, V.ESTADOS);

    estado.ordenes = V.almacen.cargar().ordenes;
    $("aviso-almacen").hidden = V.almacen.persistente;
    construirEncabezado();
    actualizarSelectoresMes();
    sincronizarControles();
    enlazarEventos();
    render();
    document.documentElement.dataset.listo = "true";
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", iniciar);
  else iniciar();
})(window.Valdora = window.Valdora || {});
