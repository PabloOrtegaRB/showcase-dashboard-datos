// Núcleo del panel: catálogos, formatos en español de Chile y utilidades compartidas.
// Todos los módulos cuelgan de window.Valdora (scripts clásicos: el panel funciona sin compilación).
(function (V) {
  "use strict";

  V.SERVICIOS = {
    MANTENCION_PREVENTIVA: "Mantención preventiva",
    MANTENCION_CORRECTIVA: "Mantención correctiva",
    CLIMATIZACION: "Climatización",
    ELECTRICIDAD: "Electricidad",
    INSPECCION: "Inspección"
  };
  // El orden de los estados es fijo: define el orden de los bloques y su color (el color sigue a la entidad).
  V.ESTADOS = { COMPLETADA: "Completada", EN_CURSO: "En curso", PROGRAMADA: "Programada", CANCELADA: "Cancelada" };
  V.PRIORIDADES = { BAJA: "Baja", MEDIA: "Media", ALTA: "Alta", CRITICA: "Crítica" };
  V.PLAZOS = { BAJA: 10, MEDIA: 5, ALTA: 3, CRITICA: 1 }; // días comprometidos según prioridad
  V.COMUNAS = ["Santiago", "Providencia", "Las Condes", "Ñuñoa", "Maipú", "Pudahuel", "San Bernardo",
    "Puente Alto", "La Florida", "Quilicura"];
  V.MONTO_MAXIMO = 20000000;

  var MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre",
    "octubre", "noviembre", "diciembre"];
  var NUMERO = new Intl.NumberFormat("es-CL");
  var DECIMAL = new Intl.NumberFormat("es-CL", { minimumFractionDigits: 1, maximumFractionDigits: 1 });

  V.formato = {
    clp: function (n) { return "$" + NUMERO.format(Math.round(n)); },
    clpCompacto: function (n) {
      if (Math.abs(n) >= 1e6) return "$" + new Intl.NumberFormat("es-CL", { maximumFractionDigits: 1 }).format(n / 1e6) + " M";
      if (Math.abs(n) >= 1e3) return "$" + NUMERO.format(Math.round(n / 1e3)) + " mil";
      return "$" + NUMERO.format(n);
    },
    numero: function (n) { return NUMERO.format(n); },
    decimal: function (n) { return DECIMAL.format(n); },
    porcentaje: function (n) { return DECIMAL.format(n) + " %"; },
    fecha: function (iso) { var p = iso.split("-"); return p[2] + "-" + p[1] + "-" + p[0]; },
    mesLargo: function (clave) { var p = clave.split("-"); return MESES[+p[1] - 1] + " " + p[0]; },
    mesCorto: function (clave) { var p = clave.split("-"); return MESES[+p[1] - 1].slice(0, 3); },
    mesConAnio: function (clave) { var p = clave.split("-"); return MESES[+p[1] - 1].slice(0, 3) + " " + p[0]; }
  };

  // Texto comparable: minúsculas, sin tildes y sin espacios repetidos ("Climatización " -> "climatizacion").
  V.normalizar = function (texto) {
    return String(texto == null ? "" : texto).normalize("NFD").replace(/[̀-ͯ]/g, "")
      .toLowerCase().replace(/\s+/g, " ").trim();
  };

  V.claveMes = function (fechaIso) { return fechaIso.slice(0, 7); };

  // Lista de meses "AAAA-MM" entre dos claves, ambas incluidas.
  V.rangoMeses = function (desde, hasta) {
    var meses = [];
    var anio = +desde.slice(0, 4), mes = +desde.slice(5, 7);
    var fin = +hasta.slice(0, 4) * 12 + +hasta.slice(5, 7);
    while (anio * 12 + mes <= fin && meses.length < 600) {
      meses.push(anio + "-" + String(mes).padStart(2, "0"));
      mes += 1;
      if (mes > 12) { mes = 1; anio += 1; }
    }
    return meses;
  };

  V.hoyIso = function () {
    var d = new Date();
    return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
  };

  // Crea un nodo con texto seguro (textContent): los datos nunca se insertan como HTML.
  V.el = function (etiqueta, atributos, texto) {
    var nodo = document.createElement(etiqueta);
    if (atributos) {
      Object.keys(atributos).forEach(function (clave) {
        if (atributos[clave] === null || atributos[clave] === undefined || atributos[clave] === false) return;
        if (clave === "clase") nodo.className = atributos[clave];
        else nodo.setAttribute(clave, atributos[clave] === true ? "" : atributos[clave]);
      });
    }
    if (texto !== undefined && texto !== null) nodo.textContent = String(texto);
    return nodo;
  };
})(window.Valdora = window.Valdora || {});
