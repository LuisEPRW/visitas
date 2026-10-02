// Copia de los datos en un repositorio PRIVADO de GitHub, para que el jefe
// vea desde cualquier sitio lo que apunta Luis. La llave de GitHub la escribe
// cada persona en Ajustes y se queda solo en ese aparato: nunca va en el código
// ni en las copias de seguridad.
// Funciona en el navegador (objeto global N) y en Node (pruebas).

const API_GITHUB = 'https://api.github.com';

function cabecerasGitHub(llave, crudo) {
  return {
    Authorization: 'Bearer ' + llave,
    Accept: crudo ? 'application/vnd.github.raw+json' : 'application/vnd.github+json',
  };
}

function urlArchivoNube(repo, archivo) {
  return `${API_GITHUB}/repos/${repo}/contents/${archivo}`;
}

function aBase64(texto) {
  const bytes = new TextEncoder().encode(texto);
  let binario = '';
  for (let i = 0; i < bytes.length; i += 0x8000) binario += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  return btoa(binario);
}

function errorGitHub(respuesta) {
  if (respuesta.status === 401) return new Error('La llave de GitHub no vale o ha caducado.');
  if (respuesta.status === 403 || respuesta.status === 404) {
    return new Error('La llave no tiene permiso para ese repositorio, o el repositorio no existe.');
  }
  return new Error('GitHub ha respondido con un error (' + respuesta.status + ').');
}

// Comprueba la llave y que el repositorio sea privado.
async function probarNube(repo, llave) {
  const r = await fetch(`${API_GITHUB}/repos/${repo}`, { headers: cabecerasGitHub(llave), cache: 'no-store' });
  if (!r.ok) throw errorGitHub(r);
  const info = await r.json();
  if (!info.private) throw new Error('Ese repositorio es público: los datos quedarían a la vista. Ponlo privado.');
  return true;
}

// Identificador de la versión que hay ahora en GitHub ('' si aún no hay nada).
async function shaNube(repo, llave, archivo) {
  const r = await fetch(urlArchivoNube(repo, archivo), { headers: cabecerasGitHub(llave), cache: 'no-store' });
  if (r.status === 404) return '';
  if (!r.ok) throw errorGitHub(r);
  return (await r.json()).sha;
}

// Sube el texto. Si otro aparato subió entre medias, se vuelve a intentar con
// la versión nueva (manda siempre lo último de este aparato).
async function subirNube(repo, llave, archivo, texto, sha) {
  const cuerpo = { message: 'Visitas ' + new Date().toISOString().slice(0, 16).replace('T', ' '), content: aBase64(texto) };
  const enviar = () => fetch(urlArchivoNube(repo, archivo), {
    method: 'PUT', headers: cabecerasGitHub(llave), body: JSON.stringify(cuerpo),
  });
  if (sha) cuerpo.sha = sha;
  let r = await enviar();
  if (r.status === 409 || r.status === 422) {
    const actual = await shaNube(repo, llave, archivo);
    if (actual) cuerpo.sha = actual; else delete cuerpo.sha;
    r = await enviar();
  }
  if (!r.ok) throw errorGitHub(r);
  return (await r.json()).content.sha;
}

// Devuelve el texto guardado en GitHub, o null si aún no hay nada.
async function bajarNube(repo, llave, archivo) {
  const r = await fetch(urlArchivoNube(repo, archivo), { headers: cabecerasGitHub(llave, true), cache: 'no-store' });
  if (r.status === 404) return null;
  if (!r.ok) throw errorGitHub(r);
  return r.text();
}

const N = { probarNube, shaNube, subirNube, bajarNube, aBase64 };
if (typeof module !== 'undefined') module.exports = N;
