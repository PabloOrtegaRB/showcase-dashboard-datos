// Cálculos del panel: filtros, indicadores y agregaciones. Funciones puras, sin acceso al DOM.
(function (V) {
  "use strict";

  function aTiempo(o) { return o.dias_resolucion !== null && o.dias_resolucion <= V.PLAZOS[o.prioridad]; }
  function suma(lista, campo) { return lista.reduce(function (t, o) { return t + o[campo]; }, 0); }

  // filtros: { desde, hasta (claves "AAAA-MM"), servicio, estado, comuna, texto }
  // excluir: un filtro que se ignora; los gráficos de una dimensión no se filtran por ella misma,
  // así la selección se ve resaltada en su contexto.
  function filtrar(ordenes, filtros, excluir) {
    var texto = V.normalizar(filtros.texto);
    return ordenes.filter(function (o) {
      var mes = o.fecha.slice(0, 7);
      if (excluir !== "periodo" && ((filtros.desde && mes < filtros.desde) || (filtros.hasta && mes > filtros.hasta))) return false;
      if (excluir !== "servicio" && filtros.servicio && o.servicio !== filtros.servicio) return false;
      if (excluir !== "estado" && filtros.estado && o.estado !== filtros.estado) return false;
      if (excluir !== "comuna" && filtros.comuna && o.comuna !== filtros.comuna) return false;
      if (texto && V.normalizar(o.cliente + " " + o.folio).indexOf(texto) < 0) return false;
      return true;
    });
  }

  function kpis(ordenes) {
    var completadas = ordenes.filter(function (o) { return o.estado === "COMPLETADA"; });
    var conRespuesta = completadas.filter(function (o) { return o.satisfaccion !== null; });
    var ingresos = suma(completadas, "monto");
    var dentroDelPlazo = completadas.filter(aTiempo).length;
    var n = completadas.length;
    return {
      ordenes: ordenes.length,
      completadas: n,
      ingresos: ingresos,
      ticket: n ? ingresos / n : null,
      aTiempo: dentroDelPlazo,
      cumplimiento: n ? dentroDelPlazo / n * 100 : null,
      tiempoMedio: n ? suma(completadas, "dias_resolucion") / n : null,
      respuestas: conRespuesta.length,
      satisfaccion: conRespuesta.length ? suma(conRespuesta, "satisfaccion") / conRespuesta.length : null
    };
  }

  function porMes(ordenes, meses) {
    var mapa = {};
    meses.forEach(function (m) { mapa[m] = { mes: m, ordenes: 0, completadas: 0, ingresos: 0, aTiempo: 0 }; });
    ordenes.forEach(function (o) {
      var fila = mapa[o.fecha.slice(0, 7)];
      if (!fila) return;
      fila.ordenes++;
      if (o.estado === "COMPLETADA") {
        fila.completadas++;
        fila.ingresos += o.monto;
        if (aTiempo(o)) fila.aTiempo++;
      }
    });
    return meses.map(function (m) {
      var fila = mapa[m];
      fila.cumplimiento = fila.completadas ? fila.aTiempo / fila.completadas * 100 : null;
      return fila;
    });
  }

  // Cuenta (u otra medida) por cada valor de un catálogo, incluidos los que quedan en cero.
  function agrupar(ordenes, campo, claves, medida) {
    var mapa = {};
    claves.forEach(function (c) { mapa[c] = 0; });
    ordenes.forEach(function (o) { if (o[campo] in mapa) mapa[o[campo]] += medida(o); });
    return claves.map(function (c) { return { clave: c, valor: mapa[c] }; });
  }

  function ordenarDesc(lista) {
    return lista.slice().sort(function (a, b) { return b.valor - a.valor || a.clave.localeCompare(b.clave, "es"); });
  }

  V.indicadores = {
    aTiempo: aTiempo,
    filtrar: filtrar,
    kpis: kpis,
    porMes: porMes,
    porServicio: function (ordenes) {
      return ordenarDesc(agrupar(ordenes, "servicio", Object.keys(V.SERVICIOS), function () { return 1; }));
    },
    porComuna: function (ordenes) {
      return ordenarDesc(agrupar(ordenes, "comuna", V.COMUNAS, function (o) { return o.estado === "COMPLETADA" ? o.monto : 0; }));
    },
    porEstado: function (ordenes) {
      return agrupar(ordenes, "estado", Object.keys(V.ESTADOS), function () { return 1; });
    }
  };
})(window.Valdora = window.Valdora || {});
