// Reglas de negocio de una orden. Las usan el formulario y la importación CSV, así que ambos validan igual.
(function (V) {
  "use strict";

  V.CAMPOS = {
    folio: "Folio", fecha: "Fecha", cliente: "Cliente", comuna: "Comuna", servicio: "Servicio",
    prioridad: "Prioridad", estado: "Estado", monto: "Monto (CLP)", dias_resolucion: "Días de resolución",
    satisfaccion: "Satisfacción"
  };

  function compacto(texto) { return V.normalizar(texto).replace(/[\s_-]+/g, ""); }

  // Acepta el código ("CLIMATIZACION") o la etiqueta ("Climatización", "climatizacion").
  function codigoDe(catalogo, valor) {
    var buscado = compacto(valor);
    if (!buscado) return null;
    var codigos = Object.keys(catalogo);
    for (var i = 0; i < codigos.length; i++) {
      if (compacto(codigos[i]) === buscado || compacto(catalogo[codigos[i]]) === buscado) return codigos[i];
    }
    return null;
  }

  function comunaDe(valor) {
    var buscada = V.normalizar(valor);
    for (var i = 0; i < V.COMUNAS.length; i++) {
      if (V.normalizar(V.COMUNAS[i]) === buscada) return V.COMUNAS[i];
    }
    return null;
  }

  // Acepta 1250000, "1250000", "1.250.000" o "$1.250.000". Devuelve null si no es un entero.
  function interpretarEntero(valor) {
    if (typeof valor === "number") return Number.isInteger(valor) ? valor : null;
    var texto = String(valor == null ? "" : valor).replace(/[$\s]/g, "").replace(/\.(?=\d{3}(\D|$))/g, "");
    if (!/^-?\d+$/.test(texto)) return null;
    return parseInt(texto, 10);
  }

  // Acepta AAAA-MM-DD, DD-MM-AAAA o DD/MM/AAAA. Devuelve "AAAA-MM-DD", o null si la fecha no existe.
  function interpretarFecha(valor) {
    var texto = String(valor == null ? "" : valor).trim();
    var anio, mes, dia, m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(texto);
    if (m) { anio = +m[1]; mes = +m[2]; dia = +m[3]; }
    else {
      m = /^(\d{1,2})[-/](\d{1,2})[-/](\d{4})$/.exec(texto);
      if (!m) return null;
      dia = +m[1]; mes = +m[2]; anio = +m[3];
    }
    var d = new Date(Date.UTC(anio, mes - 1, dia));
    if (d.getUTCFullYear() !== anio || d.getUTCMonth() !== mes - 1 || d.getUTCDate() !== dia) return null;
    return anio + "-" + String(mes).padStart(2, "0") + "-" + String(dia).padStart(2, "0");
  }

  function texto(valor) { return String(valor == null ? "" : valor).trim(); }

  // Valida y normaliza una orden. Devuelve { ok, errores: { campo: mensaje }, orden }.
  V.validarOrden = function (entrada, opciones) {
    var hoy = (opciones && opciones.hoy) || V.hoyIso();
    var errores = {};
    var orden = { folio: entrada.folio || null };

    var fecha = interpretarFecha(entrada.fecha);
    if (!texto(entrada.fecha)) errores.fecha = "Ingresa la fecha de la solicitud.";
    else if (!fecha) errores.fecha = "Usa el formato AAAA-MM-DD o DD-MM-AAAA, con una fecha que exista.";
    else if (fecha > hoy) errores.fecha = "La fecha no puede ser posterior a hoy.";
    else if (fecha < "2000-01-01") errores.fecha = "La fecha debe ser del año 2000 en adelante.";
    orden.fecha = fecha;

    var cliente = texto(entrada.cliente).replace(/\s+/g, " ");
    if (cliente.length < 3 || cliente.length > 80) errores.cliente = "Debe tener entre 3 y 80 caracteres.";
    orden.cliente = cliente;

    orden.comuna = comunaDe(entrada.comuna);
    if (!orden.comuna) errores.comuna = "Elige una comuna de la lista.";
    orden.servicio = codigoDe(V.SERVICIOS, entrada.servicio);
    if (!orden.servicio) errores.servicio = "Elige un servicio de la lista.";
    orden.prioridad = codigoDe(V.PRIORIDADES, entrada.prioridad);
    if (!orden.prioridad) errores.prioridad = "Elige una prioridad: Baja, Media, Alta o Crítica.";
    orden.estado = codigoDe(V.ESTADOS, entrada.estado);
    if (!orden.estado) errores.estado = "Elige un estado: Completada, En curso, Programada o Cancelada.";

    orden.monto = interpretarEntero(entrada.monto);
    if (orden.monto === null || orden.monto < 0 || orden.monto > V.MONTO_MAXIMO) {
      errores.monto = "Debe ser un número entero entre 0 y " + V.formato.numero(V.MONTO_MAXIMO) + ".";
    }

    var textoDias = texto(entrada.dias_resolucion);
    var textoSatisfaccion = texto(entrada.satisfaccion);
    orden.dias_resolucion = null;
    orden.satisfaccion = null;
    if (orden.estado === "COMPLETADA") {
      orden.dias_resolucion = interpretarEntero(textoDias);
      if (!textoDias) errores.dias_resolucion = "Es obligatorio cuando la orden está completada.";
      else if (orden.dias_resolucion === null || orden.dias_resolucion < 0 || orden.dias_resolucion > 365) {
        errores.dias_resolucion = "Debe ser un número entero entre 0 y 365.";
      }
      if (textoSatisfaccion) {
        orden.satisfaccion = interpretarEntero(textoSatisfaccion);
        if (orden.satisfaccion === null || orden.satisfaccion < 1 || orden.satisfaccion > 5) {
          errores.satisfaccion = "Debe ser un número entero de 1 a 5, o quedar vacía.";
        }
      }
    } else if (orden.estado) {
      if (textoDias) errores.dias_resolucion = "Solo se registra cuando la orden está completada.";
      if (textoSatisfaccion) errores.satisfaccion = "Solo se registra cuando la orden está completada.";
    }
    return { ok: Object.keys(errores).length === 0, errores: errores, orden: orden };
  };

  V.validacion = { codigoDe: codigoDe, comunaDe: comunaDe, interpretarEntero: interpretarEntero, interpretarFecha: interpretarFecha };
})(window.Valdora = window.Valdora || {});
