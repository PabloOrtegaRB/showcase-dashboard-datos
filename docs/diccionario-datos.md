# Diccionario de datos

> Proyecto demostrativo — desarrollo propio, no asociado a un cliente real. Todos los datos son ficticios.

## Orden de servicio

Cada registro es una orden de servicio técnico solicitada por un cliente.

| Campo | Tipo | Obligatorio | Regla |
|---|---|---|---|
| `folio` | texto | Sí (se asigna solo) | Formato `OS-0001`. Único. Si una importación no lo trae, se asigna el siguiente libre |
| `fecha` | fecha `AAAA-MM-DD` | Sí | Fecha de la solicitud. Entre el 01-01-2000 y hoy. Al importar también se acepta `DD-MM-AAAA` y `DD/MM/AAAA` |
| `cliente` | texto | Sí | Entre 3 y 80 caracteres. Se normalizan los espacios repetidos |
| `comuna` | catálogo | Sí | Una de las 10 comunas del catálogo. No distingue mayúsculas ni tildes al importar |
| `servicio` | catálogo | Sí | Código o nombre: `MANTENCION_PREVENTIVA`, `MANTENCION_CORRECTIVA`, `CLIMATIZACION`, `ELECTRICIDAD`, `INSPECCION` |
| `prioridad` | catálogo | Sí | `BAJA`, `MEDIA`, `ALTA` o `CRITICA`. Define el plazo comprometido |
| `estado` | catálogo | Sí | `COMPLETADA`, `EN_CURSO`, `PROGRAMADA` o `CANCELADA` |
| `monto` | entero (CLP) | Sí | Entre 0 y 20.000.000. Al importar se acepta `250000`, `250.000` o `$250.000` |
| `dias_resolucion` | entero o vacío | Solo si está completada | Entre 0 y 365. Debe quedar vacío si la orden no está completada |
| `satisfaccion` | entero o vacío | No | De 1 a 5, solo para órdenes completadas. Vacío = el cliente no respondió la encuesta |

### Plazo comprometido según prioridad

| Prioridad | Plazo |
|---|---|
| Crítica | 1 día |
| Alta | 3 días |
| Media | 5 días |
| Baja | 10 días |

## Indicadores

Todos se calculan sobre las órdenes que cumplen los filtros activos.

| Indicador | Fórmula |
|---|---|
| Órdenes | Cantidad de órdenes filtradas |
| Ingresos | Suma de `monto` de las órdenes `COMPLETADA` |
| Ticket promedio | Ingresos ÷ cantidad de órdenes completadas |
| Cumplimiento de plazo | Completadas con `dias_resolucion` ≤ plazo de su prioridad ÷ completadas × 100. Meta: 90 % |
| Tiempo de resolución | Promedio de `dias_resolucion` de las completadas |
| Satisfacción | Promedio de `satisfaccion` entre las completadas que respondieron la encuesta |

Los gráficos por mes usan el mes de la fecha de solicitud. «Últimos 12 meses» se cuenta desde el último mes que tiene datos, para que el conjunto de ejemplo se vea completo aunque el panel se abra mucho después.

## Formato CSV

- **Exportación:** separador `;`, codificación UTF-8 con BOM y saltos de línea CRLF, para que Excel en español lo abra con tildes y columnas correctas. Exporta las órdenes filtradas, en el orden de la tabla.
- **Protección contra inyección de fórmulas:** una celda que empieza con `=`, `+`, `-` o `@` se exporta con un apóstrofo delante, para que la planilla la muestre como texto y no la ejecute.
- **Importación:** detecta el separador (`;` o `,`), acepta comillas y saltos de línea dentro de comillas (RFC 4180) y reconoce los encabezados sin importar mayúsculas ni tildes. Las filas válidas se importan. Las inválidas se informan con su número de fila (el encabezado es la fila 1) y el motivo. Límites: 1 MB y 5.000 filas.
- **Columnas obligatorias:** Fecha, Cliente, Comuna, Servicio, Prioridad, Estado y Monto (CLP). Si falta alguna, no se importa nada.

Ejemplo con errores intencionales: [`datos/ejemplo-importacion.csv`](../datos/ejemplo-importacion.csv). Tiene 10 filas: 7 se importan y 3 se rechazan, por monto inválido, comuna fuera del catálogo y días de resolución faltantes.

## Datos de ejemplo

`scripts/generar_datos.py` genera 240 órdenes ficticias, de noviembre de 2025 a octubre de 2026, con semilla fija, así que el resultado siempre es el mismo. Tienen una historia simple para que los gráficos digan algo:

- En verano (diciembre a febrero) sube la demanda de climatización y baja el cumplimiento de plazos.
- En invierno (junio a agosto) sube la demanda de electricidad.
- Las solicitudes de octubre de 2026 pueden seguir abiertas (en curso o programadas).
