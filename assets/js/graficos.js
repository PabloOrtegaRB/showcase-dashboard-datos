// Gráficos SVG hechos a mano, sin librerías.
// Reglas de diseño: marcas delgadas (máx. 24 px) con extremo redondeado de 4 px y base recta, grilla tenue,
// una sola escala por gráfico, etiquetas directas solo donde aportan (el máximo, el último punto, la punta
// de cada barra), tooltip al pasar el puntero y al enfocar con teclado, y una tabla de datos equivalente.
// Los textos se insertan siempre con textContent.
(function (V) {
  "use strict";

  var NS = "http://www.w3.org/2000/svg";
  var FUENTE = '"Segoe UI", system-ui, -apple-system, Roboto, Arial, sans-serif';
  var medidor = null;

  function nodo(etiqueta, atributos, texto) {
    var n = document.createElementNS(NS, etiqueta);
    Object.keys(atributos || {}).forEach(function (k) {
      if (atributos[k] !== null && atributos[k] !== undefined) n.setAttribute(k, atributos[k]);
    });
    if (texto !== undefined) n.textContent = String(texto);
    return n;
  }

  function anchoTexto(texto, fuente) {
    medidor = medidor || document.createElement("canvas").getContext("2d");
    medidor.font = fuente;
    return medidor.measureText(String(texto)).width;
  }

  function maximo(lista) { return lista.reduce(function (m, v) { return v > m ? v : m; }, 0); }

  // Escala "amable": marcas en 1, 2, 2,5 o 5 por potencia de 10.
  function escalaY(tope, cantidad) {
    if (!(tope > 0)) tope = 1;
    var bruto = tope / cantidad;
    var magnitud = Math.pow(10, Math.floor(Math.log10(bruto)));
    var r = bruto / magnitud;
    var paso = (r <= 1 ? 1 : r <= 2 ? 2 : r <= 2.5 ? 2.5 : r <= 5 ? 5 : 10) * magnitud;
    var limite = Math.ceil(tope / paso - 1e-9) * paso;
    var marcas = [];
    for (var v = 0; v <= limite + paso / 2; v += paso) marcas.push(Math.round(v * 1e6) / 1e6);
    return { limite: limite, marcas: marcas };
  }

  // Columna: extremo de datos redondeado (arriba) y base recta.
  function rutaColumna(x, y, ancho, alto) {
    var r = Math.min(4, ancho / 2, alto);
    return "M" + x + "," + (y + alto) + "V" + (y + r) + "Q" + x + "," + y + " " + (x + r) + "," + y +
      "H" + (x + ancho - r) + "Q" + (x + ancho) + "," + y + " " + (x + ancho) + "," + (y + r) + "V" + (y + alto) + "Z";
  }

  // Barra horizontal: extremo de datos redondeado (derecha) y base recta.
  function rutaBarra(x, y, largo, grosor) {
    var r = Math.min(4, grosor / 2, largo);
    return "M" + x + "," + y + "H" + (x + largo - r) + "Q" + (x + largo) + "," + y + " " + (x + largo) + "," + (y + r) +
      "V" + (y + grosor - r) + "Q" + (x + largo) + "," + (y + grosor) + " " + (x + largo - r) + "," + (y + grosor) + "H" + x + "Z";
  }

  function preparar(figura) {
    var lienzo = figura.querySelector(".lienzo");
    lienzo.replaceChildren();
    var area = figura.querySelector(".area-grafico");
    var caja = area.querySelector(".tooltip");
    caja.hidden = true;
    var tooltip = {
      mostrar: function (titulo, filas, x, y) {
        caja.replaceChildren(V.el("p", { clase: "tooltip-titulo" }, titulo));
        filas.forEach(function (f) {
          var linea = V.el("p", { clase: "tooltip-fila" });
          if (f.serie) linea.appendChild(V.el("span", { clase: "tooltip-clave " + f.serie, "aria-hidden": "true" }));
          linea.appendChild(V.el("strong", null, f.valor));
          if (f.etiqueta) linea.appendChild(V.el("span", null, f.etiqueta));
          caja.appendChild(linea);
        });
        caja.hidden = false;
        var izquierda = Math.min(Math.max(x - caja.offsetWidth / 2, 0), Math.max(0, area.clientWidth - caja.offsetWidth));
        var arriba = y - caja.offsetHeight - 12;
        if (arriba < 0) arriba = y + 16;
        caja.style.left = izquierda + "px";
        caja.style.top = arriba + "px";
      },
      ocultar: function () { caja.hidden = true; }
    };
    return { lienzo: lienzo, ancho: Math.max(lienzo.clientWidth, 220), tooltip: tooltip };
  }

  function vacio(lienzo) {
    lienzo.appendChild(V.el("p", { clase: "grafico-vacio" }, "Sin datos para los filtros seleccionados."));
  }

  // Misma información al pasar el puntero que al enfocar con teclado; Enter o Espacio activan.
  function interactuar(zona, acciones) {
    zona.addEventListener("pointerenter", acciones.entrar);
    zona.addEventListener("pointerleave", acciones.salir);
    zona.addEventListener("focus", acciones.entrar);
    zona.addEventListener("blur", acciones.salir);
    if (acciones.activar) {
      zona.addEventListener("click", acciones.activar);
      zona.addEventListener("keydown", function (e) {
        if (e.key === "Enter" || e.key === " ") { e.preventDefault(); acciones.activar(); }
      });
    }
  }

  // datos: [{ clave, eje, nombre, valor, filas }]
  function columnas(figura, datos, op) {
    var p = preparar(figura);
    if (!datos.length || datos.every(function (d) { return !d.valor; })) { vacio(p.lienzo); return; }
    var ancho = p.ancho, alto = op.alto || 250;
    var escala = escalaY(maximo(datos.map(function (d) { return d.valor; })), 4);
    var fuenteEje = "12px " + FUENTE;
    var m = { arriba: 24, derecha: 6, abajo: 28 };
    m.izquierda = Math.ceil(maximo(escala.marcas.map(function (v) { return anchoTexto(op.formatoEje(v), fuenteEje); }))) + 12;
    var w = ancho - m.izquierda - m.derecha, h = alto - m.arriba - m.abajo;
    var y = function (v) { return m.arriba + h - v / escala.limite * h; };
    var banda = w / datos.length;
    var grosor = Math.max(3, Math.min(24, banda * 0.6));
    var cada = Math.max(1, Math.ceil(34 / banda)); // las etiquetas del eje no se tocan
    var raiz = nodo("svg", { width: ancho, height: alto, viewBox: "0 0 " + ancho + " " + alto, role: "group", "aria-label": op.descripcion });

    escala.marcas.forEach(function (v) {
      var yy = Math.round(y(v)) + 0.5;
      raiz.appendChild(nodo("line", { x1: m.izquierda, x2: ancho - m.derecha, y1: yy, y2: yy, "class": v === 0 ? "eje" : "grilla" }));
      raiz.appendChild(nodo("text", { x: m.izquierda - 8, y: yy + 4, "class": "texto-eje", "text-anchor": "end" }, op.formatoEje(v)));
    });

    var marcas = [];
    var iMax = 0;
    datos.forEach(function (d, i) {
      if (d.valor > datos[iMax].valor) iMax = i;
      var cx = m.izquierda + banda * (i + 0.5);
      marcas[i] = null;
      if (d.valor > 0) {
        marcas[i] = nodo("path", { d: rutaColumna(cx - grosor / 2, y(d.valor), grosor, y(0) - y(d.valor)), "class": "marca serie-1" });
        raiz.appendChild(marcas[i]);
      }
      if (i % cada === 0) raiz.appendChild(nodo("text", { x: cx, y: alto - m.abajo + 18, "class": "texto-eje", "text-anchor": "middle" }, d.eje));
    });
    var cxMax = m.izquierda + banda * (iMax + 0.5);
    raiz.appendChild(nodo("text", { x: cxMax, y: y(datos[iMax].valor) - 8, "class": "valor-directo", "text-anchor": "middle" },
      op.formatoEtiqueta(datos[iMax].valor)));

    datos.forEach(function (d, i) {
      var cx = m.izquierda + banda * (i + 0.5);
      var zona = nodo("rect", { x: m.izquierda + banda * i, y: m.arriba, width: banda, height: h, "class": "zona",
        tabindex: "0", role: "img", "aria-label": op.etiquetaAria(d), "data-clave": d.clave });
      interactuar(zona, {
        entrar: function () {
          if (marcas[i]) marcas[i].classList.add("activa");
          p.tooltip.mostrar(d.nombre, d.filas, cx, y(d.valor));
        },
        salir: function () { if (marcas[i]) marcas[i].classList.remove("activa"); p.tooltip.ocultar(); }
      });
      raiz.appendChild(zona);
    });
    p.lienzo.appendChild(raiz);
  }

  // datos: [{ clave, nombre, valor }] ordenados de mayor a menor (barras clasificadas, un solo color).
  function barras(figura, datos, op) {
    var p = preparar(figura);
    if (datos.every(function (d) { return !d.valor; })) { vacio(p.lienzo); return; }
    var ancho = p.ancho;
    var fuenteNombre = "13px " + FUENTE, fuenteValor = "600 12px " + FUENTE;
    var anchoNombre = Math.ceil(maximo(datos.map(function (d) { return anchoTexto(d.nombre, fuenteNombre); })));
    var anchoValor = Math.ceil(maximo(datos.map(function (d) { return anchoTexto(op.formatoValor(d.valor), fuenteValor); }))) + 10;
    var apilado = anchoNombre + anchoValor + 130 > ancho; // sin espacio a la izquierda: el nombre va sobre la barra
    // Si la tarjeta es más alta que el gráfico (la fila la estira), las filas se separan hasta ocupar ese alto.
    var filaMinima = apilado ? 44 : 32, grosor = 14;
    var fila = op.alto ? Math.max(filaMinima, Math.min(apilado ? 56 : 46, Math.floor((op.alto - 2) / datos.length))) : filaMinima;
    var x0 = apilado ? 0 : anchoNombre + 12;
    var largoMax = ancho - x0 - anchoValor - 2;
    var tope = maximo(datos.map(function (d) { return d.valor; })) || 1;
    var alto = datos.length * fila + 2;
    var raiz = nodo("svg", { width: ancho, height: alto, viewBox: "0 0 " + ancho + " " + alto, role: "group", "aria-label": op.descripcion });
    raiz.appendChild(nodo("line", { x1: x0 + 0.5, x2: x0 + 0.5, y1: apilado ? 18 : 0, y2: alto, "class": "eje" }));

    var marcas = [];
    datos.forEach(function (d, i) {
      var arriba = i * fila;
      var yBarra = apilado ? arriba + 22 : arriba + (fila - grosor) / 2;
      var largo = d.valor / tope * largoMax;
      var resaltada = !op.seleccion || op.seleccion === d.clave;
      raiz.appendChild(nodo("text", apilado ? { x: 0, y: arriba + 15, "class": "texto-nombre" } :
        { x: x0 - 10, y: yBarra + grosor / 2 + 4.5, "class": "texto-nombre", "text-anchor": "end" }, d.nombre));
      marcas[i] = null;
      if (largo > 0) {
        marcas[i] = nodo("path", { d: rutaBarra(x0 + 1, yBarra, Math.max(largo, 3), grosor), "class": "marca " + (resaltada ? "serie-1" : "atenuada") });
        raiz.appendChild(marcas[i]);
      }
      raiz.appendChild(nodo("text", { x: x0 + 1 + Math.max(largo, 0) + 6, y: yBarra + grosor / 2 + 4.5, "class": "valor-barra" }, op.formatoValor(d.valor)));
    });

    datos.forEach(function (d, i) {
      var arriba = i * fila;
      var yBarra = apilado ? arriba + 22 : arriba + (fila - grosor) / 2;
      var punta = x0 + 1 + d.valor / tope * largoMax;
      var seleccionada = op.seleccion === d.clave;
      var zona = nodo("rect", { x: 0, y: arriba, width: ancho, height: fila, "class": "zona", tabindex: "0", role: "button",
        "aria-pressed": seleccionada ? "true" : "false", "aria-label": op.etiquetaAria(d, seleccionada), "data-clave": d.clave });
      interactuar(zona, {
        entrar: function () {
          if (marcas[i]) marcas[i].classList.add("activa");
          p.tooltip.mostrar(d.nombre, op.filasTooltip(d), punta, yBarra);
        },
        salir: function () { if (marcas[i]) marcas[i].classList.remove("activa"); p.tooltip.ocultar(); },
        activar: function () { op.alActivar(d.clave); }
      });
      raiz.appendChild(zona);
    });
    p.lienzo.appendChild(raiz);
  }

  // datos: [{ clave, eje, nombre, valor (0-100 o null), detalle }]. Línea de 2 px, puntos con anillo de superficie,
  // retícula vertical que se ajusta al mes más cercano y línea de meta.
  function linea(figura, datos, op) {
    var p = preparar(figura);
    var conValor = datos.filter(function (d) { return d.valor !== null; });
    if (!conValor.length) { vacio(p.lienzo); return; }
    var ancho = p.ancho, alto = op.alto || 230;
    var minimo = Math.min.apply(null, conValor.map(function (d) { return d.valor; }).concat([op.meta]));
    var base = minimo >= 50 ? 50 : 0; // el eje empieza en 50 % cuando todo está sobre ese valor
    var paso = base === 50 ? 10 : 20;
    var fuenteEje = "12px " + FUENTE;
    var m = { arriba: 14, derecha: 64, abajo: 28, izquierda: Math.ceil(anchoTexto("100 %", fuenteEje)) + 12 };
    var w = ancho - m.izquierda - m.derecha, h = alto - m.arriba - m.abajo;
    var y = function (v) { return m.arriba + h - (v - base) / (100 - base) * h; };
    var banda = w / datos.length;
    var x = function (i) { return m.izquierda + banda * (i + 0.5); };
    var cada = Math.max(1, Math.ceil(34 / banda));
    var raiz = nodo("svg", { width: ancho, height: alto, viewBox: "0 0 " + ancho + " " + alto, role: "group", "aria-label": op.descripcion });

    for (var v = base; v <= 100; v += paso) {
      var yy = Math.round(y(v)) + 0.5;
      raiz.appendChild(nodo("line", { x1: m.izquierda, x2: ancho - m.derecha, y1: yy, y2: yy, "class": v === base ? "eje" : "grilla" }));
      raiz.appendChild(nodo("text", { x: m.izquierda - 8, y: yy + 4, "class": "texto-eje", "text-anchor": "end" }, v + " %"));
    }
    datos.forEach(function (d, i) {
      if (i % cada === 0) raiz.appendChild(nodo("text", { x: x(i), y: alto - m.abajo + 18, "class": "texto-eje", "text-anchor": "middle" }, d.eje));
    });

    var yMeta = Math.round(y(op.meta)) + 0.5;
    raiz.appendChild(nodo("line", { x1: m.izquierda, x2: x(datos.length - 1) + 4, y1: yMeta, y2: yMeta, "class": "linea-meta" }));

    var trazo = "", pluma = false;
    datos.forEach(function (d, i) {
      if (d.valor === null) { pluma = false; return; }
      trazo += (pluma ? "L" : "M") + x(i).toFixed(1) + "," + y(d.valor).toFixed(1);
      pluma = true;
    });
    raiz.appendChild(nodo("path", { d: trazo, "class": "trazo" }));

    var cruz = nodo("line", { x1: 0, x2: 0, y1: m.arriba, y2: m.arriba + h, "class": "cruz", visibility: "hidden" });
    raiz.appendChild(cruz);
    var puntos = datos.map(function (d, i) {
      if (d.valor === null) return null;
      var punto = nodo("circle", { cx: x(i), cy: y(d.valor), r: 4, "class": "punto" });
      raiz.appendChild(punto);
      return punto;
    });

    // Etiqueta directa en el último punto y rótulo de la meta, sin superponerse.
    var iUltimo = -1;
    datos.forEach(function (d, i) { if (d.valor !== null) iUltimo = i; });
    var yUltimo = y(datos[iUltimo].valor);
    raiz.appendChild(nodo("text", { x: x(iUltimo) + 10, y: yUltimo + 4, "class": "valor-directo" }, V.formato.porcentaje(datos[iUltimo].valor)));
    var yTextoMeta = yMeta + 4;
    if (iUltimo === datos.length - 1 && Math.abs(yUltimo - yMeta) < 16) yTextoMeta = yUltimo < yMeta ? yMeta + 16 : yMeta - 8;
    raiz.appendChild(nodo("text", { x: x(datos.length - 1) + 10, y: yTextoMeta, "class": "texto-meta" }, "Meta " + op.meta + " %"));

    datos.forEach(function (d, i) {
      var zona = nodo("rect", { x: m.izquierda + banda * i, y: m.arriba, width: banda, height: h, "class": "zona",
        tabindex: "0", role: "img", "aria-label": op.etiquetaAria(d), "data-clave": d.clave });
      interactuar(zona, {
        entrar: function () {
          cruz.setAttribute("x1", x(i)); cruz.setAttribute("x2", x(i)); cruz.setAttribute("visibility", "visible");
          if (puntos[i]) puntos[i].classList.add("activa");
          p.tooltip.mostrar(d.nombre, [
            { serie: "serie-1", valor: d.valor === null ? "Sin datos" : V.formato.porcentaje(d.valor), etiqueta: "dentro del plazo" },
            { valor: d.detalle }
          ], x(i), d.valor === null ? m.arriba : y(d.valor));
        },
        salir: function () {
          cruz.setAttribute("visibility", "hidden");
          if (puntos[i]) puntos[i].classList.remove("activa");
          p.tooltip.ocultar();
        }
      });
      raiz.appendChild(zona);
    });
    p.lienzo.appendChild(raiz);
  }

  // Barra segmentada alta: un todo dividido en partes (máx. 6), cada parte su bloque, su porcentaje dentro
  // cuando cabe y una leyenda con los nombres en el mismo orden. Las partes en cero no se dibujan.
  // datos: [{ clave, nombre, valor, serie, textoOscuro }]
  function segmentos(figura, datos, op) {
    var p = preparar(figura);
    var leyenda = figura.querySelector(".leyenda");
    leyenda.replaceChildren();
    datos.forEach(function (d) {
      var item = V.el("li");
      item.appendChild(V.el("span", { clase: "muestra " + d.serie, "aria-hidden": "true" }));
      item.appendChild(document.createTextNode(d.nombre));
      leyenda.appendChild(item);
    });
    var total = datos.reduce(function (t, d) { return t + d.valor; }, 0);
    if (!total) { vacio(p.lienzo); return; }
    var ancho = p.ancho, alto = 28, separacion = 2;
    var visibles = datos.filter(function (d) { return d.valor > 0; });
    var disponible = ancho - separacion * (visibles.length - 1);
    var anchos = visibles.map(function (d) { return Math.max(4, disponible * d.valor / total); });
    var factor = disponible / anchos.reduce(function (t, a) { return t + a; }, 0);
    var raiz = nodo("svg", { width: ancho, height: alto, viewBox: "0 0 " + ancho + " " + alto, role: "group", "aria-label": op.descripcion });
    var x = 0;
    visibles.forEach(function (d, i) {
      var w = anchos[i] * factor;
      var resaltado = !op.seleccion || op.seleccion === d.clave;
      var cuota = V.formato.porcentaje(d.valor / total * 100);
      var bloque = nodo("rect", { x: x.toFixed(2), y: 0, width: w.toFixed(2), height: alto, rx: Math.min(4, w / 2),
        "class": "segmento " + (resaltado ? d.serie : "atenuada"), tabindex: "0", role: "button",
        "aria-pressed": op.seleccion === d.clave ? "true" : "false", "aria-label": op.etiquetaAria(d, cuota), "data-clave": d.clave });
      raiz.appendChild(bloque);
      if (anchoTexto(cuota, "600 12px " + FUENTE) + 16 <= w) {
        var tono = resaltado ? (d.textoOscuro ? " oscuro" : "") : " tenue";
        raiz.appendChild(nodo("text", { x: x + 8, y: alto / 2 + 4.5, "class": "texto-relleno" + tono }, cuota));
      }
      var centro = x + w / 2;
      interactuar(bloque, {
        entrar: function () {
          bloque.classList.add("activa");
          p.tooltip.mostrar(d.nombre, [{ serie: d.serie, valor: V.formato.numero(d.valor), etiqueta: d.valor === 1 ? "orden" : "órdenes" },
            { valor: cuota, etiqueta: "del total" }], centro, alto);
        },
        salir: function () { bloque.classList.remove("activa"); p.tooltip.ocultar(); },
        activar: function () { op.alActivar(d.clave); }
      });
      x += w + separacion;
    });
    p.lienzo.appendChild(raiz);
  }

  // Tabla equivalente a un gráfico: los mismos valores, legibles sin color ni puntero.
  function tablaDatos(figura, encabezados, filas) {
    var tabla = V.el("table", { clase: "tabla-mini" });
    var cabeza = V.el("thead"), filaCabeza = V.el("tr");
    encabezados.forEach(function (e, i) { filaCabeza.appendChild(V.el("th", { scope: "col", clase: i ? "num" : null }, e)); });
    cabeza.appendChild(filaCabeza);
    tabla.appendChild(cabeza);
    var cuerpo = V.el("tbody");
    filas.forEach(function (f) {
      var tr = V.el("tr");
      f.forEach(function (c, i) { tr.appendChild(V.el(i ? "td" : "th", i ? { clase: "num" } : { scope: "row" }, c)); });
      cuerpo.appendChild(tr);
    });
    tabla.appendChild(cuerpo);
    figura.querySelector(".tabla-datos").replaceChildren(tabla);
  }

  V.graficos = { columnas: columnas, barras: barras, linea: linea, segmentos: segmentos, tablaDatos: tablaDatos, escalaY: escalaY };
})(window.Valdora = window.Valdora || {});
