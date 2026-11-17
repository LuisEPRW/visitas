// Lógica de datos de la app: sin pantalla ni almacenamiento, para poder
// probarla también con Node (pruebas/datos.test.js).

const VERSION_DATOS = 1;

// Nombres tal cual salen en la tienda de eladiopineiro.com (02/10/2026),
// sin los lotes de 4 botellas (eso se apunta con la cantidad). Las Duplas de
// Pezium se añadieron el 15/10/2026 a petición del CEO.
const VINOS_INICIALES = [
  'Flor de Carme',
  'Flor de Carme Millésime',
  'Frore de Carme Pezium',
  'Flor de Carme Millésime Pezium Brut Nature',
  'Frore de Carme Pezium Dupla',
  'Flor de Carme Millésime Pezium Dupla',
  'La Coartada',
  'La Ola',
  'Envidiacochina',
  'Envidiacochina Magnum',
  'Amodiño',
  'Bendita Agua – Licor Hierbas',
  'Bendita Agua – Licor Singular',
  'Bendita Agua – Crema',
  'Bendita Agua – Café',
  'Bendita Agua – Chocolate',
  'Bendita Agua – Orujo',
];

const RESULTADOS = {
  vendido: 'Vendido',
  pendiente: 'Pendiente',
  sin_interes: 'Sin interés',
};

const TIPOS_PENDIENTE = {
  compra: 'Pendiente de compra',
  introducir: 'Pendiente de introducir',
};

const ESTADOS_PENDIENTE = {
  abierta: 'Abierta',
  conseguida: 'Conseguida',
  descartada: 'Descartada',
};

function nuevoId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

// Fechas siempre como texto 'AAAA-MM-DD' en hora local (toISOString usa UTC
// y cerca de medianoche daría el día equivocado).
function aISO(fecha) {
  const m = String(fecha.getMonth() + 1).padStart(2, '0');
  const d = String(fecha.getDate()).padStart(2, '0');
  return `${fecha.getFullYear()}-${m}-${d}`;
}

function hoyISO() {
  return aISO(new Date());
}

function sumarDias(iso, dias) {
  const [a, m, d] = iso.split('-').map(Number);
  return aISO(new Date(a, m - 1, d + dias));
}

function diasEntre(desdeISO, hastaISO) {
  const [a1, m1, d1] = desdeISO.split('-').map(Number);
  const [a2, m2, d2] = hastaISO.split('-').map(Number);
  return Math.round((Date.UTC(a2, m2 - 1, d2) - Date.UTC(a1, m1 - 1, d1)) / 86400000);
}

function fechaES(iso) {
  if (!iso) return '';
  const [a, m, d] = iso.split('-');
  return `${d}/${m}/${a}`;
}

function normalizar(texto) {
  return String(texto || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
}

function datosVacios() {
  return {
    version: VERSION_DATOS,
    vinos: VINOS_INICIALES.map((nombre) => ({ id: nuevoId(), nombre, activo: true })),
    distribuidores: [],
    comerciales: [],
    clientes: [],
    visitas: [],
    agenda: [],
    reuniones: [],
    eventos: [],
    ajustes: { salida: null, ultimaCopia: null },
  };
}

function porId(lista, id) {
  return lista.find((x) => x.id === id);
}

function nombreVino(datos, id) {
  const v = porId(datos.vinos, id);
  return v ? v.nombre : '(vino borrado)';
}

function nombreConAnada(datos, l) {
  return nombreVino(datos, l.vinoId) + (l.anada ? ' ' + l.anada : '');
}

// La última añada apuntada de ese vino, para proponerla al volver a elegirlo.
function ultimaAnada(datos, vinoId) {
  const visitas = [...datos.visitas].sort((a, b) => b.fecha.localeCompare(a.fecha) || (b.creadaEl || '').localeCompare(a.creadaEl || ''));
  for (const v of visitas) {
    const lineas = [...(v.lineas || []), ...(v.pendiente ? v.pendiente.lineas : [])];
    const l = lineas.find((x) => x.vinoId === vinoId && x.anada);
    if (l) return l.anada;
  }
  return '';
}

// "12 botellas Flor de Carme 2023, 2 cajas La Ola"
function describirLineas(datos, lineas) {
  return (lineas || []).map((l) => {
    const nombre = nombreConAnada(datos, l);
    if (!l.cantidad) return nombre;
    // Una Dupla ya es un lote de dos botellas: «1 Frore de Carme Pezium Dupla».
    if (l.unidad !== 'cajas' && /dupla/i.test(nombre)) return `${l.cantidad} ${nombre}`;
    const unidad = l.unidad === 'cajas'
      ? (l.cantidad === 1 ? 'caja' : 'cajas')
      : (l.cantidad === 1 ? 'botella' : 'botellas');
    return `${l.cantidad} ${unidad} ${nombre}`;
  }).join(', ');
}

// Visitas con algo pendiente aún sin resolver, la fecha prevista más próxima primero.
function pendientesAbiertas(datos) {
  return datos.visitas
    .filter((v) => v.pendiente && v.pendiente.estado === 'abierta')
    .sort((a, b) => (a.pendiente.fechaPrevista || '9999').localeCompare(b.pendiente.fechaPrevista || '9999'));
}

function pendientesCerradas(datos) {
  return datos.visitas
    .filter((v) => v.pendiente && v.pendiente.estado !== 'abierta')
    .sort((a, b) => (b.pendiente.cerradaEl || '').localeCompare(a.pendiente.cerradaEl || ''));
}

// filtros: { desde, hasta, distribuidorId, comercialId, provincia, zona, resultado, texto }
function filtrarVisitas(datos, filtros) {
  const f = filtros || {};
  const texto = normalizar(f.texto);
  return datos.visitas.filter((v) => {
    if (f.desde && v.fecha < f.desde) return false;
    if (f.hasta && v.fecha > f.hasta) return false;
    if (f.distribuidorId && v.distribuidorId !== f.distribuidorId) return false;
    if (f.comercialId && v.comercialId !== f.comercialId) return false;
    if (f.resultado && v.resultado !== f.resultado) return false;
    const cliente = porId(datos.clientes, v.clienteId) || {};
    if (f.provincia && normalizar(cliente.provincia) !== normalizar(f.provincia)) return false;
    if (f.zona && normalizar(cliente.zona) !== normalizar(f.zona)) return false;
    if (texto && !normalizar(`${cliente.nombre} ${cliente.poblacion} ${v.nota}`).includes(texto)) return false;
    return true;
  }).sort((a, b) => b.fecha.localeCompare(a.fecha) || (b.creadaEl || '').localeCompare(a.creadaEl || ''));
}

function totales(datos, visitas) {
  const t = { visitas: visitas.length, vendido: 0, pendiente: 0, sin_interes: 0, botellas: 0, cajas: 0, porVino: [] };
  const porVino = new Map();
  for (const v of visitas) {
    t[v.resultado] = (t[v.resultado] || 0) + 1;
    for (const l of v.lineas || []) {
      const cantidad = Number(l.cantidad) || 0;
      const clave = l.vinoId + '|' + (l.anada || '');
      const fila = porVino.get(clave) || { vinoId: l.vinoId, anada: l.anada || '', nombre: nombreConAnada(datos, l), botellas: 0, cajas: 0 };
      if (l.unidad === 'cajas') { fila.cajas += cantidad; t.cajas += cantidad; } else { fila.botellas += cantidad; t.botellas += cantidad; }
      porVino.set(clave, fila);
    }
  }
  t.porVino = [...porVino.values()].sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
  return t;
}

// Agrupa visitas por una clave de texto. Devuelve [{clave, visitas}] ordenado.
function agrupar(visitas, claveDe, ordenDescendente) {
  const grupos = new Map();
  for (const v of visitas) {
    const clave = claveDe(v) || '(sin indicar)';
    if (!grupos.has(clave)) grupos.set(clave, []);
    grupos.get(clave).push(v);
  }
  const lista = [...grupos.entries()].map(([clave, vs]) => ({ clave, visitas: vs }));
  lista.sort((a, b) => a.clave.localeCompare(b.clave, 'es'));
  if (ordenDescendente) lista.reverse();
  return lista;
}

function buscarClientes(datos, texto) {
  const t = normalizar(texto);
  if (!t) return [];
  return datos.clientes
    .filter((c) => normalizar(`${c.nombre} ${c.poblacion}`).includes(t))
    .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
}

// Clientes visitados más recientemente (para elegir rápido sin escribir).
function clientesRecientes(datos, cuantos, distribuidorId) {
  const vistos = [];
  const visitas = [...datos.visitas].sort((a, b) => b.fecha.localeCompare(a.fecha) || (b.creadaEl || '').localeCompare(a.creadaEl || ''));
  for (const v of visitas) {
    if (distribuidorId && v.distribuidorId !== distribuidorId) continue;
    if (vistos.includes(v.clienteId)) continue;
    if (!porId(datos.clientes, v.clienteId)) continue;
    vistos.push(v.clienteId);
    if (vistos.length >= cuantos) break;
  }
  return vistos.map((id) => porId(datos.clientes, id));
}

function valoresUsados(datos, campo) {
  const vistos = new Map();
  for (const c of [...datos.clientes, ...datos.distribuidores]) {
    const valor = String(c[campo] || '').trim();
    if (valor && !vistos.has(normalizar(valor))) vistos.set(normalizar(valor), valor);
  }
  return [...vistos.values()].sort((a, b) => a.localeCompare(b, 'es'));
}

// ---------- Cambios en visitas y pendientes ----------

// Alta o modificación. Si la visita es la venta de un pendiente anterior,
// ese pendiente queda cerrado como conseguido.
function guardarVisita(datos, visita) {
  const i = datos.visitas.findIndex((v) => v.id === visita.id);
  if (i >= 0) datos.visitas[i] = visita; else datos.visitas.push(visita);
  const origen = visita.origenPendienteId && porId(datos.visitas, visita.origenPendienteId);
  if (origen && origen.pendiente) {
    Object.assign(origen.pendiente, { estado: 'conseguida', cerradaEl: visita.fecha, visitaVentaId: visita.id });
  }
}

function borrarVisita(datos, id) {
  const visita = porId(datos.visitas, id);
  if (!visita) return;
  datos.visitas = datos.visitas.filter((v) => v.id !== id);
  // Si era la venta de un pendiente, el pendiente vuelve a estar abierto.
  const origen = visita.origenPendienteId && porId(datos.visitas, visita.origenPendienteId);
  if (origen && origen.pendiente && origen.pendiente.visitaVentaId === id) {
    Object.assign(origen.pendiente, { estado: 'abierta', cerradaEl: null, visitaVentaId: null });
  }
}

function descartarPendiente(datos, id, hoy) {
  const v = porId(datos.visitas, id);
  Object.assign(v.pendiente, { estado: 'descartada', cerradaEl: hoy });
}

function reabrirPendiente(datos, id) {
  const v = porId(datos.visitas, id);
  Object.assign(v.pendiente, { estado: 'abierta', cerradaEl: null, visitaVentaId: null });
}

function posponerPendiente(datos, id, dias, hoy) {
  const p = porId(datos.visitas, id).pendiente;
  // Se pospone desde la fecha prevista o desde hoy si ya ha pasado.
  const base = p.fechaPrevista && p.fechaPrevista > hoy ? p.fechaPrevista : hoy;
  p.fechaPrevista = sumarDias(base, dias);
}

// ---------- Exportar a Excel (CSV) ----------

// Para la reunión bimestral (se guardan tal cual, como texto).
const ESTADOS_DISTRIBUIDOR = ['Activo', 'Potencial', 'Perdido'];
const TIPOS_DISTRIBUIDOR = ['Distribuidor', 'Importador'];
const CLIENTE_NUEVO = ['Sí', 'No'];

const COLUMNAS_CSV = [
  'Fecha', 'Distribuidor', 'Comercial', 'Cliente', 'Tipo de cliente', 'Población', 'Provincia', 'Zona',
  'Resultado', 'Vino vendido', 'Añada', 'Cantidad', 'Unidad', 'Pendiente de', 'Vinos pendientes', 'Detalle pendiente',
  'Fecha prevista', 'Estado pendiente', 'Nota', 'Cliente nuevo', 'Fecha de alta', 'Muestras', 'Para qué las muestras',
];

function celdaCSV(valor) {
  let texto = valor === null || valor === undefined ? '' : String(valor);
  // Un texto que empieza por = + - @ Excel lo trataría como fórmula.
  // (Un número negativo como «-56,3 %» no es peligroso y se deja tal cual.)
  if (/^[=+\-@]/.test(texto) && !/^-\d[\d.,]*( ?%)?$/.test(texto)) texto = "'" + texto;
  if (/[";\r\n]/.test(texto)) texto = '"' + texto.replace(/"/g, '""') + '"';
  return texto;
}

// Una fila por cada vino vendido (así en Excel se pueden sumar cantidades);
// las visitas sin venta ocupan una sola fila.
function exportarCSV(datos, visitas) {
  const lista = [...(visitas || datos.visitas)].sort((a, b) => a.fecha.localeCompare(b.fecha) || (a.creadaEl || '').localeCompare(b.creadaEl || ''));
  const filas = [COLUMNAS_CSV];
  for (const v of lista) {
    const dist = porId(datos.distribuidores, v.distribuidorId) || {};
    const com = porId(datos.comerciales, v.comercialId) || {};
    const cli = porId(datos.clientes, v.clienteId) || {};
    const p = v.pendiente;
    const comun = [
      fechaES(v.fecha), dist.nombre, com.nombre, cli.nombre, cli.tipo, cli.poblacion, cli.provincia, cli.zona,
      RESULTADOS[v.resultado],
    ];
    const finales = [
      p ? TIPOS_PENDIENTE[p.tipo] : '', p ? describirLineas(datos, p.lineas) : '', p ? p.detalle : '',
      p ? fechaES(p.fechaPrevista) : '', p ? ESTADOS_PENDIENTE[p.estado] : '', v.nota,
      cli.nuevo || '', cli.altaEl ? fechaES(cli.altaEl) : '', describirLineas(datos, v.muestras || []), v.motivoMuestras || '',
    ];
    const lineas = v.lineas && v.lineas.length ? v.lineas : [null];
    for (const l of lineas) {
      const vino = l ? [nombreVino(datos, l.vinoId), l.anada || '', l.cantidad, l.unidad === 'cajas' ? 'cajas' : 'botellas'] : ['', '', '', ''];
      filas.push([...comun, ...vino, ...finales]);
    }
  }
  return '﻿' + filas.map((f) => f.map(celdaCSV).join(';')).join('\r\n') + '\r\n';
}

// ---------- Ferias y eventos (petición de Luis, 15/11) ----------
// Botellas que Luis saca de la bodega para ferias, showrooms o eventos de la
// D.O. NO son ventas: van aparte para justificar a fin de año dónde se usaron.

const TIPOS_EVENTO = ['Feria', 'Showroom', 'Evento D.O.', 'Cata', 'Otro'];

function eventosEntre(datos, desde, hasta) {
  return (datos.eventos || []).filter((e) => (!desde || e.fecha >= desde) && (!hasta || e.fecha <= hasta))
    .sort((a, b) => b.fecha.localeCompare(a.fecha) || (b.creadoEl || '').localeCompare(a.creadoEl || ''));
}

// Total de botellas y cajas por vino (y añada) de una lista de eventos.
function gastoEventos(datos, eventos) {
  const porVino = new Map();
  let botellas = 0; let cajas = 0;
  for (const e of eventos) {
    for (const l of e.lineas || []) {
      const clave = nombreConAnada(datos, l);
      const x = porVino.get(clave) || { nombre: clave, botellas: 0, cajas: 0 };
      if (l.unidad === 'cajas') { x.cajas += Number(l.cantidad) || 0; cajas += Number(l.cantidad) || 0; }
      else { x.botellas += Number(l.cantidad) || 0; botellas += Number(l.cantidad) || 0; }
      porVino.set(clave, x);
    }
  }
  return { botellas, cajas, porVino: [...porVino.values()].sort((a, b) => a.nombre.localeCompare(b.nombre, 'es')) };
}

// Una fila por vino de cada evento, para sumarlas en Excel.
function exportarEventosCSV(datos, eventos) {
  const filas = [['Fecha', 'Evento', 'Tipo', 'Lugar', 'Vino', 'Añada', 'Cantidad', 'Unidad', 'Nota']];
  for (const e of [...(eventos || eventosEntre(datos))].reverse()) {
    const lineas = e.lineas && e.lineas.length ? e.lineas : [null];
    for (const l of lineas) {
      filas.push([fechaES(e.fecha), e.nombre, e.tipo, e.lugar, l ? nombreVino(datos, l.vinoId) : '', l ? l.anada || '' : '',
        l ? l.cantidad : '', l ? (l.unidad === 'cajas' ? 'cajas' : 'botellas') : '', e.nota]);
    }
  }
  return '\ufeff' + filas.map((f) => f.map(celdaCSV).join(';')).join('\r\n') + '\r\n';
}

// ---------- Reunión bimestral con Dirección ----------
// Los bimestres van por pares de meses: ene-feb, mar-abr… sep-oct, nov-dic.
// Se identifican por el primer mes: '2026-09' es sep-oct 2026.

const MESES_CORTOS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

function bimestreDe(fechaISO) {
  const [a, m] = fechaISO.split('-').map(Number);
  const primero = m % 2 === 1 ? m : m - 1;
  return `${a}-${String(primero).padStart(2, '0')}`;
}

function bimestreMover(periodo, pasos) {
  const [a, m] = periodo.split('-').map(Number);
  const total = a * 12 + (m - 1) + pasos * 2;
  return `${Math.floor(total / 12)}-${String((total % 12) + 1).padStart(2, '0')}`;
}

function bimestreLimites(periodo) {
  const [a, m] = periodo.split('-').map(Number);
  const fin = new Date(Date.UTC(a, m + 1, 0)).getUTCDate();
  return { desde: `${periodo}-01`, hasta: `${a}-${String(m + 1).padStart(2, '0')}-${fin}` };
}

function bimestreNombre(periodo) {
  const [a, m] = periodo.split('-').map(Number);
  return `${MESES_CORTOS[m - 1]}-${MESES_CORTOS[m]} ${a}`;
}

// Fichas que Luis rellena a mano (también lo que le pida a la oficina: la app
// NO trae datos de ningún otro sitio). Los campos van en el MISMO orden que
// las columnas del Excel. 'variacion' no se escribe: se calcula con la venta
// actual y la anterior que haya puesto Luis.
const ESTADOS_ACCION = ['Hecho', 'En curso', 'No hecho'];

// Marcas tal como van en el apartado 6 del Excel. Los Pezium y los licores
// van en «Otra / nuevas» (así lo pone la propia hoja).
const MARCAS = ['La Ola', 'Envidiacochina', 'Flor de Carme', 'Amodiño', 'Flor de Carme Millésime', 'Vilaxoán', 'La Coartada', 'Otra / nuevas'];
function marcaDeVino(nombre) {
  const n = normalizar(nombre);
  if (n.includes('pezium')) return 'Otra / nuevas';
  if (n.startsWith('flor de carme millesime')) return 'Flor de Carme Millésime';
  const marca = MARCAS.find((m) => n.startsWith(normalizar(m)));
  return marca || 'Otra / nuevas';
}

// Las 12 filas del cuadro de mando (apartado 1).
const INDICADORES = [
  'Ventas acumuladas (€)', 'Evolución ventas (%)', 'Distribuidores activos', 'Pedidos / reposiciones', 'Nuevos puntos de venta',
  'Clientes que crecen', 'Clientes que disminuyen', 'Clientes que dejan de comprar', 'Oportunidades abiertas',
  'Nuevos distribuidores potenciales', 'Importadores contactados', 'Muestras utilizadas / enviadas',
];
const PRIORIDADES = ['1', '2', '3', '4', '5'];
const FICHAS_REUNION = {
  cuadro: {
    titulo: '1. Cuadro de mando: previsión y acción por indicador', una: 'indicador', genero: 'm', principal: 'indicador',
    campos: [
      ['indicador', 'Indicador', INDICADORES], ['actual', 'Actual (si no, lo cuenta la app)'], ['anterior', 'Informe anterior'],
      ['objetivo', 'Objetivo'], ['avance', 'Variación / avance (si lo dejas vacío, lo calcula la app)'], ['prevision', 'Previsión'], ['gap', 'Gap al objetivo'], ['estado', 'Estado'],
      ['explica', 'Qué explica el dato', 'largo'], ['accion', 'Acción comercial'], ['responsable', 'Responsable', 'responsable'],
      ['plazo', 'Plazo', 'fecha'],
    ],
  },
  clientes: {
    titulo: '3. Clientes: crecimiento, disminución y pérdida', una: 'cliente', genero: 'm', principal: 'cliente',
    campos: [
      ['cliente', 'Cliente / PDV'], ['distribuidor', 'Distribuidor'], ['marca', 'Marca principal', MARCAS],
      ['ventaActual', 'Venta actual €', 'numero'], ['ventaAnterior', 'Venta anterior €', 'numero'], ['variacion', 'Variación % (si lo dejas vacío, lo calcula la app)', 'variacion'],
      ['situacion', 'Situación', ['Crece', 'Disminuye', 'Deja de comprar', 'Nuevo']], ['causa', 'Causa', 'largo'],
      ['potencial', 'Potencial'], ['accion', 'Acción'], ['responsable', 'Responsable', 'responsable'], ['plazo', 'Plazo', 'fecha'],
    ],
  },
  marcas: {
    titulo: '6. Evolución de cada marca y previsión de ventas', una: 'marca', genero: 'f', principal: 'marca',
    campos: [
      ['marca', 'Marca', MARCAS], ['ventaActual', 'Venta actual €', 'numero'], ['ventaAnterior', 'Venta anterior €', 'numero'],
      ['objetivo', 'Objetivo €', 'numero'], ['gap', 'Gap €', 'numero'], ['previsionBimestre', 'Previsión próximo bimestre €', 'numero'],
      ['previsionAno', 'Previsión cierre año €', 'numero'], ['activos', 'Distribuidores activos (si lo dejas vacío, lo calcula la app)'], ['lectura', 'Lectura comercial', 'largo'],
      ['accion', 'Acción prioritaria'], ['responsable', 'Responsable', 'responsable'],
    ],
  },
  distribuidores: {
    titulo: '2. Distribuidores: ventas y pedidos', una: 'distribuidor', genero: 'm', principal: 'distribuidor',
    campos: [
      ['distribuidor', 'Distribuidor', 'distribuidor'], ['ventaActual', 'Venta actual €', 'numero'], ['ventaAnterior', 'Venta anterior €', 'numero'],
      ['variacion', 'Variación % (si lo dejas vacío, lo calcula la app)', 'variacion'], ['pedidos', 'Pedidos', 'numero'], ['reposiciones', 'Reposiciones', 'numero'],
      ['ultimoPedido', 'Último pedido', 'fecha'], ['nuevosPdv', 'Nuevos PDV (si lo dejas vacío, lo calcula la app)'], ['estado', 'Estado (si lo dejas vacío, lo calcula la app)'],
      ['proximaAccion', 'Próxima acción (si lo dejas vacío, lo calcula la app)'], ['responsable', 'Responsable', 'responsable'],
    ],
  },
  oportunidades: {
    titulo: '4. Otras oportunidades, distribuidores potenciales e importadores', una: 'oportunidad', genero: 'f', principal: 'empresa',
    nota: 'Los pendientes de las visitas y los distribuidores marcados como potenciales o importadores ya salen solos. Aquí, lo demás.',
    campos: [
      ['empresa', 'Empresa / contacto'], ['zona', 'País / zona'], ['tipo', 'Tipo'], ['importe', 'Oportunidad €', 'numero'],
      ['probabilidad', 'Probabilidad %', 'numero'], ['ponderada', 'Previsión ponderada € (si lo dejas vacío, lo calcula la app)', 'ponderada'], ['fase', 'Fase'],
      ['ultimoContacto', 'Último contacto', 'fecha'], ['proximaAccion', 'Próxima acción'], ['fechaProxima', 'Fecha próxima', 'fecha'],
      ['responsable', 'Responsable', 'responsable'], ['observaciones', 'Observaciones', 'largo'],
    ],
  },
  muestras: {
    titulo: '5. Otras muestras (envíos, ferias, D.O.…)', una: 'muestra', genero: 'f', principal: 'destinatario',
    nota: 'Las muestras que dejas en las visitas ya salen solas. Aquí, las que no van en una visita.',
    campos: [
      ['destinatario', 'Destinatario'], ['mercado', 'Mercado'], ['marca', 'Marca / añada'], ['unidades', 'Unidades', 'numero'],
      ['fecha', 'Fecha envío/entrega', 'fecha'], ['motivo', 'Motivo'], ['seguimiento', 'Seguimiento realizado', 'largo'],
      ['resultado', 'Resultado'], ['potencial', 'Potencial €', 'numero'], ['proximoPaso', 'Próximo paso'], ['fechaPaso', 'Fecha', 'fecha'],
      ['responsable', 'Responsable', 'responsable'],
    ],
  },
  acciones: {
    titulo: '7. Acciones realizadas desde la reunión anterior y resultado', una: 'acción realizada', genero: 'f', principal: 'accion',
    campos: [
      ['accion', 'Acción acordada'], ['objetivo', 'Objetivo'], ['fecha', 'Fecha compromiso', 'fecha'],
      ['responsable', 'Responsable', 'responsable'], ['estado', 'Estado', ESTADOS_ACCION], ['hecho', 'Qué se hizo', 'largo'],
      ['resultado', 'Resultado medible'], ['ventas', 'Ventas generadas €', 'numero'], ['aprendizaje', 'Aprendizaje', 'largo'],
      ['decision', 'Continuar / corregir / parar', ['Continuar', 'Corregir', 'Parar']], ['nueva', 'Nueva acción'],
      ['observaciones', 'Observaciones', 'largo'],
    ],
  },
  compromisos: {
    titulo: '8. Acciones concretas comprometidas hasta la siguiente reunión', una: 'compromiso', genero: 'm', principal: 'accion',
    campos: [
      ['prioridad', 'Prioridad', PRIORIDADES], ['accion', 'Acción concreta'], ['objetivo', 'Objetivo medible'],
      ['marca', 'Marca / mercado'], ['cliente', 'Cliente / distribuidor'], ['responsable', 'Responsable', 'responsable'],
      ['fecha', 'Fecha límite', 'fecha'], ['indicador', 'Indicador de éxito'], ['recursos', 'Recursos necesarios'],
      ['dependencias', 'Dependencias'], ['estado', 'Estado', ['Pendiente', 'En curso', 'Hecho']],
      ['resultadoProxima', 'Resultado próxima reunión'],
    ],
  },
  alertas: {
    titulo: '9. Alertas que requieren decisión de Dirección', una: 'alerta', genero: 'f', principal: 'alerta',
    campos: [
      ['prioridad', 'Prioridad', PRIORIDADES], ['alerta', 'Alerta / oportunidad', 'largo'], ['impacto', 'Impacto esperado'],
      ['marca', 'Marca / mercado'], ['cliente', 'Cliente / distribuidor'], ['alternativas', 'Alternativas', 'largo'],
      ['recomendacion', 'Recomendación Comercial', 'largo'], ['decisionSolicitada', 'Decisión solicitada', 'largo'],
      ['decisionTomada', 'Decisión tomada'], ['responsable', 'Responsable', 'responsable'],
      ['fecha', 'Fecha límite', 'fecha'], ['seguimiento', 'Seguimiento', 'largo'],
    ],
  },
};
const RESPONSABLE = 'Luis Lado';

function reunionVacia(periodo) {
  return { id: periodo, periodo, mensaje: '', conclusion: '', previsionAno: '', responsable: '', fechaReunion: '', objetivoBimestre: '', objetivoAcumulado: '', distribuidores: [], prioridades: ['', '', ''], cuadro: [], clientes: [], oportunidades: [], muestras: [], marcas: [], acciones: [], compromisos: [], alertas: [] };
}

function reunionDe(datos, periodo) {
  return (datos.reuniones || []).find((r) => r.periodo === periodo) || null;
}

// Último día con visita o salida de agenda (hasta 'hoy') y la próxima salida.
function contactosDistribuidor(datos, distribuidorId, hoy) {
  const d = porId(datos.distribuidores, distribuidorId) || {};
  const fechas = [
    ...(d.ultimoContacto ? [d.ultimoContacto] : []),
    ...datos.visitas.filter((v) => v.distribuidorId === distribuidorId).map((v) => v.fecha),
    ...datos.agenda.filter((s) => s.distribuidorId === distribuidorId && s.fecha && s.fecha <= hoy).map((s) => s.fecha),
  ].sort();
  const proxima = datos.agenda.filter((s) => s.distribuidorId === distribuidorId && s.fecha && s.fecha > hoy).map((s) => s.fecha).sort()[0] || '';
  return { ultimo: fechas[fechas.length - 1] || '', proxima };
}

// Lo que la app sabe sacar sola para la reunión de un bimestre.
function resumenReunion(datos, periodo, hoy) {
  const { desde, hasta } = bimestreLimites(periodo);
  const visitas = datos.visitas.filter((v) => v.fecha >= desde && v.fecha <= hasta).sort((a, b) => a.fecha.localeCompare(b.fecha));
  const clientesNuevos = datos.clientes.filter((c) => c.nuevo === 'Sí' && c.altaEl >= desde && c.altaEl <= hasta);
  const conMuestras = visitas.filter((v) => v.muestras && v.muestras.length);
  const abiertas = pendientesAbiertas(datos);
  const distribuidores = datos.distribuidores.filter((d) => d.estado || visitas.some((v) => v.distribuidorId === d.id));
  const potenciales = datos.distribuidores.filter((d) => d.estado === 'Potencial' || d.tipo === 'Importador');
  const nuevosPotenciales = datos.distribuidores.filter((d) => d.estado === 'Potencial' && d.tipo !== 'Importador');
  const enPeriodo = (f) => f && f >= desde && f <= hasta;
  const importadoresContactados = datos.distribuidores.filter((d) => d.tipo === 'Importador' &&
    (enPeriodo(d.ultimoContacto) || visitas.some((v) => v.distribuidorId === d.id) ||
     datos.agenda.some((s) => s.distribuidorId === d.id && enPeriodo(s.fecha) && s.fecha <= hoy)));
  const unidadesMuestras = conMuestras.reduce((t, v) => t + v.muestras.reduce((u, l) => u + (Number(l.cantidad) || 0), 0), 0);
  // Ferias y eventos del bimestre: cuentan como muestras utilizadas (no como venta).
  const eventos = eventosEntre(datos, desde, hasta);
  const lineasMuestras = [...conMuestras.flatMap((v) => v.muestras), ...eventos.flatMap((e) => e.lineas || [])];
  const hayCajas = lineasMuestras.some((l) => l.unidad === 'cajas' && Number(l.cantidad));
  const muestrasTotal = hayCajas ? unidades(lineasMuestras) : lineasMuestras.reduce((t, l) => t + (Number(l.cantidad) || 0), 0);
  // Distribuidores que han vendido cada marca en el bimestre (según las visitas).
  const activosPorMarca = {};
  for (const m of MARCAS) activosPorMarca[m] = new Set();
  for (const v of visitas) for (const l of v.lineas || []) activosPorMarca[marcaDeVino(nombreVino(datos, l.vinoId))].add(v.distribuidorId);
  for (const m of MARCAS) activosPorMarca[m] = activosPorMarca[m].size;
  return { desde, hasta, visitas, clientesNuevos, conMuestras, abiertas, distribuidores, potenciales, nuevosPotenciales,
    importadoresContactados, unidadesMuestras, eventos, muestrasTotal, activosPorMarca, totales: totales(datos, visitas) };
}

// Números para el Excel en español: coma decimal. Vacío si no hay número.
function numeroES(x) {
  if (x === null || x === undefined || x === '') return '';
  const n = typeof x === 'number' ? x : parseFloat(String(x).replace(',', '.'));
  return Number.isFinite(n) ? String(Math.round(n * 100) / 100).replace('.', ',') : String(x);
}

// Variación % entre dos cifras que haya puesto Luis. Vacío si falta alguna.
function variacion(actual, anterior) {
  const a = parseFloat(String(actual || '').replace(',', '.'));
  const b = parseFloat(String(anterior || '').replace(',', '.'));
  if (!Number.isFinite(a) || !Number.isFinite(b) || !b) return '';
  return numeroES(Math.round(((a - b) / b) * 1000) / 10) + ' %';
}

function unidades(lineas) {
  const b = lineas.filter((l) => l.unidad !== 'cajas').reduce((t, l) => t + (Number(l.cantidad) || 0), 0);
  const c = lineas.filter((l) => l.unidad === 'cajas').reduce((t, l) => t + (Number(l.cantidad) || 0), 0);
  return [b && `${b} bot.`, c && `${c} ${c === 1 ? 'caja' : 'cajas'}`].filter(Boolean).join(' + ');
}

// Un CSV con un bloque por apartado del Excel (hoja «Comercial»), con sus
// mismas columnas. Las columnas que salen de la oficina (ventas, facturas…)
// van vacías.
function exportarReunion(datos, periodo, hoy) {
  const r = reunionDe(datos, periodo) || reunionVacia(periodo);
  const z = resumenReunion(datos, periodo, hoy);
  const nombreDist = (id) => (porId(datos.distribuidores, id) || {}).nombre || '';
  const cliente = (id) => porId(datos.clientes, id) || {};
  const filas = [];
  const bloque = (titulo, cabecera, cuerpo) => { filas.push([titulo], cabecera, ...cuerpo, []); };

  const valorFicha = (fila, clave, clase) => {
    if (clase === 'variacion') return fila[clave] || variacion(fila.ventaActual, fila.ventaAnterior);
    if (clase === 'ponderada') {
      const i = parseFloat(String(fila.importe || '').replace(',', '.')); const p = parseFloat(String(fila.probabilidad || '').replace(',', '.'));
      return fila[clave] || (i && p ? numeroES(Math.round(i * p) / 100) : '');
    }
    if (clase === 'fecha') return fila[clave] ? fechaES(fila[clave]) : '';
    if (clase === 'numero') return numeroES(fila[clave]);
    return fila[clave] || '';
  };
  const filasFicha = (tipo) => (r[tipo] || []).map((fila) => FICHAS_REUNION[tipo].campos.map(([clave, , clase]) => valorFicha(fila, clave, clase)));
  const fichaGenerica = (tipo) => {
    const ficha = FICHAS_REUNION[tipo];
    bloque(ficha.titulo, ficha.campos.map((c) => c[1].replace(' (si lo dejas vacío, lo calcula la app)', '')), filasFicha(tipo));
  };

  filas.push([`Informe bimestral · Comercial · ${bimestreNombre(periodo)}`], []);
  bloque('Cabecera', ['Periodo', 'Fecha reunión', 'Responsable', 'Objetivo bimestre €', 'Objetivo acumulado €', 'Previsión cierre año €'],
    [[bimestreNombre(periodo), r.fechaReunion ? fechaES(r.fechaReunion) : '', r.responsable || RESPONSABLE, numeroES(r.objetivoBimestre), numeroES(r.objetivoAcumulado), numeroES(r.previsionAno)]]);
  bloque('Mensaje principal del bimestre', ['Mensaje principal del bimestre'], [[r.mensaje]]);
  const t = z.totales;
  bloque('Datos de la app de visitas', ['Visitas', 'Con venta', 'Pendientes', 'Sin interés', 'Vendido', 'Nuevos puntos de venta', 'Oportunidades abiertas',
    'Nuevos distribuidores potenciales', 'Importadores contactados', 'Muestras (visitas)', 'Muestras (unidades)', 'Ferias y eventos', 'Muestras + eventos (total)'],
    [[t.visitas, t.vendido || 0, t.pendiente || 0, t.sin_interes || 0, `${t.botellas} bot. + ${t.cajas} cajas`, z.clientesNuevos.length, z.abiertas.length,
      z.nuevosPotenciales.length, z.importadoresContactados.length, z.conMuestras.length, z.unidadesMuestras, z.eventos.length, z.muestrasTotal]]);

  // 1. Cuadro de mando: lo que la app cuenta sola + lo que apunte Luis.
  const actuales = {
    'Nuevos puntos de venta': z.clientesNuevos.length, 'Oportunidades abiertas': z.abiertas.length,
    'Nuevos distribuidores potenciales': z.nuevosPotenciales.length, 'Importadores contactados': z.importadoresContactados.length,
    'Muestras utilizadas / enviadas': z.muestrasTotal,
  };
  bloque('1. Cuadro de mando Comercial',
    ['Indicador', 'Actual', 'Informe anterior', 'Objetivo', 'Variación / avance', 'Previsión', 'Gap al objetivo', 'Estado', 'Qué explica el dato', 'Acción comercial', 'Responsable', 'Plazo'],
    INDICADORES.map((ind) => {
      const f = (r.cuadro || []).find((x) => x.indicador === ind) || {};
      const actual = f.actual || (actuales[ind] !== undefined ? actuales[ind] : '');
      return [ind, actual, f.anterior || '', f.objetivo || '', f.avance || variacion(f.actual, f.anterior), f.prevision || '', f.gap || '', f.estado || '', f.explica || '', f.accion || '',
        f.responsable || '', f.plazo ? fechaES(f.plazo) : ''];
    }));

  bloque('2. Evolución de distribuidores, pedidos y reposiciones',
    ['Distribuidor', 'Zona', 'Venta actual €', 'Venta anterior €', 'Variación %', 'Pedidos', 'Reposiciones', 'Último pedido', 'Nuevos PDV', 'Estado', 'Próxima acción', 'Responsable'],
    [...z.distribuidores, ...datos.distribuidores.filter((d) => !z.distribuidores.includes(d) &&
      (r.distribuidores || []).some((f) => normalizar(f.distribuidor) === normalizar(d.nombre)))].map((d) => {
      const f = (r.distribuidores || []).find((x) => normalizar(x.distribuidor) === normalizar(d.nombre)) || {};
      const vs = z.visitas.filter((v) => v.distribuidorId === d.id);
      const pdv = z.clientesNuevos.filter((c) => datos.visitas.some((v) => v.clienteId === c.id && v.distribuidorId === d.id)).length;
      const k = contactosDistribuidor(datos, d.id, hoy);
      const estado = [d.estado, vs.length && `${vs.length} visitas (últ. ${fechaES(vs[vs.length - 1].fecha).slice(0, 5)})`].filter(Boolean).join(' · ');
      const pend = z.abiertas.filter((v) => v.distribuidorId === d.id);
      const proxima = d.proximaAccion ? [d.proximaAccion, d.fechaProxima && fechaES(d.fechaProxima)].filter(Boolean).join(' · ')
        : k.proxima ? `Salida ${fechaES(k.proxima)}`
        : pend.length ? `Cerrar ${pend.length} ${pend.length === 1 ? 'pendiente' : 'pendientes'} (desde ${fechaES(pend[0].pendiente.fechaPrevista)})` : '';
      return [d.nombre, [d.provincia, d.zona].filter(Boolean).join(' / ') || d.pais || '', numeroES(f.ventaActual), numeroES(f.ventaAnterior),
        f.variacion || variacion(f.ventaActual, f.ventaAnterior), numeroES(f.pedidos), numeroES(f.reposiciones), f.ultimoPedido ? fechaES(f.ultimoPedido) : '',
        f.nuevosPdv || pdv || '', f.estado || estado, f.proximaAccion || proxima, f.responsable || RESPONSABLE];
    }));

  fichaGenerica('clientes');

  bloque('Puntos de venta nuevos (lista de la app)', ['Cliente / PDV', 'Distribuidor', 'Población', 'Provincia', 'Fecha de alta'],
    z.clientesNuevos.map((c) => {
      const v = datos.visitas.find((x) => x.clienteId === c.id);
      return [c.nombre, v ? nombreDist(v.distribuidorId) : '', c.poblacion, c.provincia, fechaES(c.altaEl)];
    }));

  bloque('4. Oportunidades, distribuidores potenciales e importadores',
    ['Empresa / contacto', 'País / zona', 'Tipo', 'Oportunidad €', 'Probabilidad %', 'Previsión ponderada €', 'Fase', 'Último contacto', 'Próxima acción', 'Fecha próxima', 'Responsable', 'Observaciones'], [
      ...z.abiertas.map((v) => {
        const c = cliente(v.clienteId); const p = v.pendiente;
        const importe = Number(p.importe) || 0; const prob = Number(p.probabilidad) || 0;
        return [`${c.nombre || ''} (${nombreDist(v.distribuidorId)})`, [c.poblacion, c.provincia].filter(Boolean).join(', '), TIPOS_PENDIENTE[p.tipo],
          numeroES(importe || ''), prob || '', importe && prob ? numeroES(Math.round(importe * prob) / 100) : '', 'Pendiente', fechaES(v.fecha),
          p.detalle || 'Cerrar pedido', fechaES(p.fechaPrevista), RESPONSABLE, describirLineas(datos, p.lineas)];
      }),
      ...z.potenciales.map((d) => {
        const k = contactosDistribuidor(datos, d.id, hoy);
        const importe = Number(d.importe) || 0; const prob = Number(d.probabilidad) || 0;
        const fechaProxima = d.fechaProxima || k.proxima;
        return [[d.nombre, d.contactos].filter(Boolean).join(' · '), d.pais || [d.provincia, d.zona].filter(Boolean).join(' / '),
          d.tipo === 'Importador' ? 'Importador' : 'Distribuidor potencial', numeroES(importe || ''), prob || '', importe && prob ? numeroES(Math.round(importe * prob) / 100) : '',
          d.estado || '', k.ultimo ? fechaES(k.ultimo) : '', d.proximaAccion || (k.proxima ? 'Salida' : ''), fechaProxima ? fechaES(fechaProxima) : '',
          RESPONSABLE, d.observaciones || ''];
      }),
      ...filasFicha('oportunidades'),
    ]);

  bloque('5. Muestras utilizadas y seguimiento',
    ['Destinatario', 'Mercado', 'Marca / añada', 'Unidades', 'Fecha envío/entrega', 'Motivo', 'Seguimiento realizado', 'Resultado', 'Potencial €', 'Próximo paso', 'Fecha', 'Responsable'],
    z.conMuestras.map((v) => {
      const c = cliente(v.clienteId);
      return [`${c.nombre || ''} (${nombreDist(v.distribuidorId)})`, c.provincia || '', v.muestras.map((l) => nombreConAnada(datos, l)).join(', '),
        unidades(v.muestras), fechaES(v.fecha), v.motivoMuestras || '', ...(() => {
          const g = v.segMuestras || {};
          return [g.seguimiento || '', g.resultado || '', numeroES(g.potencial), g.proximoPaso || '', g.fecha ? fechaES(g.fecha) : ''];
        })(), RESPONSABLE];
    }).concat([...z.eventos].reverse().map((e) => [`${e.nombre} (${(e.tipo || 'evento').toLowerCase()})`, e.lugar || '',
      (e.lineas || []).map((l) => nombreConAnada(datos, l)).join(', '), unidades(e.lineas || []), fechaES(e.fecha),
      [e.tipo, e.nota].filter(Boolean).join(' · '), '', '', '', '', '', RESPONSABLE]), filasFicha('muestras')));

  bloque('6. Evolución de cada marca y previsión de ventas',
    ['Marca', 'Venta actual €', 'Venta anterior €', 'Variación %', 'Objetivo €', 'Gap €', 'Previsión próximo bimestre €', 'Previsión cierre año €',
      'Distribuidores activos', 'Lectura comercial', 'Acción prioritaria', 'Responsable'],
    MARCAS.map((m) => {
      const f = (r.marcas || []).find((x) => x.marca === m) || {};
      return [m, numeroES(f.ventaActual), numeroES(f.ventaAnterior), f.variacion || variacion(f.ventaActual, f.ventaAnterior), numeroES(f.objetivo), numeroES(f.gap),
        numeroES(f.previsionBimestre), numeroES(f.previsionAno), f.activos || z.activosPorMarca[m] || '', f.lectura || '', f.accion || '', f.responsable || ''];
    }));

  for (const tipo of ['acciones', 'compromisos', 'alertas']) fichaGenerica(tipo);


  bloque('Cierre Comercial', ['Conclusión del bimestre'], [[r.conclusion]]);
  bloque('3 prioridades hasta la siguiente reunión', ['Prioridad', 'Qué'], (r.prioridades || []).map((x, i) => [i + 1, x]).filter((x) => x[1]));
  return '﻿' + filas.map((f) => f.map(celdaCSV).join(';')).join('\r\n') + '\r\n';
}

// ---------- Copia de seguridad (JSON) ----------

function crearCopia(datos) {
  return JSON.stringify({ app: 'luis-visitas', version: VERSION_DATOS, exportadoEl: new Date().toISOString(), datos }, null, 1);
}

// Comprueba un fichero de copia y devuelve los datos listos para usar.
// Lanza un Error con un mensaje entendible si el fichero no vale.
function leerCopia(texto) {
  let obj;
  try {
    obj = JSON.parse(String(texto).replace(/^﻿/, ''));
  } catch (e) {
    throw new Error('El fichero no es una copia válida (no se puede leer).');
  }
  if (!obj || obj.app !== 'luis-visitas' || !obj.datos) {
    throw new Error('El fichero no es una copia de esta app.');
  }
  if (obj.version > VERSION_DATOS) {
    throw new Error('La copia es de una versión más nueva de la app. Actualiza la app primero.');
  }
  const d = obj.datos;
  d.agenda = Array.isArray(d.agenda) ? d.agenda : []; // las copias antiguas no tienen agenda
  const listas = ['vinos', 'distribuidores', 'comerciales', 'clientes', 'visitas', 'agenda'];
  for (const nombre of listas) {
    if (!Array.isArray(d[nombre])) throw new Error(`A la copia le falta la lista de ${nombre}.`);
    for (const item of d[nombre]) {
      if (!item || typeof item.id !== 'string') throw new Error(`Hay un elemento sin identificador en ${nombre}.`);
    }
  }
  for (const v of d.visitas) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(v.fecha || '') || !RESULTADOS[v.resultado]) {
      throw new Error('Hay una visita con la fecha o el resultado mal.');
    }
    v.lineas = Array.isArray(v.lineas) ? v.lineas : [];
    v.pendiente = v.pendiente || null;
    if (v.pendiente) v.pendiente.lineas = Array.isArray(v.pendiente.lineas) ? v.pendiente.lineas : [];
    if (v.muestras !== undefined && !Array.isArray(v.muestras)) v.muestras = [];
  }
  return {
    version: VERSION_DATOS,
    vinos: d.vinos,
    distribuidores: d.distribuidores,
    comerciales: d.comerciales,
    clientes: d.clientes,
    visitas: d.visitas,
    agenda: d.agenda,
    reuniones: Array.isArray(d.reuniones) ? d.reuniones : [], // las copias antiguas no tienen reuniones
    eventos: Array.isArray(d.eventos) ? d.eventos : [], // ni ferias y eventos
    ajustes: Object.assign({ salida: null, ultimaCopia: null }, d.ajustes),
  };
}

// ---------- Agenda de salidas ----------
// Cada salida: { id, fecha ('AAAA-MM-DD' o '' si aún no tiene fecha),
//   distribuidorId, comercialId, lugar, nota }

function ordenAgenda(a, b) {
  return a.fecha.localeCompare(b.fecha) || (a.lugar || '').localeCompare(b.lugar || '', 'es');
}

function agendaDelDia(datos, dia) {
  return datos.agenda.filter((s) => s.fecha === dia).sort(ordenAgenda);
}

function agendaProxima(datos, hoy) {
  return datos.agenda.filter((s) => s.fecha && s.fecha >= hoy).sort(ordenAgenda);
}

function agendaPasada(datos, hoy) {
  return datos.agenda.filter((s) => s.fecha && s.fecha < hoy).sort(ordenAgenda).reverse();
}

// ---------- Añadidos que manda el jefe (sin borrar nada) ----------
// Un «paquete» es { app: 'luis-visitas-anadidos', id, distribuidores: [...], borrarVisitas: [ids],
// vinos: [nombres], cambiarVisitas: [{ id, fecha?, cantidades?: [{ vinoId, cantidad }] }],
// cambiarLineas: [{ id, quitar: [vinoIds], anadir: [{ vino: nombre, cantidad, unidad, anada }] }],
// cambiarClientes: [{ id, nombre }], cambiarDistribuidores: [{ id, nombre }],
// comerciales: [{ distribuidor: nombre, provincia?, nombre }], borrarSalidas: [ids],
// agenda: [{ fecha, distribuidor?: nombre, provincia?, comercial?: nombre, lugar, nota }] }
// (cualquiera de las listas puede faltar). En la agenda y en los comerciales el
// distribuidor va por su nombre: si no existe, se crea.
// Cada distribuidor: { nombre, otrosNombres, enAppComo, provincia, zona, pais, contactos }.
// Si ya existe (por nombre, por enAppComo o por otrosNombres) solo se rellenan
// los huecos y se añaden los contactos que falten; si no, se crea.

function esPaquete(obj) {
  return !!obj && obj.app === 'luis-visitas-anadidos' && typeof obj.id === 'string' &&
    (Array.isArray(obj.distribuidores) || Array.isArray(obj.borrarVisitas) || Array.isArray(obj.vinos) || Array.isArray(obj.cambiarVisitas) || Array.isArray(obj.cambiarLineas) || Array.isArray(obj.cambiarClientes) ||
    Array.isArray(obj.cambiarDistribuidores) || Array.isArray(obj.comerciales) || Array.isArray(obj.borrarSalidas) || Array.isArray(obj.agenda));
}

function aplicarPaquete(datos, paquete) {
  const aplicados = datos.ajustes.paquetesAplicados || [];
  if (aplicados.includes(paquete.id)) return null;
  const resultado = { nuevos: 0, actualizados: 0, borradas: 0, vinos: 0, cambiadas: 0, clientes: 0, renombrados: 0, comerciales: 0, salidas: 0 };
  // Correcciones que pide Luis (fecha o cantidades de una visita ya apuntada).
  for (const cambio of paquete.cambiarVisitas || []) {
    const v = porId(datos.visitas, cambio.id);
    if (!v) continue;
    if (/^\d{4}-\d{2}-\d{2}$/.test(cambio.fecha || '')) v.fecha = cambio.fecha;
    for (const c of cambio.cantidades || []) {
      const linea = v.lineas.find((l) => l.vinoId === c.vinoId);
      if (linea && Number(c.cantidad) > 0) linea.cantidad = Number(c.cantidad);
    }
    resultado.cambiadas++;
  }
  // Vinos nuevos para la lista (si ya está con ese nombre, no se repite).
  for (const nombre of paquete.vinos || []) {
    if (!datos.vinos.some((v) => normalizar(v.nombre) === normalizar(nombre))) {
      datos.vinos.push({ id: nuevoId(), nombre, activo: true });
      resultado.vinos++;
    }
  }
  // Visitas que el jefe quita (p. ej. apuntadas dos veces por error).
  for (const id of paquete.borrarVisitas || []) {
    if (porId(datos.visitas, id)) { borrarVisita(datos, id); resultado.borradas++; }
  }
  // Cambiar unos vinos por otros en una visita. El vino nuevo va por su nombre
  // (los ids de los vinos los pone cada móvil); si no está en la lista, se crea.
  for (const cambio of paquete.cambiarLineas || []) {
    const v = porId(datos.visitas, cambio.id);
    if (!v) continue;
    v.lineas = v.lineas.filter((l) => !(cambio.quitar || []).includes(l.vinoId));
    for (const nueva of cambio.anadir || []) {
      let vino = datos.vinos.find((x) => normalizar(x.nombre) === normalizar(nueva.vino));
      if (!vino) {
        vino = { id: nuevoId(), nombre: nueva.vino, activo: true };
        datos.vinos.push(vino);
        resultado.vinos++;
      }
      v.lineas.push({ vinoId: vino.id, anada: nueva.anada || '', cantidad: Number(nueva.cantidad) || 1, unidad: nueva.unidad === 'cajas' ? 'cajas' : 'botellas' });
    }
    resultado.cambiadas++;
  }
  // Nombres de clientes mal escritos (p. ej. por el corrector del teléfono).
  for (const cambio of paquete.cambiarClientes || []) {
    const c = porId(datos.clientes, cambio.id);
    if (!c || !String(cambio.nombre || '').trim()) continue;
    c.nombre = String(cambio.nombre).trim();
    resultado.clientes++;
  }
  for (const nuevo of paquete.distribuidores || []) {
    const nombres = [nuevo.nombre, nuevo.enAppComo, ...String(nuevo.otrosNombres || '').split('/')]
      .map(normalizar).filter(Boolean);
    let d = datos.distribuidores.find((x) => nombres.includes(normalizar(x.nombre)));
    if (!d) {
      d = { id: nuevoId(), nombre: nuevo.nombre, provincia: '', zona: '' };
      datos.distribuidores.push(d);
      resultado.nuevos++;
    } else {
      resultado.actualizados++;
    }
    for (const campo of ['provincia', 'zona', 'pais']) {
      if (!d[campo] && nuevo[campo]) d[campo] = nuevo[campo];
    }
    const contactos = String(d.contactos || '').split(';').map((c) => c.trim()).filter(Boolean);
    for (const c of String(nuevo.contactos || '').split(';').map((x) => x.trim()).filter(Boolean)) {
      if (!contactos.some((y) => normalizar(y) === normalizar(c))) contactos.push(c);
    }
    if (contactos.length) d.contactos = contactos.join('; ');
  }
  // Distribuidores que cambian de nombre (p. ej. otra persona al frente).
  for (const cambio of paquete.cambiarDistribuidores || []) {
    const d = porId(datos.distribuidores, cambio.id);
    if (!d || !String(cambio.nombre || '').trim()) continue;
    d.nombre = String(cambio.nombre).trim();
    resultado.renombrados++;
  }
  const distribuidorPorNombre = (nombre, provincia) => {
    let d = datos.distribuidores.find((x) => normalizar(x.nombre) === normalizar(nombre));
    if (!d) {
      d = { id: nuevoId(), nombre: String(nombre).trim(), provincia: provincia || '', zona: '' };
      datos.distribuidores.push(d);
      resultado.nuevos++;
    }
    if (!d.provincia && provincia) d.provincia = provincia;
    return d;
  };
  const comercialPorNombre = (d, nombre) => {
    let c = datos.comerciales.find((x) => x.distribuidorId === d.id && normalizar(x.nombre) === normalizar(nombre));
    if (!c) {
      c = { id: nuevoId(), distribuidorId: d.id, nombre: String(nombre).trim(), telefono: '' };
      datos.comerciales.push(c);
      resultado.comerciales++;
    }
    return c;
  };
  for (const nuevo of paquete.comerciales || []) {
    if (nuevo.distribuidor && nuevo.nombre) comercialPorNombre(distribuidorPorNombre(nuevo.distribuidor, nuevo.provincia), nuevo.nombre);
  }
  // Salidas de la agenda: se quitan las que ya no valen y se añaden las nuevas
  // (si ya hay una ese día con ese distribuidor, no se repite).
  for (const id of paquete.borrarSalidas || []) {
    if (porId(datos.agenda, id)) { datos.agenda = datos.agenda.filter((x) => x.id !== id); resultado.salidas++; }
  }
  for (const nueva of paquete.agenda || []) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(nueva.fecha || '')) continue;
    const d = nueva.distribuidor ? distribuidorPorNombre(nueva.distribuidor, nueva.provincia) : null;
    const distribuidorId = d ? d.id : '';
    if (datos.agenda.some((x) => x.fecha === nueva.fecha && x.distribuidorId === distribuidorId && (distribuidorId || x.nota === (nueva.nota || '')))) continue;
    datos.agenda.push({
      id: nuevoId(), fecha: nueva.fecha, distribuidorId,
      comercialId: d && nueva.comercial ? comercialPorNombre(d, nueva.comercial).id : '',
      lugar: nueva.lugar || '', nota: nueva.nota || '',
    });
    resultado.salidas++;
  }
  datos.ajustes.paquetesAplicados = [...aplicados, paquete.id];
  return resultado;
}

// ---------- Datos de ejemplo ----------

function hayEjemplo(datos) {
  return ['distribuidores', 'comerciales', 'clientes', 'visitas'].some((l) => datos[l].some((x) => x.ejemplo));
}

function cargarEjemplo(datos, hoy) {
  const vino = (nombre) => (datos.vinos.find((v) => v.nombre === nombre) || datos.vinos[0]).id;
  const dist = (nombre, provincia, zona) => {
    const d = { id: nuevoId(), nombre: `${nombre} (EJEMPLO)`, provincia, zona, ejemplo: true };
    datos.distribuidores.push(d);
    return d.id;
  };
  const com = (distribuidorId, nombre, telefono) => {
    const c = { id: nuevoId(), distribuidorId, nombre: `${nombre} (EJEMPLO)`, telefono: telefono || '', ejemplo: true };
    datos.comerciales.push(c);
    return c.id;
  };
  const cli = (nombre, tipo, poblacion, provincia, zona) => {
    const c = { id: nuevoId(), nombre: `${nombre} (EJEMPLO)`, tipo, poblacion, provincia, zona, contacto: '', ejemplo: true };
    datos.clientes.push(c);
    return c.id;
  };
  const vis = (diasAtras, distribuidorId, comercialId, clienteId, resultado, lineas, pendiente, nota) => {
    datos.visitas.push({
      id: nuevoId(), fecha: sumarDias(hoy, -diasAtras), distribuidorId, comercialId, clienteId, resultado,
      lineas: lineas || [], pendiente: pendiente || null, nota: nota || '', creadaEl: new Date().toISOString(), ejemplo: true,
    });
  };
  const pend = (tipo, lineas, detalle, diasHastaPrevista) => ({
    tipo, lineas, detalle, fechaPrevista: sumarDias(hoy, diasHastaPrevista), estado: 'abierta', cerradaEl: null, visitaVentaId: null,
  });

  const ep = dist('Distribuidora Atlántica', 'Pontevedra', 'Salnés');
  const luis = com(ep, 'Ana');
  const tatiana = com(ep, 'Pablo');
  com(ep, 'Marta');
  const dm = dist('Distribuciones Mariñas', 'A Coruña', 'Coruña y Santiago');
  const manolo = com(dm, 'Manolo', '600 000 000');

  const peirao = cli('Restaurante O Peirao', 'Restaurante', 'Cambados', 'Pontevedra', 'Salnés');
  const praza = cli('Bar A Praza', 'Bar', 'Vilagarcía de Arousa', 'Pontevedra', 'Salnés');
  const porto = cli('Taberna do Porto', 'Restaurante', 'A Coruña', 'A Coruña', 'Coruña ciudad');
  const lume = cli('Vinoteca Lume', 'Tienda', 'Santiago de Compostela', 'A Coruña', 'Santiago');

  vis(0, ep, luis, peirao, 'vendido', [{ vinoId: vino('Flor de Carme'), anada: '2023', cantidad: 12, unidad: 'botellas' }, { vinoId: vino('La Ola'), cantidad: 2, unidad: 'cajas' }], null, 'Quiere probar el Pezium la próxima vez.');
  vis(0, ep, luis, praza, 'sin_interes', [], null, 'Trabajan con otra bodega por contrato.');
  vis(3, ep, tatiana, praza, 'pendiente', [], pend('introducir', [{ vinoId: vino('Amodiño'), cantidad: 0, unidad: 'botellas' }], 'Meterlo en la carta de vinos por copas.', 27));
  vis(8, dm, manolo, porto, 'vendido', [{ vinoId: vino('La Coartada'), cantidad: 6, unidad: 'botellas' }], pend('compra', [{ vinoId: vino('Flor de Carme Millésime'), cantidad: 6, unidad: 'botellas' }], 'Espumoso para Navidad.', 20));
  vis(40, dm, manolo, lume, 'pendiente', [], pend('compra', [{ vinoId: vino('Envidiacochina'), cantidad: 1, unidad: 'cajas' }, { vinoId: vino('Bendita Agua – Licor Hierbas'), cantidad: 0, unidad: 'botellas' }], 'Esperan a cerrar el inventario.', -5));
  return datos;
}

// Borra lo marcado como ejemplo. Si Luis ha usado un distribuidor, comercial
// o cliente de ejemplo en una visita suya, ese se conserva para no dejarla coja.
function borrarEjemplo(datos) {
  datos.visitas = datos.visitas.filter((v) => !v.ejemplo);
  const usados = new Set();
  for (const v of datos.visitas) {
    usados.add(v.distribuidorId); usados.add(v.comercialId); usados.add(v.clienteId);
  }
  for (const c of datos.comerciales) if (usados.has(c.id)) usados.add(c.distribuidorId);
  let conservados = 0;
  for (const lista of ['distribuidores', 'comerciales', 'clientes']) {
    datos[lista] = datos[lista].filter((x) => {
      if (!x.ejemplo) return true;
      if (usados.has(x.id)) { conservados++; x.ejemplo = false; return true; }
      return false;
    });
  }
  return conservados;
}

// En el navegador queda como objeto global D; en Node se exporta para las pruebas.
const D = {
  VINOS_INICIALES, RESULTADOS, TIPOS_PENDIENTE, ESTADOS_PENDIENTE, ESTADOS_DISTRIBUIDOR, TIPOS_DISTRIBUIDOR, CLIENTE_NUEVO, nuevoId, aISO, hoyISO, sumarDias, diasEntre, fechaES,
  normalizar, datosVacios, porId, nombreVino, nombreConAnada, ultimaAnada, describirLineas, pendientesAbiertas, pendientesCerradas, filtrarVisitas,
  totales, agrupar, buscarClientes, clientesRecientes, valoresUsados, exportarCSV, celdaCSV, crearCopia, leerCopia,
  hayEjemplo, cargarEjemplo, borrarEjemplo, guardarVisita, borrarVisita, descartarPendiente, reabrirPendiente,
  posponerPendiente, esPaquete, aplicarPaquete, agendaDelDia, agendaProxima, agendaPasada,
  bimestreDe, bimestreMover, bimestreLimites, bimestreNombre, FICHAS_REUNION, RESPONSABLE, MARCAS, INDICADORES, marcaDeVino, reunionVacia, reunionDe,
  contactosDistribuidor, resumenReunion, exportarReunion, numeroES, variacion,
  TIPOS_EVENTO, eventosEntre, gastoEventos, exportarEventosCSV, unidadesTexto: unidades,
};
if (typeof module !== 'undefined') module.exports = D;
