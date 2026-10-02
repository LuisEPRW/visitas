// Lógica de datos de la app: sin pantalla ni almacenamiento, para poder
// probarla también con Node (pruebas/datos.test.js).

const VERSION_DATOS = 1;

// Nombres tal cual salen en la tienda de eladiopineiro.com (02/10/2026),
// sin los lotes (Dupla, 4 botellas): eso se apunta con la cantidad.
const VINOS_INICIALES = [
  'Flor de Carme',
  'Flor de Carme Millésime',
  'Frore de Carme Pezium',
  'Flor de Carme Millésime Pezium Brut Nature',
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

const COLUMNAS_CSV = [
  'Fecha', 'Distribuidor', 'Comercial', 'Cliente', 'Tipo de cliente', 'Población', 'Provincia', 'Zona',
  'Resultado', 'Vino vendido', 'Añada', 'Cantidad', 'Unidad', 'Pendiente de', 'Vinos pendientes', 'Detalle pendiente',
  'Fecha prevista', 'Estado pendiente', 'Nota',
];

function celdaCSV(valor) {
  let texto = valor === null || valor === undefined ? '' : String(valor);
  // Un texto que empieza por = + - @ Excel lo trataría como fórmula.
  if (/^[=+\-@]/.test(texto)) texto = "'" + texto;
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
    ];
    const lineas = v.lineas && v.lineas.length ? v.lineas : [null];
    for (const l of lineas) {
      const vino = l ? [nombreVino(datos, l.vinoId), l.anada || '', l.cantidad, l.unidad === 'cajas' ? 'cajas' : 'botellas'] : ['', '', '', ''];
      filas.push([...comun, ...vino, ...finales]);
    }
  }
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
  }
  return {
    version: VERSION_DATOS,
    vinos: d.vinos,
    distribuidores: d.distribuidores,
    comerciales: d.comerciales,
    clientes: d.clientes,
    visitas: d.visitas,
    agenda: d.agenda,
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
  VINOS_INICIALES, RESULTADOS, TIPOS_PENDIENTE, ESTADOS_PENDIENTE, nuevoId, aISO, hoyISO, sumarDias, diasEntre, fechaES,
  normalizar, datosVacios, porId, nombreVino, nombreConAnada, ultimaAnada, describirLineas, pendientesAbiertas, pendientesCerradas, filtrarVisitas,
  totales, agrupar, buscarClientes, clientesRecientes, valoresUsados, exportarCSV, celdaCSV, crearCopia, leerCopia,
  hayEjemplo, cargarEjemplo, borrarEjemplo, guardarVisita, borrarVisita, descartarPendiente, reabrirPendiente,
  posponerPendiente, agendaDelDia, agendaProxima, agendaPasada,
};
if (typeof module !== 'undefined') module.exports = D;
