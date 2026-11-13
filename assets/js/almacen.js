// Persistencia local: los cambios se guardan solo en este navegador (localStorage).
// Si el navegador bloquea el almacenamiento, el panel sigue funcionando en memoria y lo avisa.
(function (V) {
  "use strict";

  var CLAVE = "valdora-panel-ordenes-v1";
  var almacen = { persistente: true };

  function copiaSemilla() { return JSON.parse(JSON.stringify(V.SEMILLA || [])); }

  function esValida(o) {
    return o && typeof o.folio === "string" && typeof o.fecha === "string" && typeof o.cliente === "string" &&
      V.SERVICIOS[o.servicio] && V.ESTADOS[o.estado] && V.PRIORIDADES[o.prioridad] && typeof o.monto === "number";
  }

  almacen.cargar = function () {
    try {
      var texto = window.localStorage.getItem(CLAVE);
      if (texto) {
        var datos = JSON.parse(texto);
        if (datos && datos.version === 1 && Array.isArray(datos.ordenes) && datos.ordenes.every(esValida)) {
          return { ordenes: datos.ordenes, origen: "guardado" };
        }
      }
    } catch (e) {
      almacen.persistente = false;
    }
    return { ordenes: copiaSemilla(), origen: "semilla" };
  };

  almacen.guardar = function (ordenes) {
    try {
      window.localStorage.setItem(CLAVE, JSON.stringify({ version: 1, ordenes: ordenes }));
      almacen.persistente = true;
    } catch (e) {
      almacen.persistente = false;
    }
    return almacen.persistente;
  };

  almacen.restablecer = function () {
    try { window.localStorage.removeItem(CLAVE); } catch (e) { almacen.persistente = false; }
    return copiaSemilla();
  };

  V.almacen = almacen;
})(window.Valdora = window.Valdora || {});
