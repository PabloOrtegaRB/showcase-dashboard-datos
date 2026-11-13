// Exportación e importación CSV. Pensado para planillas en español: separador ";", BOM UTF-8 y CRLF.
(function (V) {
  "use strict";

  var COLUMNAS = [
    { campo: "folio", titulo: "Folio" }, { campo: "fecha", titulo: "Fecha" }, { campo: "cliente", titulo: "Cliente" },
    { campo: "comuna", titulo: "Comuna" }, { campo: "servicio", titulo: "Servicio" },
    { campo: "prioridad", titulo: "Prioridad" }, { campo: "estado", titulo: "Estado" },
    { campo: "monto", titulo: "Monto (CLP)" }, { campo: "dias_resolucion", titulo: "Días de resolución" },
    { campo: "satisfaccion", titulo: "Satisfacción" }
  ];
  var OBLIGATORIAS = ["fecha", "cliente", "comuna", "servicio", "prioridad", "estado", "monto"];
  var MAX_FILAS = 5000;

  function clave(texto) { return V.normalizar(texto).replace(/[^a-z0-9]/g, ""); }
  var ALIAS = { monto: "monto", dias: "dias_resolucion" };
  COLUMNAS.forEach(function (c) { ALIAS[clave(c.titulo)] = c.campo; ALIAS[clave(c.campo)] = c.campo; });

  // Una celda que empieza con = + - @ (o tabulación/retorno) se abriría como fórmula en una planilla
  // (inyección de fórmulas). Se antepone un apóstrofo para que se muestre como texto.
  function neutralizar(valor) {
    var texto = valor == null ? "" : String(valor);
    return /^[=+\-@\t\r]/.test(texto) ? "'" + texto : texto;
  }

  function celda(valor, separador) {
    var texto = neutralizar(valor);
    if (texto.indexOf(separador) >= 0 || /["\r\n]/.test(texto) || texto !== texto.trim()) {
      texto = '"' + texto.replace(/"/g, '""') + '"';
    }
    return texto;
  }

  function serializar(ordenes) {
    var sep = ";";
    var lineas = [COLUMNAS.map(function (c) { return celda(c.titulo, sep); }).join(sep)];
    ordenes.forEach(function (o) {
      lineas.push([o.folio, o.fecha, o.cliente, o.comuna, V.SERVICIOS[o.servicio], V.PRIORIDADES[o.prioridad],
        V.ESTADOS[o.estado], o.monto, o.dias_resolucion, o.satisfaccion]
        .map(function (v) { return celda(v, sep); }).join(sep));
    });
    return "﻿" + lineas.join("\r\n") + "\r\n";
  }

  // Separador de la primera línea (fuera de comillas): ";" o ",".
  function detectarSeparador(texto) {
    var puntoYComa = 0, comas = 0, enComillas = false;
    for (var i = 0; i < texto.length; i++) {
      var c = texto[i];
      if (c === '"') enComillas = !enComillas;
      else if (!enComillas && (c === "\n" || c === "\r")) break;
      else if (!enComillas && c === ";") puntoYComa++;
      else if (!enComillas && c === ",") comas++;
    }
    return comas > puntoYComa ? "," : ";";
  }

  // Lector RFC 4180: comillas, comillas escapadas ("") y saltos de línea dentro de comillas.
  // Cada fila conserva su número (como en una planilla, el encabezado es la fila 1).
  function parsear(texto) {
    texto = String(texto).replace(/^﻿/, "");
    var separador = detectarSeparador(texto);
    var filas = [], valores = [], valor = "", enComillas = false, numero = 1;
    function cerrarFila() {
      valores.push(valor);
      filas.push({ numero: numero, valores: valores });
      valores = []; valor = ""; numero++;
    }
    for (var i = 0; i < texto.length; i++) {
      var c = texto[i];
      if (enComillas) {
        if (c === '"' && texto[i + 1] === '"') { valor += '"'; i++; }
        else if (c === '"') enComillas = false;
        else valor += c;
      } else if (c === '"') enComillas = true;
      else if (c === separador) { valores.push(valor); valor = ""; }
      else if (c === "\r" || c === "\n") {
        if (c === "\r" && texto[i + 1] === "\n") i++;
        cerrarFila();
      } else valor += c;
    }
    if (valor !== "" || valores.length) cerrarFila();
    return {
      separador: separador,
      filas: filas.filter(function (f) { return f.valores.some(function (v) { return v.trim() !== ""; }); })
    };
  }

  function numeroDeFolio(folio) { var m = /^OS-(\d+)$/.exec(folio || ""); return m ? parseInt(m[1], 10) : 0; }

  V.siguienteFolio = function (ordenes, usados) {
    var n = ordenes.reduce(function (max, o) { return Math.max(max, numeroDeFolio(o.folio)); }, 0) + 1;
    var folio;
    do { folio = "OS-" + String(n++).padStart(4, "0"); } while (usados && usados.has(folio));
    return folio;
  };

  // Importa las filas válidas y reporta las inválidas con su número de fila. Nada se guarda aquí:
  // quien llama decide qué hacer con resultado.importadas.
  function importar(texto, existentes, opciones) {
    var resultado = { leidas: 0, importadas: [], errores: [], faltantes: [] };
    var datos = parsear(texto);
    if (!datos.filas.length) { resultado.errores.push({ fila: 1, mensajes: ["El archivo está vacío."] }); return resultado; }
    var mapa = {};
    datos.filas[0].valores.forEach(function (encabezado, i) {
      var campo = ALIAS[clave(encabezado)];
      if (campo && mapa[campo] === undefined) mapa[campo] = i;
    });
    resultado.faltantes = OBLIGATORIAS.filter(function (c) { return mapa[c] === undefined; }).map(function (c) { return V.CAMPOS[c]; });
    if (resultado.faltantes.length) return resultado;
    var cuerpo = datos.filas.slice(1);
    if (cuerpo.length > MAX_FILAS) {
      resultado.errores.push({ fila: 1, mensajes: ["El archivo supera el máximo de " + V.formato.numero(MAX_FILAS) + " filas."] });
      return resultado;
    }

    var usados = new Set(existentes.map(function (o) { return o.folio; }));
    var todas = existentes.slice();
    cuerpo.forEach(function (fila) {
      resultado.leidas++;
      var entrada = {};
      Object.keys(mapa).forEach(function (campo) { entrada[campo] = (fila.valores[mapa[campo]] || "").trim(); });
      // Un archivo exportado por el panel trae un apóstrofo delante de las celdas que parecían fórmulas.
      if (entrada.cliente) entrada.cliente = entrada.cliente.replace(/^'(?=[=+\-@])/, "");
      var v = V.validarOrden(entrada, opciones);
      var mensajes = Object.keys(v.errores).map(function (campo) { return V.CAMPOS[campo] + ": " + v.errores[campo]; });
      var folio = entrada.folio || "";
      if (folio && !/^OS-\d{4,6}$/.test(folio)) mensajes.unshift("Folio: usa el formato OS-0001.");
      else if (folio && usados.has(folio)) mensajes.unshift("Folio: " + folio + " ya existe.");
      if (mensajes.length) { resultado.errores.push({ fila: fila.numero, mensajes: mensajes }); return; }
      v.orden.folio = folio || V.siguienteFolio(todas, usados);
      usados.add(v.orden.folio);
      todas.push(v.orden);
      resultado.importadas.push(v.orden);
    });
    return resultado;
  }

  V.csv = { COLUMNAS: COLUMNAS, neutralizar: neutralizar, serializar: serializar, parsear: parsear, importar: importar };
})(window.Valdora = window.Valdora || {});
