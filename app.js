'use strict';
// Pantallas de la app. La lógica de datos está en datos.js (objeto global D).

const VERSION_APP = '1.5';
const TIPOS_CLIENTE = ['Restaurante', 'Bar', 'Tienda / vinoteca', 'Hotel', 'Otro'];
const PROVINCIAS = ['A Coruña', 'Lugo', 'Ourense', 'Pontevedra', 'Álava', 'Albacete', 'Alicante', 'Almería', 'Asturias',
  'Ávila', 'Badajoz', 'Barcelona', 'Burgos', 'Cáceres', 'Cádiz', 'Cantabria', 'Castellón', 'Ciudad Real', 'Córdoba',
  'Cuenca', 'Girona', 'Granada', 'Guadalajara', 'Gipuzkoa', 'Huelva', 'Huesca', 'Illes Balears', 'Jaén', 'La Rioja',
  'Las Palmas', 'León', 'Lleida', 'Madrid', 'Málaga', 'Murcia', 'Navarra', 'Palencia', 'Salamanca',
  'Santa Cruz de Tenerife', 'Segovia', 'Sevilla', 'Soria', 'Tarragona', 'Teruel', 'Toledo', 'Valencia', 'Valladolid',
  'Bizkaia', 'Zamora', 'Zaragoza', 'Ceuta', 'Melilla'];

let datos = null;
let bd = null;
let borrador = null; // la visita que se está rellenando en el formulario
let rutaAnterior = '#hoy';
const consulta = { periodo: 'todo', desde: '', hasta: '', distribuidorId: '', comercialId: '', provincia: '', zona: '', resultado: '', texto: '', verPor: 'distribuidor' };
const vistaPendientes = { cerrados: false, distribuidorId: '' };
let busquedaClientesAjustes = '';

// ---------- Almacenamiento (IndexedDB del propio teléfono) ----------

function abrirBD() {
  return new Promise((ok, mal) => {
    const peticion = indexedDB.open('visitas-luis', 1);
    peticion.onupgradeneeded = () => peticion.result.createObjectStore('estado');
    peticion.onsuccess = () => ok(peticion.result);
    peticion.onerror = () => mal(peticion.error);
  });
}

function leerDatos() {
  return new Promise((ok, mal) => {
    const peticion = bd.transaction('estado').objectStore('estado').get('datos');
    peticion.onsuccess = () => ok(peticion.result || null);
    peticion.onerror = () => mal(peticion.error);
  });
}

function escribirBD(valor, clave) {
  return new Promise((ok, mal) => {
    const tx = bd.transaction('estado', 'readwrite');
    tx.objectStore('estado').put(valor, clave);
    tx.oncomplete = ok;
    tx.onerror = () => mal(tx.error);
    tx.onabort = () => mal(tx.error);
  });
}

async function guardar() {
  try {
    await escribirBD(datos, 'datos');
    cambioParaSubir();
    return true;
  } catch (e) {
    aviso('¡No se ha podido guardar! ' + (e && e.message ? e.message : ''), true);
    return false;
  }
}

// ---------- Copia en GitHub (la parte de GitHub está en nube.js) ----------
// El móvil de Luis sube cada cambio; los demás aparatos en «solo ver» bajan
// lo de Luis cada 30 segundos. La configuración (con la llave) se guarda
// aparte de los datos, así que no sale en las copias ni en el Excel.

const ARCHIVO_NUBE = 'datos.json';
let conexion = { repo: 'LuisEPRW/visitas-datos', llave: '', modo: 'no', sha: '', pendiente: false, ultima: '', error: '' };
let temporizadorSubida = null;
let subiendo = false;
let cambiosLocales = 0;
let ultimoTextoBajado = '';

function leerConexion() {
  return new Promise((ok) => {
    const peticion = bd.transaction('estado').objectStore('estado').get('conexion');
    peticion.onsuccess = () => ok(peticion.result || null);
    peticion.onerror = () => ok(null);
  });
}

async function guardarConexion() {
  try { await escribirBD(conexion, 'conexion'); } catch (e) { /* no es grave: se reintenta */ }
}

function cambioParaSubir() {
  cambiosLocales++;
  if (conexion.modo !== 'subir') return;
  conexion.pendiente = true;
  guardarConexion();
  clearTimeout(temporizadorSubida);
  temporizadorSubida = setTimeout(subirAhora, 3000);
}

function mensajeError(e) {
  return e instanceof TypeError ? 'Sin conexión: se sube en cuanto haya cobertura.' : (e.message || 'Error al conectar con GitHub.');
}

async function subirAhora() {
  if (conexion.modo !== 'subir' || !conexion.pendiente || subiendo || !navigator.onLine) return;
  subiendo = true;
  const antes = cambiosLocales;
  try {
    const sha = conexion.sha || await N.shaNube(conexion.repo, conexion.llave, ARCHIVO_NUBE);
    conexion.sha = await N.subirNube(conexion.repo, conexion.llave, ARCHIVO_NUBE, D.crearCopia(datos), sha);
    conexion.pendiente = cambiosLocales !== antes;
    conexion.ultima = new Date().toISOString();
    conexion.error = '';
  } catch (e) {
    conexion.error = mensajeError(e);
  }
  subiendo = false;
  await guardarConexion();
  mostrarEstadoNube();
  if (conexion.pendiente && !conexion.error) subirAhora();
}

async function bajarAhora() {
  if (conexion.modo !== 'ver' || !navigator.onLine) return;
  try {
    const texto = await N.bajarNube(conexion.repo, conexion.llave, ARCHIVO_NUBE);
    conexion.ultima = new Date().toISOString();
    conexion.error = texto === null ? 'Luis todavía no ha subido nada.' : '';
    if (texto && texto !== ultimoTextoBajado) {
      datos = D.leerCopia(texto);
      ultimoTextoBajado = texto;
      await escribirBD(datos, 'datos');
      if (!borrador && !document.getElementById('dialogo').open) repintar();
    }
  } catch (e) {
    conexion.error = mensajeError(e);
  }
  await guardarConexion();
  mostrarEstadoNube();
}

function sincronizar() {
  if (conexion.modo === 'subir') subirAhora(); else bajarAhora();
}

function horaCorta(iso) {
  return iso ? new Date(iso).toLocaleString('es-ES', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '';
}

function textoEstadoNube() {
  if (conexion.modo === 'subir') {
    if (conexion.error) return `⚠ ${conexion.error}${conexion.pendiente ? ' Hay cambios sin subir.' : ''}`;
    if (conexion.pendiente) return 'Hay cambios pendientes de subir (se suben solos con cobertura).';
    return conexion.ultima ? `Todo subido. Última subida: ${horaCorta(conexion.ultima)}.` : 'Conectada.';
  }
  if (conexion.modo === 'ver') {
    if (conexion.error) return `⚠ ${conexion.error}`;
    return `Viendo los datos de Luis. Comprobado: ${horaCorta(conexion.ultima) || '—'}.`;
  }
  return 'Desactivada.';
}

function bandaNube() {
  if (conexion.modo !== 'ver') return '';
  return `<div id="banda-nube" class="banda-nube">${esc(textoEstadoNube())} Lo que cambies aquí no le llega a Luis.</div>`;
}

function mostrarEstadoNube() {
  const banda = document.getElementById('banda-nube');
  if (banda) banda.textContent = textoEstadoNube() + ' Lo que cambies aquí no le llega a Luis.';
  const estado = document.getElementById('estado-nube');
  if (estado) estado.textContent = textoEstadoNube();
}

async function configurarNube() {
  const modos = [
    ['subir', 'Es el móvil de Luis: subir lo que apunte'],
    ['ver', 'Solo ver lo de Luis (ordenador, tablet…)'],
    ['no', 'Desactivada'],
  ];
  const cuerpo = campo('Repositorio privado', 'repo', conexion.repo) +
    campo('Llave de GitHub', 'llave', conexion.llave, 'type="password"') +
    `<label>Este aparato<select name="modo">${modos.map(([k, t]) => `<option value="${k}"${(conexion.modo === 'no' ? 'subir' : conexion.modo) === k ? ' selected' : ''}>${t}</option>`).join('')}</select></label>
    <p class="gris pequeno">En «Solo ver», lo que hay en este aparato se sustituye por lo de Luis y se actualiza solo cada 30 segundos.</p>`;
  const { boton, valores } = await abrirDialogo('Copia en GitHub', cuerpo,
    [{ valor: 'cancelar', texto: 'Cancelar' }, { valor: 'guardar', texto: 'Guardar', clase: 'principal' }]);
  if (boton !== 'guardar') return;
  if (valores.modo !== 'no') {
    if (!valores.repo || !valores.llave) { aviso('Falta el repositorio o la llave.', true); return; }
    try {
      await N.probarNube(valores.repo, valores.llave);
    } catch (e) {
      aviso(mensajeError(e), true);
      return;
    }
  }
  conexion = { repo: valores.repo, llave: valores.llave, modo: valores.modo, sha: '', pendiente: valores.modo === 'subir', ultima: '', error: '' };
  ultimoTextoBajado = '';
  await guardarConexion();
  aviso(valores.modo === 'no' ? 'Copia en GitHub desactivada' : 'Conectado a GitHub');
  repintar();
  sincronizar();
}

// ---------- Utilidades de pantalla ----------

function esc(texto) {
  return String(texto === null || texto === undefined ? '' : texto)
    .replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

let temporizadorAviso = null;
function aviso(texto, esError) {
  const el = document.getElementById('aviso');
  el.textContent = texto;
  el.className = 'visible' + (esError ? ' error' : '');
  clearTimeout(temporizadorAviso);
  temporizadorAviso = setTimeout(() => { el.className = ''; }, esError ? 4500 : 2500);
}

function opciones(lista, seleccionado, textoDe) {
  return lista.map((x) => `<option value="${esc(x.id)}"${x.id === seleccionado ? ' selected' : ''}>${esc(textoDe ? textoDe(x) : x.nombre)}</option>`).join('');
}

function opcionesTexto(valores, seleccionado) {
  return valores.map((v) => `<option value="${esc(v)}"${D.normalizar(v) === D.normalizar(seleccionado) && seleccionado ? ' selected' : ''}>${esc(v)}</option>`).join('');
}

function ordenar(lista) {
  return [...lista].sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
}

function comercialesDe(distribuidorId) {
  return ordenar(datos.comerciales.filter((c) => c.distribuidorId === distribuidorId));
}

function nombreDe(lista, id, siNo) {
  const x = D.porId(datos[lista], id);
  return x ? x.nombre : (siNo || '');
}

function plural(n, uno, varios) {
  return `${n} ${n === 1 ? uno : varios}`;
}

function fechaLarga(iso) {
  const [a, m, d] = iso.split('-').map(Number);
  const texto = new Date(a, m - 1, d).toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  return texto.charAt(0).toUpperCase() + texto.slice(1);
}

function cuandoVence(fechaPrevista) {
  if (!fechaPrevista) return { texto: 'sin fecha', atrasado: false };
  const dias = D.diasEntre(D.hoyISO(), fechaPrevista);
  if (dias < 0) return { texto: `atrasado ${plural(-dias, 'día', 'días')}`, atrasado: true };
  if (dias === 0) return { texto: 'es para hoy', atrasado: true };
  if (dias === 1) return { texto: 'mañana', atrasado: false };
  return { texto: `en ${dias} días`, atrasado: false };
}

function tarjetaVisita(v, conFecha) {
  const cliente = D.porId(datos.clientes, v.clienteId) || {};
  const comercial = nombreDe('comerciales', v.comercialId, 'sin comercial');
  const partes = [];
  if (v.lineas.length) partes.push(`<div class="detalle">${esc(D.describirLineas(datos, v.lineas))}</div>`);
  if (v.pendiente) {
    const p = v.pendiente;
    const que = [D.describirLineas(datos, p.lineas), p.detalle].filter(Boolean).join(' · ');
    const estado = p.estado === 'abierta' ? `para el ${D.fechaES(p.fechaPrevista)}` : D.ESTADOS_PENDIENTE[p.estado].toLowerCase();
    partes.push(`<div class="detalle"><b>${esc(D.TIPOS_PENDIENTE[p.tipo])}</b> (${esc(estado)}): ${esc(que)}</div>`);
  }
  if (v.nota) partes.push(`<div class="detalle gris">${esc(v.nota)}</div>`);
  return `<a class="visita ${v.resultado}" href="#visita/${esc(v.id)}">
    <div class="fila1"><strong>${esc(cliente.nombre || '(cliente borrado)')}</strong><span class="etiqueta ${v.resultado}">${esc(D.RESULTADOS[v.resultado])}</span></div>
    ${partes.join('')}
    <div class="gris">${conFecha ? esc(D.fechaES(v.fecha)) + ' · ' : ''}${esc(cliente.poblacion || '')} · con ${esc(comercial)} (${esc(nombreDe('distribuidores', v.distribuidorId))})</div>
  </a>`;
}

function hayVisitasReales() {
  return datos.visitas.some((v) => !v.ejemplo);
}

// ---------- Pantalla HOY ----------

function pantallaHoy() {
  const hoy = D.hoyISO();
  const salida = datos.ajustes.salida || {};
  const visitasHoy = D.filtrarVisitas(datos, { desde: hoy, hasta: hoy });
  const urgentes = D.pendientesAbiertas(datos).filter((v) => v.pendiente.fechaPrevista && v.pendiente.fechaPrevista <= hoy).length;
  const distribuidores = ordenar(datos.distribuidores);
  const agendaHoy = D.agendaDelDia(datos, hoy);
  const proxima = D.agendaProxima(datos, D.sumarDias(hoy, 1))[0];

  let tarjetaAgenda = '';
  if (agendaHoy.length) {
    const yaElegida = (x) => salida.distribuidorId === x.distribuidorId && (salida.comercialId || '') === (x.comercialId || '');
    tarjetaAgenda = `<section class="tarjeta info">
      <h2>En la agenda para hoy</h2>
      ${agendaHoy.map((x) => `<p style="margin:0 0 8px"><b>${esc(tituloSalida(x))}</b>${detalleSalida(x) ? ' · ' + esc(detalleSalida(x)) : ''}</p>
        ${x.distribuidorId && !yaElegida(x) ? `<button class="ancho" data-accion="salirCon" data-id="${esc(x.id)}">Salgo con este</button>` : ''}`).join('')}
    </section>`;
  } else if (proxima) {
    tarjetaAgenda = `<a class="tarjeta" style="display:block;text-decoration:none;color:inherit" href="#agenda">
      <span class="gris pequeno">Próxima salida:</span> <b>${esc(diaTexto(proxima.fecha))}</b> · ${esc(tituloSalida(proxima))} ›</a>`;
  }

  let avisoCopia = '';
  if (hayVisitasReales()) {
    const ultima = datos.ajustes.ultimaCopia;
    const dias = ultima ? D.diasEntre(ultima.slice(0, 10), hoy) : null;
    if (dias === null || dias >= 7) {
      avisoCopia = `<section class="tarjeta alerta-copia">
        <p>${dias === null ? 'Todavía no has guardado ninguna copia de seguridad.' : `Hace ${dias} días que no guardas una copia de seguridad.`} Los datos solo están en este teléfono.</p>
        <button class="principal ancho" data-accion="copiaJSON">Guardar copia ahora</button>
      </section>`;
    }
  }

  return `
    <h1>Hoy</h1>
    <p class="sub">${esc(fechaLarga(hoy))}</p>
    ${avisoCopia}
    ${tarjetaAgenda}
    <section class="tarjeta">
      <h2>Hoy salgo con</h2>
      <label>Distribuidor
        <select data-cambio="salidaDistribuidor">
          <option value="">— Elige distribuidor —</option>
          ${opciones(distribuidores, salida.distribuidorId)}
          <option value="__nuevo">+ Añadir distribuidor…</option>
        </select>
      </label>
      ${salida.distribuidorId ? `<label>Comercial
        <select data-cambio="salidaComercial">
          <option value="">— Voy sin comercial —</option>
          ${opciones(comercialesDe(salida.distribuidorId), salida.comercialId)}
          <option value="__nuevo">+ Añadir comercial…</option>
        </select>
      </label>` : ''}
    </section>
    <button class="principal grande" data-accion="nuevaVisita">+ Nueva visita</button>
    <p></p>
    ${urgentes ? `<a class="tarjeta alerta" href="#pendientes">Tienes ${plural(urgentes, 'pendiente', 'pendientes')} para hoy o atrasados ›</a>` : ''}
    <h2>Visitas de hoy (${visitasHoy.length})</h2>
    ${visitasHoy.length ? visitasHoy.map((v) => tarjetaVisita(v, false)).join('') : '<p class="vacio">Aún no has apuntado ninguna visita hoy.</p>'}
  `;
}

// ---------- Formulario de VISITA ----------

function pendienteVacio(fechaBase) {
  return { tipo: 'compra', lineas: [], detalle: '', fechaPrevista: D.sumarDias(fechaBase, 30), estado: 'abierta', cerradaEl: null, visitaVentaId: null };
}

function borradorNuevo() {
  const hoy = D.hoyISO();
  const salida = datos.ajustes.salida || {};
  return {
    id: D.nuevoId(), nueva: true, fecha: hoy, distribuidorId: salida.distribuidorId || '', comercialId: salida.comercialId || '',
    clienteId: '', clienteNuevo: null, busqueda: '', resultado: '', lineas: [], conPendiente: false,
    pendiente: pendienteVacio(hoy), nota: '', origenPendienteId: null, creadaEl: null, ejemplo: false,
  };
}

function borradorDeVisita(visita) {
  const b = JSON.parse(JSON.stringify(visita));
  b.nueva = false;
  b.clienteNuevo = null;
  b.busqueda = '';
  b.conPendiente = !!visita.pendiente;
  b.pendiente = b.pendiente || pendienteVacio(visita.fecha);
  [...b.lineas, ...b.pendiente.lineas].forEach((l) => { if (!l.cantidad) l.cantidad = ''; });
  return b;
}

// Venta de algo que estaba pendiente: nueva visita de hoy con lo pendiente ya puesto.
function borradorDeVenta(origen) {
  const b = borradorNuevo();
  b.distribuidorId = origen.distribuidorId;
  b.comercialId = origen.comercialId;
  b.clienteId = origen.clienteId;
  b.resultado = 'vendido';
  b.lineas = origen.pendiente.lineas.map((l) => ({ vinoId: l.vinoId, anada: l.anada || '', cantidad: l.cantidad || '', unidad: l.unidad || 'botellas' }));
  b.origenPendienteId = origen.id;
  return b;
}

function seccionLineas(campo, lineas, cantidadObligatoria) {
  const usados = new Set(lineas.map((l) => l.vinoId));
  const disponibles = datos.vinos.filter((v) => v.activo && !usados.has(v.id));
  const filas = lineas.map((l, i) => `
    <div class="linea">
      <span class="nombre">${esc(D.nombreVino(datos, l.vinoId))}</span>
      <select class="anada" data-campo="${campo}.${i}.anada" aria-label="Añada">${opcionesAnada(l.anada)}</select>
      <div class="controles">
        <button type="button" data-accion="menos" data-campo-lista="${campo}" data-i="${i}" aria-label="Uno menos">−</button>
        <input type="number" inputmode="numeric" min="0" step="1" data-campo="${campo}.${i}.cantidad" value="${esc(l.cantidad)}" placeholder="${cantidadObligatoria ? '?' : '—'}">
        <button type="button" data-accion="mas" data-campo-lista="${campo}" data-i="${i}" aria-label="Uno más">+</button>
        <button type="button" class="unidad" data-accion="cambiarUnidad" data-campo-lista="${campo}" data-i="${i}">${l.unidad === 'cajas' ? 'cajas' : 'botellas'}</button>
        <button type="button" class="quitar" data-accion="quitarLinea" data-campo-lista="${campo}" data-i="${i}" aria-label="Quitar">✕</button>
      </div>
    </div>`).join('');
  const chips = disponibles.map((v) => `<button type="button" class="chip" data-accion="anadirVino" data-campo-lista="${campo}" data-vino="${esc(v.id)}">${esc(v.nombre)}</button>`).join('');
  return `${filas}
    <p class="gris pequeno">${lineas.length ? 'Añadir otro vino:' : 'Toca un vino para añadirlo:'}${cantidadObligatoria ? '' : ' (la cantidad es opcional)'}</p>
    <div class="chips">${chips}</div>`;
}

// Añadas para elegir: de este año hacia atrás. Si una visita antigua tiene
// una añada fuera de la lista, se añade para no perderla al editar.
function opcionesAnada(elegida) {
  const anos = [];
  for (let a = new Date().getFullYear(); a >= 2010; a--) anos.push(String(a));
  if (elegida && !anos.includes(elegida)) anos.push(elegida);
  return `<option value="">Añada —</option>` + anos.map((a) => `<option value="${a}"${a === elegida ? ' selected' : ''}>${a}</option>`).join('');
}

function resultadosCliente() {
  const b = borrador;
  let lista;
  let titulo = '';
  if (b.busqueda.trim()) {
    lista = D.buscarClientes(datos, b.busqueda).slice(0, 8);
  } else {
    lista = D.clientesRecientes(datos, 6, b.distribuidorId);
    if (!lista.length) lista = D.clientesRecientes(datos, 6);
    if (lista.length) titulo = '<p class="gris pequeno">Últimos visitados:</p>';
  }
  const botones = lista.map((c) => `<button type="button" data-accion="elegirCliente" data-id="${esc(c.id)}">${esc(c.nombre)}<span class="gris">${c.poblacion ? ' · ' + esc(c.poblacion) : ''}</span></button>`).join('');
  const texto = b.busqueda.trim();
  const nuevo = `<button type="button" class="nuevo" data-accion="crearCliente">+ Nuevo cliente${texto ? ': «' + esc(texto) + '»' : ''}</button>`;
  return titulo + botones + nuevo;
}

function seccionCliente() {
  const b = borrador;
  if (b.clienteId) {
    const c = D.porId(datos.clientes, b.clienteId) || {};
    return `<div class="cliente-elegido">
      <div><strong>${esc(c.nombre)}</strong><div class="gris pequeno">${esc([c.poblacion, c.provincia, c.zona].filter(Boolean).join(' · '))}</div></div>
      <button type="button" data-accion="cambiarCliente">Cambiar</button>
    </div>`;
  }
  if (b.clienteNuevo) {
    const n = b.clienteNuevo;
    return `
      <label>Nombre del local<input data-campo="clienteNuevo.nombre" value="${esc(n.nombre)}" autocomplete="off"></label>
      <label>Tipo<select data-campo="clienteNuevo.tipo"><option value="">—</option>${opcionesTexto(TIPOS_CLIENTE, n.tipo)}</select></label>
      <label>Población<input data-campo="clienteNuevo.poblacion" value="${esc(n.poblacion)}" list="lista-poblaciones" autocomplete="off"></label>
      <div class="dos-columnas">
        <label>Provincia<input data-campo="clienteNuevo.provincia" value="${esc(n.provincia)}" list="lista-provincias" autocomplete="off"></label>
        <label>Zona<input data-campo="clienteNuevo.zona" value="${esc(n.zona)}" list="lista-zonas" autocomplete="off"></label>
      </div>
      <label>Contacto (opcional)<input data-campo="clienteNuevo.contacto" value="${esc(n.contacto)}" placeholder="Persona o teléfono" autocomplete="off"></label>
      <button type="button" class="ancho" data-accion="cancelarClienteNuevo">Mejor elegir uno de la lista</button>
      ${listasSugerencias()}`;
  }
  return `<input type="search" data-campo="busqueda" value="${esc(b.busqueda)}" placeholder="Busca por nombre o población" autocomplete="off">
    <div id="resultados-cliente" class="lista-clientes" style="margin-top:10px">${resultadosCliente()}</div>`;
}

function listasSugerencias() {
  const poblaciones = [...new Set(datos.clientes.map((c) => (c.poblacion || '').trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'es'));
  const provincias = [...new Set([...D.valoresUsados(datos, 'provincia'), ...PROVINCIAS])];
  const dl = (id, valores) => `<datalist id="${id}">${valores.map((v) => `<option value="${esc(v)}"></option>`).join('')}</datalist>`;
  return dl('lista-poblaciones', poblaciones) + dl('lista-provincias', provincias) + dl('lista-zonas', D.valoresUsados(datos, 'zona'));
}

function pantallaVisita() {
  const b = borrador;
  const titulo = !b.nueva ? 'Editar visita' : (b.origenPendienteId ? 'Venta de un pendiente' : 'Nueva visita');
  const origen = b.origenPendienteId && D.porId(datos.visitas, b.origenPendienteId);
  const conPendiente = b.resultado === 'pendiente' || (b.resultado === 'vendido' && b.conPendiente);
  const p = b.pendiente;
  const atajos = [[15, 'En 2 semanas'], [30, 'En 1 mes'], [45, 'En mes y medio']];

  return `
    <h1>${titulo}</h1>
    <p></p>
    ${origen ? `<section class="tarjeta info">Venta del pendiente del ${esc(D.fechaES(origen.fecha))}: ${esc([D.describirLineas(datos, origen.pendiente.lineas), origen.pendiente.detalle].filter(Boolean).join(' · '))}.${b.nueva ? ' Revisa las cantidades y guarda.' : ''}</section>` : ''}
    <section class="tarjeta">
      <label>Fecha<input type="date" data-campo="fecha" value="${esc(b.fecha)}"></label>
      <label>Distribuidor
        <select data-campo="distribuidorId">
          <option value="">— Elige distribuidor —</option>
          ${opciones(ordenar(datos.distribuidores), b.distribuidorId)}
          <option value="__nuevo">+ Añadir distribuidor…</option>
        </select>
      </label>
      ${b.distribuidorId ? `<label>Comercial con el que vas
        <select data-campo="comercialId">
          <option value="">— Voy sin comercial —</option>
          ${opciones(comercialesDe(b.distribuidorId), b.comercialId)}
          <option value="__nuevo">+ Añadir comercial…</option>
        </select>
      </label>` : ''}
    </section>

    <section class="tarjeta">
      <h2>Cliente</h2>
      ${seccionCliente()}
    </section>

    <section class="tarjeta">
      <h2>¿Cómo ha ido?</h2>
      <div class="resultados">
        <button type="button" class="vendido${b.resultado === 'vendido' ? ' activo' : ''}" data-accion="resultado" data-valor="vendido">Vendido</button>
        <button type="button" class="pendiente${b.resultado === 'pendiente' ? ' activo' : ''}" data-accion="resultado" data-valor="pendiente">Pendiente</button>
        <button type="button" class="sin_interes${b.resultado === 'sin_interes' ? ' activo' : ''}" data-accion="resultado" data-valor="sin_interes">Sin interés</button>
      </div>
    </section>

    ${b.resultado === 'vendido' ? `<section class="tarjeta">
      <h2>¿Qué ha comprado?</h2>
      ${seccionLineas('lineas', b.lineas, true)}
      <label class="casilla"><input type="checkbox" data-campo="conPendiente"${b.conPendiente ? ' checked' : ''}>Además queda algo pendiente</label>
    </section>` : ''}

    ${conPendiente ? `<section class="tarjeta">
      <h2>¿Qué queda pendiente?</h2>
      <div class="chips">
        <button type="button" class="chip${p.tipo === 'compra' ? ' activo' : ''}" data-accion="tipoPendiente" data-valor="compra">De compra</button>
        <button type="button" class="chip${p.tipo === 'introducir' ? ' activo' : ''}" data-accion="tipoPendiente" data-valor="introducir">De introducir</button>
      </div>
      <h3>Vinos</h3>
      ${seccionLineas('pendiente.lineas', p.lineas, false)}
      <h3>Detalle</h3>
      <textarea data-campo="pendiente.detalle" placeholder="Ej.: meterlo en la carta por copas">${esc(p.detalle)}</textarea>
      <h3>¿Para cuándo?</h3>
      <div class="chips">
        ${atajos.map(([dias, texto]) => `<button type="button" class="chip${p.fechaPrevista === D.sumarDias(b.fecha, dias) ? ' activo' : ''}" data-accion="plazo" data-dias="${dias}">${texto}</button>`).join('')}
      </div>
      <p></p>
      <input type="date" data-campo="pendiente.fechaPrevista" value="${esc(p.fechaPrevista)}">
      ${!b.nueva ? `<p></p><label>Estado<select data-campo="pendiente.estado">${Object.entries(D.ESTADOS_PENDIENTE).map(([k, t]) => `<option value="${k}"${p.estado === k ? ' selected' : ''}>${t}</option>`).join('')}</select></label>` : ''}
    </section>` : ''}

    <section class="tarjeta">
      <label>Nota (opcional)<textarea data-campo="nota" placeholder="Lo que quieras recordar">${esc(b.nota)}</textarea></label>
    </section>

    ${!b.nueva ? '<button class="peligro ancho" data-accion="borrarVisita">Borrar esta visita</button>' : ''}

    <div class="pie-fijo">
      <button class="cancelar" data-accion="volver">Cancelar</button>
      <button class="principal grande" data-accion="guardarVisita">Guardar</button>
    </div>
  `;
}

function ponerCampo(objeto, ruta, valor) {
  const partes = ruta.split('.');
  let o = objeto;
  for (const parte of partes.slice(0, -1)) o = o[parte];
  o[partes[partes.length - 1]] = valor;
}

function leerCampo(objeto, ruta) {
  return ruta.split('.').reduce((o, parte) => o[parte], objeto);
}

function ultimaZona(distribuidorId) {
  const reciente = D.clientesRecientes(datos, 1, distribuidorId)[0];
  if (reciente) return { provincia: reciente.provincia || '', zona: reciente.zona || '' };
  const d = D.porId(datos.distribuidores, distribuidorId) || {};
  return { provincia: d.provincia || '', zona: d.zona || '' };
}

async function guardarVisitaFormulario() {
  const b = borrador;
  const conPendiente = b.resultado === 'pendiente' || (b.resultado === 'vendido' && b.conPendiente);
  const limpiar = (lineas) => lineas.map((l) => ({
    vinoId: l.vinoId, anada: /^\d{4}$/.test(l.anada || '') ? l.anada : '',
    cantidad: Math.max(0, parseInt(l.cantidad, 10) || 0), unidad: l.unidad === 'cajas' ? 'cajas' : 'botellas',
  }));
  const lineas = limpiar(b.lineas);
  const lineasPendientes = limpiar(b.pendiente.lineas);

  let error = '';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(b.fecha)) error = 'Pon la fecha de la visita.';
  else if (!b.distribuidorId) error = 'Elige el distribuidor.';
  else if (!b.clienteId && !(b.clienteNuevo && b.clienteNuevo.nombre.trim())) error = 'Elige el cliente o escribe su nombre.';
  else if (!b.resultado) error = 'Marca cómo ha ido: vendido, pendiente o sin interés.';
  else if (b.resultado === 'vendido' && !lineas.length) error = 'Apunta qué vino ha comprado.';
  else if (b.resultado === 'vendido' && lineas.some((l) => !l.cantidad)) error = 'Falta la cantidad de algún vino vendido.';
  else if (conPendiente && !lineasPendientes.length && !b.pendiente.detalle.trim()) error = 'Apunta qué queda pendiente (un vino o el detalle).';
  else if (conPendiente && !/^\d{4}-\d{2}-\d{2}$/.test(b.pendiente.fechaPrevista)) error = 'Pon para cuándo es el pendiente.';
  if (error) { aviso(error, true); return; }

  let clienteId = b.clienteId;
  if (!clienteId) {
    const n = b.clienteNuevo;
    const mismo = datos.clientes.find((c) => D.normalizar(c.nombre) === D.normalizar(n.nombre) && D.normalizar(c.poblacion) === D.normalizar(n.poblacion));
    if (mismo) {
      clienteId = mismo.id;
    } else {
      clienteId = D.nuevoId();
      datos.clientes.push({ id: clienteId, nombre: n.nombre.trim(), tipo: n.tipo, poblacion: n.poblacion.trim(), provincia: n.provincia.trim(), zona: n.zona.trim(), contacto: n.contacto.trim() });
    }
  }

  const visita = {
    id: b.id, fecha: b.fecha, distribuidorId: b.distribuidorId, comercialId: b.comercialId || '', clienteId,
    resultado: b.resultado, lineas: b.resultado === 'vendido' ? lineas : [],
    pendiente: conPendiente ? Object.assign({}, b.pendiente, { lineas: lineasPendientes, detalle: b.pendiente.detalle.trim() }) : null,
    nota: b.nota.trim(), origenPendienteId: b.origenPendienteId || null, creadaEl: b.creadaEl || new Date().toISOString(),
  };
  if (visita.pendiente && visita.pendiente.estado === 'abierta') Object.assign(visita.pendiente, { cerradaEl: null, visitaVentaId: null });
  if (visita.pendiente && visita.pendiente.estado !== 'abierta' && !visita.pendiente.cerradaEl) visita.pendiente.cerradaEl = D.hoyISO();
  if (b.ejemplo) visita.ejemplo = true;
  D.guardarVisita(datos, visita);
  if (b.nueva) datos.ajustes.salida = { distribuidorId: visita.distribuidorId, comercialId: visita.comercialId };
  if (await guardar()) {
    const ventaDePendiente = b.nueva && b.origenPendienteId;
    aviso(ventaDePendiente ? '¡Venta apuntada! Pendiente cerrado.' : 'Visita guardada');
    borrador = null;
    location.hash = ventaDePendiente ? '#pendientes' : (b.nueva ? '#hoy' : rutaAnterior);
  }
}

// ---------- Pantalla PENDIENTES ----------

function pantallaPendientes() {
  const abiertos = D.pendientesAbiertas(datos);
  const cerrados = D.pendientesCerradas(datos);
  const filtrar = (lista) => vistaPendientes.distribuidorId ? lista.filter((v) => v.distribuidorId === vistaPendientes.distribuidorId) : lista;
  const lista = filtrar(vistaPendientes.cerrados ? cerrados : abiertos);

  const tarjetas = lista.map((v) => {
    const p = v.pendiente;
    const cliente = D.porId(datos.clientes, v.clienteId) || {};
    const vence = cuandoVence(p.fechaPrevista);
    const que = [D.describirLineas(datos, p.lineas), p.detalle].filter(Boolean).join(' · ');
    let botones;
    if (p.estado === 'abierta') {
      botones = `<div class="botones">
        <button class="vender" data-accion="venderPendiente" data-id="${esc(v.id)}">✓ Vendido</button>
        <button data-accion="posponer" data-id="${esc(v.id)}">+15 días</button>
        <button class="peligro" data-accion="descartar" data-id="${esc(v.id)}">Descartar</button>
      </div>`;
    } else {
      const venta = p.visitaVentaId && D.porId(datos.visitas, p.visitaVentaId);
      botones = `<div class="botones">
        ${venta ? `<a class="boton" href="#visita/${esc(venta.id)}">Ver la venta</a>` : ''}
        <button data-accion="reabrir" data-id="${esc(v.id)}">Volver a abrir</button>
      </div>`;
    }
    const etiqueta = p.estado === 'abierta'
      ? `<span class="etiqueta ${vence.atrasado ? 'atrasado' : 'pendiente'}">${esc(vence.texto)}</span>`
      : `<span class="etiqueta ${p.estado === 'conseguida' ? 'vendido' : 'sin_interes'}">${esc(D.ESTADOS_PENDIENTE[p.estado])} ${esc(D.fechaES(p.cerradaEl))}</span>`;
    return `<article class="tarjeta pend${p.estado === 'abierta' && vence.atrasado ? ' atrasado' : ''}">
      <a class="cuerpo" href="#visita/${esc(v.id)}">
        <div class="fila1" style="display:flex;justify-content:space-between;gap:8px"><strong>${esc(cliente.nombre || '(cliente borrado)')}</strong>${etiqueta}</div>
        <div class="detalle"><b>${esc(D.TIPOS_PENDIENTE[p.tipo])}:</b> ${esc(que)}</div>
        <div class="gris pequeno">${esc(cliente.poblacion || '')} · con ${esc(nombreDe('comerciales', v.comercialId, 'sin comercial'))} (${esc(nombreDe('distribuidores', v.distribuidorId))})</div>
        <div class="gris pequeno">Visita del ${esc(D.fechaES(v.fecha))} · previsto para el ${esc(D.fechaES(p.fechaPrevista))}</div>
      </a>
      ${botones}
    </article>`;
  }).join('');

  return `
    <h1>Pendientes</h1>
    <p class="sub">Lo que quedó por vender o por introducir</p>
    <div class="segmento">
      <button data-accion="verPendientes" data-valor="abiertos" class="${vistaPendientes.cerrados ? '' : 'activo'}">Abiertos (${abiertos.length})</button>
      <button data-accion="verPendientes" data-valor="cerrados" class="${vistaPendientes.cerrados ? 'activo' : ''}">Cerrados (${cerrados.length})</button>
    </div>
    <label><select data-cambio="pendientesDistribuidor">
      <option value="">Todos los distribuidores</option>
      ${opciones(ordenar(datos.distribuidores), vistaPendientes.distribuidorId)}
    </select></label>
    ${tarjetas || `<p class="vacio">${vistaPendientes.cerrados ? 'No hay pendientes cerrados.' : 'No tienes nada pendiente. ¡Bien!'}</p>`}
  `;
}

// ---------- Pantalla CONSULTAR ----------

function rangoPeriodo() {
  const hoy = D.hoyISO();
  switch (consulta.periodo) {
    case 'hoy': return { desde: hoy, hasta: hoy };
    case 'semana': return { desde: D.sumarDias(hoy, -6), hasta: hoy };
    case 'mes': return { desde: hoy.slice(0, 8) + '01', hasta: '' };
    case 'ano': return { desde: hoy.slice(0, 5) + '01-01', hasta: '' };
    case 'elegir': return { desde: consulta.desde, hasta: consulta.hasta };
    default: return { desde: '', hasta: '' };
  }
}

function visitasConsultadas() {
  return D.filtrarVisitas(datos, Object.assign({}, consulta, rangoPeriodo()));
}

function resumenCifras(visitas) {
  const t = D.totales(datos, visitas);
  const partes = [plural(t.visitas, 'visita', 'visitas')];
  if (t.vendido) partes.push(plural(t.vendido, 'venta', 'ventas'));
  if (t.botellas) partes.push(`${t.botellas} bot.`);
  if (t.cajas) partes.push(plural(t.cajas, 'caja', 'cajas'));
  if (t.pendiente) partes.push(plural(t.pendiente, 'pendiente', 'pendientes'));
  return partes.join(' · ');
}

function grupoHTML(titulo, visitas, contenido, clase) {
  return `<details class="${clase || 'grupo'}"><summary><b>${esc(titulo)}</b><span class="resumen-grupo">${esc(resumenCifras(visitas))}</span></summary><div class="dentro">${contenido}</div></details>`;
}

function resultadosConsulta() {
  const visitas = visitasConsultadas();
  const t = D.totales(datos, visitas);
  const cliente = (v) => D.porId(datos.clientes, v.clienteId) || {};
  const listaVisitas = (vs) => vs.map((v) => tarjetaVisita(v, true)).join('');

  let grupos = '';
  if (consulta.verPor === 'distribuidor') {
    grupos = D.agrupar(visitas, (v) => nombreDe('distribuidores', v.distribuidorId)).map((g) => {
      const porComercial = D.agrupar(g.visitas, (v) => nombreDe('comerciales', v.comercialId, 'Sin comercial'))
        .map((c) => grupoHTML(c.clave, c.visitas, listaVisitas(c.visitas), 'subgrupo')).join('');
      return grupoHTML(g.clave, g.visitas, porComercial);
    }).join('');
  } else if (consulta.verPor === 'dia') {
    grupos = D.agrupar(visitas, (v) => v.fecha, true).map((g) => grupoHTML(fechaLarga(g.clave), g.visitas, listaVisitas(g.visitas))).join('');
  } else {
    const claves = { provincia: (v) => cliente(v).provincia, zona: (v) => cliente(v).zona, cliente: (v) => cliente(v).nombre };
    grupos = D.agrupar(visitas, claves[consulta.verPor]).map((g) => grupoHTML(g.clave, g.visitas, listaVisitas(g.visitas))).join('');
  }

  const tablaVinos = t.porVino.length ? `<table>
      <tr><th>Vino vendido</th><th class="num">Botellas</th><th class="num">Cajas</th></tr>
      ${t.porVino.map((f) => `<tr><td>${esc(f.nombre)}</td><td class="num">${f.botellas || ''}</td><td class="num">${f.cajas || ''}</td></tr>`).join('')}
    </table>` : '<p class="gris pequeno">Ninguna venta en lo que estás viendo.</p>';

  return `
    <section class="tarjeta">
      <div class="cifras">
        <div class="cifra"><b>${t.visitas}</b><span>visitas</span></div>
        <div class="cifra"><b>${t.vendido}</b><span>con venta</span></div>
        <div class="cifra"><b>${t.pendiente}</b><span>pendientes</span></div>
        <div class="cifra"><b>${t.sin_interes}</b><span>sin interés</span></div>
        <div class="cifra"><b>${t.botellas}</b><span>botellas vendidas</span></div>
        <div class="cifra"><b>${t.cajas}</b><span>cajas vendidas</span></div>
      </div>
      ${tablaVinos}
    </section>
    ${grupos || '<p class="vacio">No hay visitas con estos filtros.</p>'}
    ${visitas.length ? '<button class="ancho" data-accion="exportarConsulta">Exportar esta lista a Excel</button>' : ''}
  `;
}

function pantallaConsultar() {
  const periodos = [['hoy', 'Hoy'], ['semana', '7 días'], ['mes', 'Este mes'], ['ano', 'Este año'], ['todo', 'Todo'], ['elegir', 'Elegir fechas']];
  const verPor = [['distribuidor', 'Distribuidor'], ['provincia', 'Provincia'], ['zona', 'Zona'], ['dia', 'Día'], ['cliente', 'Cliente']];
  return `
    <h1>Consultar</h1>
    <p></p>
    <section class="tarjeta">
      <div class="chips">
        ${periodos.map(([k, t]) => `<button class="chip${consulta.periodo === k ? ' activo' : ''}" data-accion="periodo" data-valor="${k}">${t}</button>`).join('')}
      </div>
      <p></p>
      ${consulta.periodo === 'elegir' ? `<div class="dos-columnas">
        <label>Desde<input type="date" data-filtro="desde" value="${esc(consulta.desde)}"></label>
        <label>Hasta<input type="date" data-filtro="hasta" value="${esc(consulta.hasta)}"></label>
      </div>` : ''}
      <details class="mas-filtros"${consulta.distribuidorId || consulta.provincia || consulta.zona || consulta.resultado || consulta.texto ? ' open' : ''}>
      <summary>Más filtros: distribuidor, comercial, provincia, zona…</summary>
      <label>Distribuidor<select data-filtro="distribuidorId"><option value="">Todos</option>${opciones(ordenar(datos.distribuidores), consulta.distribuidorId)}</select></label>
      ${consulta.distribuidorId ? `<label>Comercial<select data-filtro="comercialId"><option value="">Todos</option>${opciones(comercialesDe(consulta.distribuidorId), consulta.comercialId)}</select></label>` : ''}
      <div class="dos-columnas">
        <label>Provincia<select data-filtro="provincia"><option value="">Todas</option>${opcionesTexto(D.valoresUsados(datos, 'provincia'), consulta.provincia)}</select></label>
        <label>Zona<select data-filtro="zona"><option value="">Todas</option>${opcionesTexto(D.valoresUsados(datos, 'zona'), consulta.zona)}</select></label>
      </div>
      <label>Resultado<select data-filtro="resultado"><option value="">Todos</option>${Object.entries(D.RESULTADOS).map(([k, t]) => `<option value="${k}"${consulta.resultado === k ? ' selected' : ''}>${t}</option>`).join('')}</select></label>
      <input type="search" data-filtro-texto value="${esc(consulta.texto)}" placeholder="Buscar cliente, población o nota" autocomplete="off">
      <p></p><button class="ancho" data-accion="quitarFiltros">Quitar filtros</button>
      </details>
    </section>
    <div class="segmento">
      ${verPor.map(([k, t]) => `<button data-accion="verPor" data-valor="${k}" class="${consulta.verPor === k ? 'activo' : ''}">${t}</button>`).join('')}
    </div>
    <div id="resultados-consulta">${resultadosConsulta()}</div>
  `;
}

// ---------- Pantalla AGENDA ----------

function diaSemana(iso) {
  const [a, m, d] = iso.split('-').map(Number);
  return new Date(a, m - 1, d).toLocaleDateString('es-ES', { weekday: 'short' }).replace('.', '');
}

// "lun 05/10"
function diaTexto(iso) {
  return `${diaSemana(iso)} ${D.fechaES(iso).slice(0, 5)}`;
}

function tituloSalida(x) {
  return nombreDe('distribuidores', x.distribuidorId) || x.lugar || x.nota || 'Sin decidir';
}

function detalleSalida(x) {
  const titulo = tituloSalida(x);
  const partes = [];
  if (x.comercialId) partes.push('con ' + nombreDe('comerciales', x.comercialId));
  const lugar = x.lugar || (D.porId(datos.distribuidores, x.distribuidorId) || {}).provincia;
  if (lugar && lugar !== titulo) partes.push(lugar);
  if (x.nota && x.nota !== titulo) partes.push(x.nota);
  return partes.join(' · ');
}

function filaSalida(x, hoy) {
  return `<button class="fila-ajuste salida${x.fecha === hoy ? ' hoy' : ''}" data-accion="editarSalida" data-id="${esc(x.id)}">
    ${x.fecha ? `<span class="dia"><small>${esc(diaSemana(x.fecha))}</small><br>${esc(D.fechaES(x.fecha).slice(0, 5))}</span>` : ''}
    <span>${esc(tituloSalida(x))}<small>${esc(detalleSalida(x))}</small></span></button>`;
}

function pantallaAgenda() {
  const hoy = D.hoyISO();
  const proximas = D.agendaProxima(datos, hoy);
  const pasadas = D.agendaPasada(datos, hoy);
  const porMes = D.agrupar(proximas, (x) => x.fecha.slice(0, 7)).map((g) => {
    const [a, m] = g.clave.split('-').map(Number);
    const mes = new Date(a, m - 1, 1).toLocaleDateString('es-ES', { month: 'long', year: 'numeric' });
    return `<h3>${esc(mes.charAt(0).toUpperCase() + mes.slice(1))}</h3>${g.visitas.map((x) => filaSalida(x, hoy)).join('')}`;
  }).join('');

  return `
    <h1>Agenda</h1>
    <p class="sub">Salidas previstas con los distribuidores</p>
    <section class="tarjeta">
      <h2>Próximas salidas (${proximas.length})</h2>
      ${porMes || '<p class="vacio">No hay salidas con fecha.</p>'}
    </section>
    <button class="principal ancho" data-accion="editarSalida" data-id="">+ Añadir salida</button>
    <p></p>
    ${pasadas.length ? `<details class="grupo"><summary><b>Salidas pasadas</b><span class="resumen-grupo">${plural(pasadas.length, 'salida', 'salidas')}</span></summary>
      <div class="dentro">${pasadas.map((x) => filaSalida(x, hoy)).join('')}</div></details>` : ''}
  `;
}

// ---------- Pantalla AJUSTES ----------

function listaClientesAjustes() {
  const filtrados = busquedaClientesAjustes.trim() ? D.buscarClientes(datos, busquedaClientesAjustes) : ordenar(datos.clientes);
  const filas = filtrados.slice(0, 60).map((c) => `<button class="fila-ajuste" data-accion="editarCliente" data-id="${esc(c.id)}">
    <span>${esc(c.nombre)}<small>${esc([c.poblacion, c.provincia, c.zona].filter(Boolean).join(' · '))}</small></span></button>`).join('');
  return filas + (filtrados.length > 60 ? `<p class="gris pequeno">Y ${filtrados.length - 60} más. Busca para encontrarlos.</p>` : '') +
    (filtrados.length ? '' : '<p class="vacio">Ningún cliente.</p>');
}

function pantallaAjustes() {
  const ultima = datos.ajustes.ultimaCopia;
  const distribuidores = ordenar(datos.distribuidores).map((d) => {
    const nombres = comercialesDe(d.id).map((c) => c.nombre).join(', ') || 'sin comerciales';
    return `<button class="fila-ajuste" data-accion="editarDistribuidor" data-id="${esc(d.id)}">
      <span>${esc(d.nombre)}<small>${esc([d.provincia, d.zona].filter(Boolean).join(' · '))}${d.provincia || d.zona ? ' — ' : ''}${esc(nombres)}</small></span></button>`;
  }).join('');
  const vinos = datos.vinos.map((v) => `<button class="fila-ajuste" data-accion="editarVino" data-id="${esc(v.id)}">
    <span>${esc(v.nombre)}${v.activo ? '' : '<small>oculto en la lista</small>'}</span></button>`).join('');

  return `
    <h1>Ajustes</h1>
    <p></p>
    <section class="tarjeta">
      <h2>Copia de seguridad</h2>
      <p class="pequeno">Los datos se guardan solo en este teléfono. Guarda una copia a menudo: mándatela por correo o guárdala en Archivos / iCloud.</p>
      <p class="pequeno"><b>Última copia:</b> ${ultima ? esc(D.fechaES(ultima.slice(0, 10))) : 'nunca'}</p>
      <button class="principal ancho" data-accion="copiaJSON">Guardar copia completa</button>
      <button class="ancho" data-accion="exportarCSV">Exportar todo a Excel</button>
      <label class="boton ancho" style="font-weight:600">Restaurar desde una copia…<input type="file" data-cambio="importar" class="oculto"></label>
    </section>

    <section class="tarjeta">
      <h2>Copia en GitHub</h2>
      <p class="pequeno" id="estado-nube">${esc(textoEstadoNube())}</p>
      <button class="ancho" data-accion="configurarNube">${conexion.modo === 'no' ? 'Activar' : 'Cambiar'}</button>
      ${conexion.modo !== 'no' ? `<button class="ancho" data-accion="sincronizarYa">${conexion.modo === 'subir' ? 'Subir ahora' : 'Actualizar ahora'}</button>` : ''}
    </section>

    <section class="tarjeta">
      <h2>Distribuidores y comerciales</h2>
      ${distribuidores || '<p class="vacio">Todavía no hay distribuidores.</p>'}
      <p></p>
      <button class="ancho" data-accion="editarDistribuidor" data-id="">+ Añadir distribuidor</button>
    </section>

    <section class="tarjeta">
      <h2>Clientes (${datos.clientes.length})</h2>
      <input type="search" data-buscar-clientes value="${esc(busquedaClientesAjustes)}" placeholder="Buscar cliente" autocomplete="off">
      <div id="lista-clientes-ajustes">${listaClientesAjustes()}</div>
      <p></p>
      <button class="ancho" data-accion="editarCliente" data-id="">+ Añadir cliente</button>
    </section>

    <section class="tarjeta">
      <h2>Vinos</h2>
      ${vinos}
      <p></p>
      <button class="ancho" data-accion="editarVino" data-id="">+ Añadir vino</button>
    </section>

    <section class="tarjeta">
      <h2>Datos de ejemplo</h2>
      ${D.hayEjemplo(datos)
        ? '<p class="pequeno">Hay datos de prueba marcados como (EJEMPLO) para que veas cómo funciona. Bórralos cuando empieces de verdad.</p><button class="peligro ancho" data-accion="borrarEjemplo">Borrar datos de ejemplo</button>'
        : '<p class="pequeno">No hay datos de ejemplo.</p><button class="ancho" data-accion="cargarEjemplo">Cargar datos de ejemplo</button>'}
    </section>
    <p class="gris pequeno" style="text-align:center">Visitas · Eladio Piñeiro Rural Wines · versión ${VERSION_APP}</p>
  `;
}

// ---------- Diálogos (añadir/editar) ----------

// Abre un diálogo con campos y espera a que se pulse un botón.
// Devuelve { boton, valores } donde valores sale de los campos con name.
function abrirDialogo(titulo, cuerpo, botones) {
  const dialogo = document.getElementById('dialogo');
  dialogo.innerHTML = `<form method="dialog">
    <div class="cabecera-dialogo">
      <h2>${esc(titulo)}</h2>
      <button value="cancelar" class="cerrar" aria-label="Cerrar">✕</button>
    </div>
    ${cuerpo}
    <div class="botones">${botones.map((b) => `<button value="${b.valor}" class="${b.clase || ''}">${esc(b.texto)}</button>`).join('')}</div>
  </form>`;
  return new Promise((ok) => {
    dialogo.onclose = () => {
      const valores = {};
      dialogo.querySelectorAll('[name]').forEach((el) => {
        valores[el.name] = el.type === 'checkbox' ? el.checked : el.value.trim();
      });
      ok({ boton: dialogo.returnValue, valores });
    };
    // Que la tecla Intro del teclado no pulse el primer botón (que puede ser Borrar).
    dialogo.querySelector('form').addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && e.target.tagName === 'INPUT') e.preventDefault();
    });
    dialogo.returnValue = '';
    dialogo.showModal();
  });
}

function campo(etiqueta, nombre, valor, extra) {
  return `<label>${esc(etiqueta)}<input name="${nombre}" value="${esc(valor)}" autocomplete="off" ${extra || ''}></label>`;
}

function filaComercial(c) {
  return `<div class="fila-comercial">
    <input name="comNombre_${esc(c.id)}" value="${esc(c.nombre)}" placeholder="Nombre" autocomplete="off">
    <input name="comTel_${esc(c.id)}" value="${esc(c.telefono)}" placeholder="Teléfono" inputmode="tel" autocomplete="off">
  </div>`;
}

async function editarDistribuidor(id) {
  const d = D.porId(datos.distribuidores, id) || { id: D.nuevoId(), nombre: '', provincia: '', zona: '' };
  const esNuevo = !D.porId(datos.distribuidores, id);
  const comerciales = comercialesDe(d.id);
  const filas = comerciales.map(filaComercial).join('') + filaComercial({ id: 'nuevo1', nombre: '', telefono: '' });
  const cuerpo = campo('Nombre del distribuidor', 'nombre', d.nombre) +
    `<div class="dos-columnas">${campo('Provincia', 'provincia', d.provincia, 'list="lista-provincias"')}${campo('Zona que cubre', 'zona', d.zona, 'list="lista-zonas"')}</div>
    <h3>Comerciales</h3>
    <div id="filas-comerciales">${filas}</div>
    <button type="button" class="ancho" data-accion="otraFilaComercial">+ Otro comercial</button>
    <p class="gris pequeno">Para quitar un comercial, borra su nombre (solo si no tiene visitas ni salidas en la agenda).</p>
    ${listasSugerencias()}`;
  const botones = [{ valor: 'cancelar', texto: 'Cancelar' }, { valor: 'guardar', texto: 'Guardar', clase: 'principal' }];
  if (!esNuevo) botones.unshift({ valor: 'borrar', texto: 'Borrar', clase: 'peligro' });
  const { boton, valores } = await abrirDialogo(esNuevo ? 'Nuevo distribuidor' : 'Editar distribuidor', cuerpo, botones);

  if (boton === 'borrar') {
    const usadas = datos.visitas.filter((v) => v.distribuidorId === d.id).length;
    if (usadas) { aviso(`No se puede borrar: tiene ${plural(usadas, 'visita', 'visitas')}.`, true); return null; }
    const enAgenda = datos.agenda.filter((s) => s.distribuidorId === d.id).length;
    if (enAgenda) { aviso(`No se puede borrar: tiene ${plural(enAgenda, 'salida', 'salidas')} en la agenda.`, true); return null; }
    if (!confirm(`¿Borrar el distribuidor ${d.nombre} y sus comerciales?`)) return null;
    datos.distribuidores = datos.distribuidores.filter((x) => x.id !== d.id);
    datos.comerciales = datos.comerciales.filter((c) => c.distribuidorId !== d.id);
    if (datos.ajustes.salida && datos.ajustes.salida.distribuidorId === d.id) datos.ajustes.salida = null;
    await guardar();
    aviso('Distribuidor borrado');
    return null;
  }
  if (boton !== 'guardar') return null;
  if (!valores.nombre) { aviso('Falta el nombre del distribuidor.', true); return null; }
  Object.assign(d, { nombre: valores.nombre, provincia: valores.provincia, zona: valores.zona });
  if (esNuevo) datos.distribuidores.push(d);

  const noBorrables = [];
  for (const clave of Object.keys(valores).filter((k) => k.startsWith('comNombre_'))) {
    const cid = clave.slice('comNombre_'.length);
    const nombre = valores[clave];
    const telefono = valores['comTel_' + cid] || '';
    const existente = D.porId(datos.comerciales, cid);
    if (existente) {
      if (nombre) {
        Object.assign(existente, { nombre, telefono });
      } else if (datos.visitas.some((v) => v.comercialId === cid) || datos.agenda.some((s) => s.comercialId === cid)) {
        noBorrables.push(existente.nombre);
      } else {
        datos.comerciales = datos.comerciales.filter((c) => c.id !== cid);
      }
    } else if (nombre) {
      datos.comerciales.push({ id: D.nuevoId(), distribuidorId: d.id, nombre, telefono });
    }
  }
  await guardar();
  aviso(noBorrables.length ? `Guardado. No se ha quitado a ${noBorrables.join(', ')}: tiene visitas o salidas.` : 'Distribuidor guardado', noBorrables.length > 0);
  return d.id;
}

async function nuevoComercial(distribuidorId) {
  const { boton, valores } = await abrirDialogo(`Nuevo comercial de ${nombreDe('distribuidores', distribuidorId)}`,
    campo('Nombre', 'nombre', '') + campo('Teléfono (opcional)', 'telefono', '', 'inputmode="tel"'),
    [{ valor: 'cancelar', texto: 'Cancelar' }, { valor: 'guardar', texto: 'Guardar', clase: 'principal' }]);
  if (boton !== 'guardar' || !valores.nombre) return null;
  const c = { id: D.nuevoId(), distribuidorId, nombre: valores.nombre, telefono: valores.telefono };
  datos.comerciales.push(c);
  await guardar();
  return c.id;
}

async function editarCliente(id) {
  const c = D.porId(datos.clientes, id) || { id: D.nuevoId(), nombre: '', tipo: '', poblacion: '', provincia: '', zona: '', contacto: '' };
  const esNuevo = !D.porId(datos.clientes, id);
  const usadas = datos.visitas.filter((v) => v.clienteId === c.id).length;
  const cuerpo = campo('Nombre del local', 'nombre', c.nombre) +
    `<label>Tipo<select name="tipo"><option value="">—</option>${opcionesTexto(TIPOS_CLIENTE, c.tipo)}</select></label>` +
    campo('Población', 'poblacion', c.poblacion, 'list="lista-poblaciones"') +
    `<div class="dos-columnas">${campo('Provincia', 'provincia', c.provincia, 'list="lista-provincias"')}${campo('Zona', 'zona', c.zona, 'list="lista-zonas"')}</div>` +
    campo('Contacto', 'contacto', c.contacto) +
    (usadas ? `<p class="gris pequeno">${plural(usadas, 'visita', 'visitas')} apuntadas a este cliente.</p>` : '') +
    listasSugerencias();
  const botones = [{ valor: 'cancelar', texto: 'Cancelar' }, { valor: 'guardar', texto: 'Guardar', clase: 'principal' }];
  if (!esNuevo) botones.unshift({ valor: 'borrar', texto: 'Borrar', clase: 'peligro' });
  const { boton, valores } = await abrirDialogo(esNuevo ? 'Nuevo cliente' : 'Editar cliente', cuerpo, botones);
  if (boton === 'borrar') {
    if (usadas) { aviso(`No se puede borrar: tiene ${plural(usadas, 'visita', 'visitas')}.`, true); return; }
    if (!confirm(`¿Borrar el cliente ${c.nombre}?`)) return;
    datos.clientes = datos.clientes.filter((x) => x.id !== c.id);
  } else if (boton === 'guardar') {
    if (!valores.nombre) { aviso('Falta el nombre del cliente.', true); return; }
    Object.assign(c, valores);
    if (esNuevo) datos.clientes.push(c);
  } else {
    return;
  }
  await guardar();
  aviso(boton === 'borrar' ? 'Cliente borrado' : 'Cliente guardado');
}

async function editarVino(id) {
  const v = D.porId(datos.vinos, id) || { id: D.nuevoId(), nombre: '', activo: true };
  const esNuevo = !D.porId(datos.vinos, id);
  const usado = datos.visitas.some((x) => x.lineas.some((l) => l.vinoId === v.id) || (x.pendiente && x.pendiente.lineas.some((l) => l.vinoId === v.id)));
  const cuerpo = campo('Nombre del vino', 'nombre', v.nombre) +
    `<label class="casilla"><input type="checkbox" name="activo"${v.activo ? ' checked' : ''}>Mostrar en la lista para elegir</label>`;
  const botones = [{ valor: 'cancelar', texto: 'Cancelar' }, { valor: 'guardar', texto: 'Guardar', clase: 'principal' }];
  if (!esNuevo) botones.unshift({ valor: 'borrar', texto: 'Borrar', clase: 'peligro' });
  const { boton, valores } = await abrirDialogo(esNuevo ? 'Nuevo vino' : 'Editar vino', cuerpo, botones);
  if (boton === 'borrar') {
    if (usado) { aviso('No se puede borrar: ya está en visitas. Quita la marca de «Mostrar» para ocultarlo.', true); return; }
    if (!confirm(`¿Borrar ${v.nombre}?`)) return;
    datos.vinos = datos.vinos.filter((x) => x.id !== v.id);
  } else if (boton === 'guardar') {
    if (!valores.nombre) { aviso('Falta el nombre del vino.', true); return; }
    Object.assign(v, { nombre: valores.nombre, activo: valores.activo });
    if (esNuevo) datos.vinos.push(v);
  } else {
    return;
  }
  await guardar();
  aviso('Vinos actualizados');
}

async function editarSalida(id) {
  const x = D.porId(datos.agenda, id) || { id: D.nuevoId(), fecha: '', distribuidorId: '', comercialId: '', lugar: '', nota: '' };
  const esNueva = !D.porId(datos.agenda, id);
  const comerciales = ordenar(datos.distribuidores).map((d) => {
    const lista = comercialesDe(d.id);
    return lista.length ? `<optgroup label="${esc(d.nombre)}">${opciones(lista, x.comercialId)}</optgroup>` : '';
  }).join('');
  const cuerpo = `<label>Fecha<input type="date" name="fecha" value="${esc(x.fecha)}"></label>
    <label>Distribuidor<select name="distribuidorId"><option value="">— Sin decidir —</option>${opciones(ordenar(datos.distribuidores), x.distribuidorId)}</select></label>
    ${campo('…o escribe un distribuidor nuevo', 'distribuidorNuevo', '', 'placeholder="Si no está en la lista"')}
    <label>Comercial<select name="comercialId"><option value="">— Sin comercial —</option>${comerciales}</select></label>
    ${campo('…o escribe un comercial nuevo', 'comercialNuevo', '', 'placeholder="Si no está en la lista"')}
    ${campo('Lugar', 'lugar', x.lugar, 'list="lista-provincias"')}
    ${campo('Nota', 'nota', x.nota, 'placeholder="Ej.: showroom, cata con restaurantes"')}
    ${listasSugerencias()}`;
  const botones = [{ valor: 'cancelar', texto: 'Cancelar' }, { valor: 'guardar', texto: 'Guardar', clase: 'principal' }];
  if (!esNueva) botones.unshift({ valor: 'borrar', texto: 'Borrar', clase: 'peligro' });
  const { boton, valores } = await abrirDialogo(esNueva ? 'Nueva salida' : 'Editar salida', cuerpo, botones);
  if (boton === 'borrar') {
    if (!confirm('¿Borrar esta salida de la agenda?')) return;
    datos.agenda = datos.agenda.filter((s) => s.id !== x.id);
  } else if (boton === 'guardar') {
    if (!valores.fecha) { aviso('Pon la fecha de la salida.', true); return; }
    if (valores.distribuidorNuevo) {
      const mismo = datos.distribuidores.find((d) => D.normalizar(d.nombre) === D.normalizar(valores.distribuidorNuevo));
      if (mismo) {
        valores.distribuidorId = mismo.id;
      } else {
        valores.distribuidorId = D.nuevoId();
        datos.distribuidores.push({ id: valores.distribuidorId, nombre: valores.distribuidorNuevo, provincia: '', zona: '' });
      }
      // Un comercial elegido de la lista sería de otro distribuidor.
      if (!valores.comercialNuevo) valores.comercialId = '';
    }
    if (valores.comercialNuevo) {
      if (!valores.distribuidorId) { aviso('Elige el distribuidor del comercial nuevo.', true); return; }
      const mismo = comercialesDe(valores.distribuidorId).find((c) => D.normalizar(c.nombre) === D.normalizar(valores.comercialNuevo));
      if (mismo) {
        valores.comercialId = mismo.id;
      } else {
        valores.comercialId = D.nuevoId();
        datos.comerciales.push({ id: valores.comercialId, distribuidorId: valores.distribuidorId, nombre: valores.comercialNuevo, telefono: '' });
      }
    }
    // El comercial manda: si se elige, el distribuidor es el suyo.
    const com = D.porId(datos.comerciales, valores.comercialId);
    Object.assign(x, {
      fecha: valores.fecha, distribuidorId: com ? com.distribuidorId : valores.distribuidorId,
      comercialId: valores.comercialId, lugar: valores.lugar, nota: valores.nota,
    });
    if (esNueva) datos.agenda.push(x);
  } else {
    return;
  }
  await guardar();
  aviso(boton === 'borrar' ? 'Salida borrada' : 'Agenda guardada');
}

// ---------- Exportar e importar ----------

// En el iPhone abre el menú de compartir (Correo, Archivos, WhatsApp...);
// donde no se pueda, descarga el fichero. Debe llamarse nada más tocar el
// botón: Safari solo deja compartir como respuesta directa a un toque.
async function entregarFichero(nombre, texto, tipo) {
  const fichero = new File([texto], nombre, { type: tipo });
  if (navigator.canShare && navigator.canShare({ files: [fichero] })) {
    try {
      await navigator.share({ files: [fichero], title: nombre });
      return true;
    } catch (e) {
      if (e.name === 'AbortError') return false;
    }
  }
  const url = URL.createObjectURL(fichero);
  const enlace = document.createElement('a');
  enlace.href = url;
  enlace.download = nombre;
  document.body.appendChild(enlace);
  enlace.click();
  enlace.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
  return true;
}

async function copiaJSON() {
  const ahora = new Date().toISOString();
  const copia = D.crearCopia(Object.assign({}, datos, { ajustes: Object.assign({}, datos.ajustes, { ultimaCopia: ahora }) }));
  if (await entregarFichero(`copia-visitas-luis-${D.hoyISO()}.json`, copia, 'application/json')) {
    datos.ajustes.ultimaCopia = ahora;
    await guardar();
    aviso('Copia guardada');
    pintar();
  }
}

async function importar(input) {
  const fichero = input.files && input.files[0];
  input.value = '';
  if (!fichero) return;
  let nuevos;
  try {
    nuevos = D.leerCopia(await fichero.text());
  } catch (e) {
    aviso(e.message, true);
    return;
  }
  const mensaje = `Vas a cambiar TODOS los datos de este teléfono por los de la copia (${plural(nuevos.visitas.length, 'visita', 'visitas')}, ${plural(nuevos.clientes.length, 'cliente', 'clientes')}). Lo que hay ahora se perderá. ¿Seguir?`;
  if (!confirm(mensaje)) return;
  datos = nuevos;
  if (await guardar()) aviso('Copia restaurada');
  pintar();
}

// ---------- Acciones de los botones ----------

const acciones = {
  nuevaVisita() { location.hash = '#visita'; },
  volver() { borrador = null; location.hash = rutaAnterior; },

  resultado(el) { borrador.resultado = el.dataset.valor; repintar(); },
  tipoPendiente(el) { borrador.pendiente.tipo = el.dataset.valor; repintar(); },
  plazo(el) {
    const base = /^\d{4}-\d{2}-\d{2}$/.test(borrador.fecha) ? borrador.fecha : D.hoyISO();
    borrador.pendiente.fechaPrevista = D.sumarDias(base, Number(el.dataset.dias));
    repintar();
  },

  anadirVino(el) {
    const lista = leerCampo(borrador, el.dataset.campoLista);
    lista.push({ vinoId: el.dataset.vino, anada: D.ultimaAnada(datos, el.dataset.vino), cantidad: '', unidad: 'botellas' });
    repintar();
    const campos = document.querySelectorAll(`[data-campo^="${el.dataset.campoLista}."]`);
    if (el.dataset.campoLista === 'lineas' && campos.length) campos[campos.length - 1].focus();
  },
  quitarLinea(el) { leerCampo(borrador, el.dataset.campoLista).splice(Number(el.dataset.i), 1); repintar(); },
  mas(el) { const l = leerCampo(borrador, el.dataset.campoLista)[el.dataset.i]; l.cantidad = (parseInt(l.cantidad, 10) || 0) + 1; repintar(); },
  menos(el) { const l = leerCampo(borrador, el.dataset.campoLista)[el.dataset.i]; l.cantidad = Math.max(0, (parseInt(l.cantidad, 10) || 0) - 1) || ''; repintar(); },
  cambiarUnidad(el) { const l = leerCampo(borrador, el.dataset.campoLista)[el.dataset.i]; l.unidad = l.unidad === 'cajas' ? 'botellas' : 'cajas'; repintar(); },

  elegirCliente(el) { borrador.clienteId = el.dataset.id; borrador.clienteNuevo = null; repintar(); },
  cambiarCliente() { borrador.clienteId = ''; borrador.busqueda = ''; repintar(); },
  crearCliente() {
    const zona = ultimaZona(borrador.distribuidorId);
    borrador.clienteNuevo = { nombre: borrador.busqueda.trim(), tipo: '', poblacion: '', provincia: zona.provincia, zona: zona.zona, contacto: '' };
    repintar();
    const nombre = document.querySelector('[data-campo="clienteNuevo.nombre"]');
    if (nombre) (borrador.clienteNuevo.nombre ? document.querySelector('[data-campo="clienteNuevo.poblacion"]') : nombre).focus();
  },
  cancelarClienteNuevo() { borrador.clienteNuevo = null; repintar(); },

  guardarVisita() { guardarVisitaFormulario(); },
  async borrarVisita() {
    if (!confirm('¿Borrar esta visita? No se puede deshacer.')) return;
    D.borrarVisita(datos, borrador.id);
    borrador = null;
    if (await guardar()) aviso('Visita borrada');
    location.hash = rutaAnterior;
  },

  venderPendiente(el) { location.hash = '#vender/' + el.dataset.id; },
  async posponer(el) { D.posponerPendiente(datos, el.dataset.id, 15, D.hoyISO()); await guardar(); aviso('Pospuesto 15 días'); repintar(); },
  async descartar(el) {
    if (!confirm('¿Dar por perdido este pendiente? Lo verás en «Cerrados».')) return;
    D.descartarPendiente(datos, el.dataset.id, D.hoyISO()); await guardar(); aviso('Pendiente descartado'); repintar();
  },
  async reabrir(el) { D.reabrirPendiente(datos, el.dataset.id); await guardar(); aviso('Pendiente abierto otra vez'); repintar(); },
  verPendientes(el) { vistaPendientes.cerrados = el.dataset.valor === 'cerrados'; repintar(); },

  periodo(el) { consulta.periodo = el.dataset.valor; repintar(); },
  verPor(el) { consulta.verPor = el.dataset.valor; repintar(); },
  quitarFiltros() { Object.assign(consulta, { periodo: 'todo', desde: '', hasta: '', distribuidorId: '', comercialId: '', provincia: '', zona: '', resultado: '', texto: '' }); repintar(); },
  exportarConsulta() { entregarFichero(`visitas-luis-filtradas-${D.hoyISO()}.csv`, D.exportarCSV(datos, visitasConsultadas()), 'text/csv'); },

  copiaJSON() { copiaJSON(); },
  async configurarNube() { await configurarNube(); },
  sincronizarYa() {
    if (conexion.modo === 'subir') conexion.pendiente = true;
    conexion.error = '';
    sincronizar();
    aviso(conexion.modo === 'subir' ? 'Subiendo…' : 'Actualizando…');
  },
  exportarCSV() { entregarFichero(`visitas-luis-${D.hoyISO()}.csv`, D.exportarCSV(datos), 'text/csv'); },
  async editarDistribuidor(el) { await editarDistribuidor(el.dataset.id); repintar(); },
  async editarCliente(el) { await editarCliente(el.dataset.id); repintar(); },
  async editarVino(el) { await editarVino(el.dataset.id); repintar(); },
  otraFilaComercial() {
    document.getElementById('filas-comerciales').insertAdjacentHTML('beforeend', filaComercial({ id: 'nuevo' + D.nuevoId(), nombre: '', telefono: '' }));
  },
  async borrarEjemplo() {
    if (!confirm('¿Borrar todos los datos de ejemplo? Tus datos de verdad no se tocan.')) return;
    const conservados = D.borrarEjemplo(datos);
    await guardar();
    aviso(conservados ? `Ejemplo borrado. Se han dejado ${conservados} elementos de ejemplo porque los usan visitas tuyas.` : 'Datos de ejemplo borrados');
    repintar();
  },
  async editarSalida(el) { await editarSalida(el.dataset.id); repintar(); },
  async salirCon(el) {
    const x = D.porId(datos.agenda, el.dataset.id);
    datos.ajustes.salida = { distribuidorId: x.distribuidorId, comercialId: x.comercialId || '' };
    await guardar();
    repintar();
  },
  async cargarEjemplo() { D.cargarEjemplo(datos, D.hoyISO()); await guardar(); aviso('Datos de ejemplo cargados'); repintar(); },
};

// Cambios en desplegables y casillas
const cambios = {
  async salidaDistribuidor(el) {
    let id = el.value;
    if (id === '__nuevo') id = await editarDistribuidor('');
    if (id !== null) datos.ajustes.salida = { distribuidorId: id, comercialId: '' };
    await guardar();
    repintar();
  },
  async salidaComercial(el) {
    const salida = datos.ajustes.salida;
    let id = el.value;
    if (id === '__nuevo') id = await nuevoComercial(salida.distribuidorId);
    if (id !== null) salida.comercialId = id;
    await guardar();
    repintar();
  },
  pendientesDistribuidor(el) { vistaPendientes.distribuidorId = el.value; repintar(); },
  importar(el) { importar(el); },
};

async function alCambiarCampoVisita(el) {
  const ruta = el.dataset.campo;
  if (ruta === 'distribuidorId' && el.value === '__nuevo') {
    const id = await editarDistribuidor('');
    if (id) { borrador.distribuidorId = id; borrador.comercialId = ''; }
    repintar();
    return;
  }
  if (ruta === 'comercialId' && el.value === '__nuevo') {
    const id = await nuevoComercial(borrador.distribuidorId);
    if (id) borrador.comercialId = id;
    repintar();
    return;
  }
  ponerCampo(borrador, ruta, el.type === 'checkbox' ? el.checked : el.value);
  if (ruta === 'distribuidorId') { borrador.comercialId = ''; repintar(); }
  if (ruta === 'conPendiente' || ruta === 'fecha' || ruta === 'pendiente.fechaPrevista') repintar();
}

document.addEventListener('click', (e) => {
  const el = e.target.closest('[data-accion]');
  if (!el || !acciones[el.dataset.accion]) return;
  e.preventDefault();
  acciones[el.dataset.accion](el);
});

document.addEventListener('change', (e) => {
  const el = e.target;
  if (el.dataset.cambio && cambios[el.dataset.cambio]) cambios[el.dataset.cambio](el);
  else if (el.dataset.campo && borrador && el.dataset.campo !== 'busqueda' && el.tagName !== 'TEXTAREA' && el.type !== 'number' && el.type !== 'text') alCambiarCampoVisita(el);
  else if (el.dataset.filtro) {
    consulta[el.dataset.filtro] = el.value;
    if (el.dataset.filtro === 'distribuidorId') consulta.comercialId = '';
    repintar();
  }
});

// Lo que se escribe se va guardando en el borrador sin repintar (así no se pierde el foco).
document.addEventListener('input', (e) => {
  const el = e.target;
  if (el.dataset.campo && borrador) {
    if (el.tagName === 'SELECT' || el.type === 'checkbox' || el.type === 'date') return;
    ponerCampo(borrador, el.dataset.campo, el.value);
    if (el.dataset.campo === 'busqueda') document.getElementById('resultados-cliente').innerHTML = resultadosCliente();
  } else if (el.hasAttribute('data-filtro-texto')) {
    consulta.texto = el.value;
    document.getElementById('resultados-consulta').innerHTML = resultadosConsulta();
  } else if (el.hasAttribute('data-buscar-clientes')) {
    busquedaClientesAjustes = el.value;
    document.getElementById('lista-clientes-ajustes').innerHTML = listaClientesAjustes();
  }
});

// ---------- Navegación entre pantallas ----------

function actualizarGlobo() {
  const abiertos = D.pendientesAbiertas(datos);
  const hoy = D.hoyISO();
  const globo = document.getElementById('globo');
  globo.hidden = abiertos.length === 0;
  globo.textContent = abiertos.length;
  globo.classList.toggle('urgente', abiertos.some((v) => v.pendiente.fechaPrevista && v.pendiente.fechaPrevista <= hoy));
}

function pintar() {
  const [nombre, id] = location.hash.slice(1).split('/');
  const main = document.getElementById('pantalla');
  let html;
  const enFormulario = nombre === 'visita' || nombre === 'vender';
  if (enFormulario) {
    const clave = location.hash;
    if (!borrador || borrador.ruta !== clave) {
      if (nombre === 'vender') {
        const origen = D.porId(datos.visitas, id);
        if (!origen || !origen.pendiente) { location.hash = '#pendientes'; return; }
        borrador = borradorDeVenta(origen);
      } else if (id) {
        const visita = D.porId(datos.visitas, id);
        if (!visita) { location.hash = '#hoy'; return; }
        borrador = borradorDeVisita(visita);
      } else {
        borrador = borradorNuevo();
      }
      borrador.ruta = clave;
    }
    html = pantallaVisita();
  } else {
    borrador = null;
    const pantallas = { hoy: pantallaHoy, agenda: pantallaAgenda, pendientes: pantallaPendientes, consultar: pantallaConsultar, ajustes: pantallaAjustes };
    html = (pantallas[nombre] || pantallaHoy)();
  }
  main.innerHTML = bandaNube() + html;
  document.body.classList.toggle('en-formulario', enFormulario);
  const pestana = enFormulario ? '' : (nombre || 'hoy');
  document.querySelectorAll('#pestanas a').forEach((a) => a.classList.toggle('activa', a.dataset.pestana === pestana));
  actualizarGlobo();
}

// Repinta la misma pantalla sin mover el scroll.
function repintar() {
  const y = window.scrollY;
  pintar();
  window.scrollTo(0, y);
}

window.addEventListener('hashchange', (e) => {
  const anterior = new URL(e.oldURL).hash || '#hoy';
  if (!anterior.startsWith('#visita') && !anterior.startsWith('#vender')) rutaAnterior = anterior;
  pintar();
  window.scrollTo(0, 0);
});

async function arrancar() {
  try {
    bd = await abrirBD();
    datos = await leerDatos();
  } catch (e) {
    document.getElementById('pantalla').innerHTML = '<p class="vacio">No se puede abrir el almacén de datos del teléfono. Si estás en navegación privada, ábrela en modo normal.</p>';
    return;
  }
  if (!datos) {
    datos = D.datosVacios();
    await guardar();
  }
  if (!Array.isArray(datos.agenda)) datos.agenda = [];
  conexion = Object.assign(conexion, await leerConexion());
  if (navigator.storage && navigator.storage.persist) navigator.storage.persist();
  if ('serviceWorker' in navigator && location.protocol !== 'file:') navigator.serviceWorker.register('sw.js');
  pintar();
  sincronizar();
  setInterval(sincronizar, 30000);
  window.addEventListener('online', sincronizar);
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') sincronizar(); });
}

arrancar();
