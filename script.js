const $ = (id) => document.getElementById(id);
const arte = $("arte"), vacio = $("vacio"), ventana = $("ventana"), archivo = $("archivo");
const FACTOR_ALTURA = 0.5; // los caracteres son ~2x más altos que anchos
const MAX_CUADROS = 300;   // límite de cuadros de un GIF
const sinMovimiento = matchMedia("(prefers-reduced-motion: reduce)");

let cuadros = [];          // [{ fuente, duracion }]: una imagen tiene 1 cuadro, un GIF varios
let indice = 0;            // cuadro que se está mostrando
let temporizador = null;   // reproducción del GIF
let animId = null;         // animación de entrada (descifrar / escribir)
let pausado = false;
let archivoActual = null;  // archivo original (imagen o GIF) que se está viendo
let cache = new Map();     // cuadro -> resultado ya convertido
let texto = "";            // texto plano del cuadro actual

// ---------- Armar texto / html a partir de una cuadrícula de caracteres ----------
function armar(filas, colores) {
  const texto = filas.map((f) => f.join("")).join("\n");
  if (!colores) return { texto, html: "" };
  let html = "";
  for (let y = 0; y < filas.length; y++) {
    let tramo = "", colorTramo = "";
    for (let x = 0; x < filas[y].length; x++) {
      const col = colores[y][x];
      if (col !== colorTramo) { // cambió el color: cerramos el tramo anterior
        if (tramo) html += `<span style="color:${colorTramo}">${tramo}</span>`;
        tramo = ""; colorTramo = col;
      }
      tramo += filas[y][x];
    }
    if (tramo) html += `<span style="color:${colorTramo}">${tramo}</span>`;
    html += "\n";
  }
  return { texto, html };
}

function rampaActual() {
  const rampa = [...$("rampa").value];
  if ($("invertir").checked) rampa.reverse();
  return rampa;
}

// Color del carácter en el estilo luminoso: más saturado y con brillo según el píxel
function colorLuz(r, g, b, bn, q) {
  const gris = 0.299 * r + 0.587 * g + 0.114 * b;
  const sat = (v) => Math.max(0, Math.min(255, gris + (v - gris) * 1.5));
  r = sat(r); g = sat(g); b = sat(b);
  const k = (110 + 145 * bn) / Math.max(r, g, b, 1);
  return `rgb(${q(r * k)},${q(g * k)},${q(b * k)})`;
}

// ---------- Conversión de UN cuadro a ASCII ----------
function convertirCuadro(fuente, conGrid = cuadros.length === 1) {
  const ancho = +$("ancho").value;
  const alto = Math.max(1, Math.round(ancho * (fuente.height / fuente.width) * FACTOR_ALTURA));

  const canvas = document.createElement("canvas");
  canvas.width = ancho;
  canvas.height = alto;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  ctx.fillStyle = "#fff"; // fondo blanco para transparencias
  ctx.fillRect(0, 0, ancho, alto);
  ctx.drawImage(fuente, 0, 0, ancho, alto);
  const datos = ctx.getImageData(0, 0, ancho, alto).data;

  const rampa = rampaActual();
  const pasos = rampa.length - 1;
  const conColor = $("color").checked;
  const cuantizar = (v) => Math.min(255, Math.round(v / 16) * 16); // menos tonos = menos <span>

  const luminoso = $("estilo").value === "luminoso";
  const corte = luminoso ? (+$("corte").value / 100) * 255 : 0;
  const filas = [], colores = [];
  for (let y = 0; y < alto; y++) {
    const fila = [], filaColor = [];
    for (let x = 0; x < ancho; x++) {
      const i = (y * ancho + x) * 4;
      const r = datos[i], g = datos[i + 1], b = datos[i + 2];
      const brillo = 0.299 * r + 0.587 * g + 0.114 * b;
      if (luminoso) {
        if (brillo < corte) { // zona oscura: se deja vacía para que el sujeto resalte
          fila.push(" ");
          if (conColor) filaColor.push(filaColor.length ? filaColor[filaColor.length - 1] : "rgb(0,0,0)");
          continue;
        }
        const bn = (brillo - corte) / (255 - corte); // 0 a 1 entre el corte y el blanco
        fila.push(rampa[Math.round((1 - bn) * pasos)]); // más brillo = carácter más denso
        if (conColor) filaColor.push(colorLuz(r, g, b, bn, cuantizar));
      } else {
        fila.push(rampa[Math.round((brillo / 255) * pasos)]);
        if (conColor) filaColor.push(`rgb(${cuantizar(r)},${cuantizar(g)},${cuantizar(b)})`);
      }
    }
    filas.push(fila);
    colores.push(filaColor);
  }
  const r = armar(filas, conColor ? colores : null);
  // La cuadrícula solo se guarda cuando se necesita (efectos e imagen PNG)
  if (conGrid) { r.filas = filas; r.colores = conColor ? colores : null; }
  return r;
}

// ---------- Mostrar y reproducir ----------
function pintar(r) {
  if (r.html) arte.innerHTML = r.html; else arte.textContent = r.texto;
}

function mostrar(i) {
  indice = i;
  let r = cache.get(i);
  if (!r) { r = convertirCuadro(cuadros[i].fuente); cache.set(i, r); }
  texto = r.texto; // "Copiar" y "Descargar" usan el cuadro actual en texto plano
  pintar(r);
  ajustarTamano(+$("ancho").value);
}

function reproducir() {
  clearTimeout(temporizador);
  mostrar(indice);
  if (cuadros.length < 2 || pausado) return;
  const d = cuadros[indice].duracion;
  temporizador = setTimeout(() => { indice = (indice + 1) % cuadros.length; reproducir(); }, d < 20 ? 100 : d);
}

// Al cambiar un ajuste hay que volver a convertir los cuadros
function refrescar() {
  if (!cuadros.length) return;
  cancelarAnim();
  cache.clear();
  reproducir();
}

function ajustarTamano(ancho) {
  const disponible = arte.parentElement.clientWidth - 40;
  const tam = Math.max(3, Math.min(14, disponible / ancho / 0.6));
  arte.style.fontSize = tam.toFixed(2) + "px";
}

// ---------- Efectos ----------
const esReveal = () => ["descifrar", "escribir"].includes($("efecto").value);

function cancelarAnim() {
  cancelAnimationFrame(animId);
  animId = null;
}

// "Descifrar": caracteres al azar que se acomodan. "Escribir": aparece de arriba hacia abajo.
// Cada celda tiene un umbral y se muestra cuando el progreso (0 a 1) lo pasa.
function prepararEntrada(r, modo) {
  const alto = r.filas.length, ancho = r.filas[0].length;
  const azarosos = rampaActual().filter((c) => c !== " ");
  const azar = () => azarosos[Math.floor(Math.random() * azarosos.length)];
  const umbral = r.filas.map((fila, y) => fila.map((_, x) =>
    modo === "escribir" ? (y * ancho + x) / (alto * ancho) : Math.random() * 0.75 + (x / ancho) * 0.25));
  return { umbral, azar, duracion: modo === "escribir" ? 1800 : 1600 };
}

function cuadroEntrada(r, modo, umbral, azar, p) {
  return r.filas.map((fila, y) => fila.map((c, x) =>
    p >= umbral[y][x] ? c : (modo === "escribir" ? " " : azar())));
}

// Solo para imágenes fijas
function animarEntrada() {
  cancelarAnim();
  const modo = $("efecto").value;
  if (cuadros.length !== 1 || !esReveal() || sinMovimiento.matches) return;
  const r = cache.get(0);
  if (!r || !r.filas) return;

  const { umbral, azar, duracion } = prepararEntrada(r, modo);
  const t0 = performance.now();
  let ultimo = 0;
  function paso(ahora) {
    const p = Math.min(1, (ahora - t0) / duracion);
    if (ahora - ultimo > 40 || p === 1) { // ~25 cuadros por segundo
      ultimo = ahora;
      pintar(armar(cuadroEntrada(r, modo, umbral, azar, p), r.colores));
    }
    animId = p < 1 ? requestAnimationFrame(paso) : null;
  }
  animId = requestAnimationFrame(paso);
}

// Aplica el efecto elegido: "brillo" es un barrido de luz (CSS), los demás se animan al cargar
function actualizarEfecto() {
  ventana.classList.toggle("brillo", $("efecto").value === "brillo");
  $("repetir").hidden = !(cuadros.length === 1 && esReveal());
  $("descargarGif").hidden = !(cuadros.length > 1 || (cuadros.length === 1 && esReveal()));
}

// Muestra u oculta el control de "zonas oscuras" y aplica el resplandor
function actualizarEstilo() {
  $("cajaCorte").hidden = $("estilo").value !== "luminoso";
  $("corteVal").textContent = $("corte").value + "%";
  arte.classList.toggle("luz", $("luz").checked);
}

// ---------- Cargar imagen o GIF ----------
function imagenEstatica(file) {
  return new Promise((ok, fallo) => {
    const img = new Image();
    img.onload = () => ok([{ fuente: img, duracion: 0 }]);
    img.onerror = fallo;
    img.src = URL.createObjectURL(file);
  });
}

// ImageDecoder (Chrome/Edge) entrega cada cuadro del GIF ya armado
async function decodificarGif(file) {
  const decoder = new ImageDecoder({ data: await file.arrayBuffer(), type: "image/gif" });
  await decoder.tracks.ready;
  const total = Math.min(decoder.tracks.selectedTrack.frameCount, MAX_CUADROS);
  const lista = [];
  for (let i = 0; i < total; i++) {
    const { image } = await decoder.decode({ frameIndex: i });
    const bmp = await createImageBitmap(image);
    lista.push({ fuente: bmp, duracion: (image.duration || 100000) / 1000 }); // microsegundos -> ms
    image.close();
  }
  decoder.close();
  return lista;
}

async function cargar(file) {
  if (!file || !file.type.startsWith("image/")) return;
  clearTimeout(temporizador);
  cancelarAnim();
  cache.clear();
  pausado = false;
  $("pausa").textContent = "Pausar";

  try {
    if (file.type === "image/gif" && "ImageDecoder" in window) {
      cuadros = await decodificarGif(file);
    } else {
      if (file.type === "image/gif") alert("Este navegador no puede animar GIFs. Usa Chrome o Edge; por ahora se muestra el primer cuadro.");
      cuadros = await imagenEstatica(file);
    }
  } catch (e) {
    alert("No se pudo leer ese archivo.");
    return;
  }

  archivoActual = file;
  indice = 0;
  $("pausa").hidden = cuadros.length < 2;
  arte.style.display = "block";
  vacio.style.display = "none";
  $("copiar").disabled = $("descargarPng").disabled = $("guardar").disabled = false;
  actualizarEfecto();
  reproducir();
  animarEntrada();
}

// ---------- Eventos ----------
$("elegir").addEventListener("click", () => archivo.click());
archivo.addEventListener("change", () => cargar(archivo.files[0]));

["dragenter", "dragover"].forEach((ev) => ventana.addEventListener(ev, (e) => { e.preventDefault(); ventana.classList.add("sobre"); }));
["dragleave", "drop"].forEach((ev) => ventana.addEventListener(ev, (e) => { e.preventDefault(); ventana.classList.remove("sobre"); }));
ventana.addEventListener("drop", (e) => cargar(e.dataTransfer.files[0]));

$("ancho").addEventListener("input", () => { $("anchoVal").textContent = $("ancho").value; refrescar(); });
$("rampa").addEventListener("change", refrescar);
$("invertir").addEventListener("change", refrescar);
$("color").addEventListener("change", refrescar);
$("estilo").addEventListener("change", () => { actualizarEstilo(); refrescar(); });
$("corte").addEventListener("input", () => { actualizarEstilo(); refrescar(); });
$("luz").addEventListener("change", actualizarEstilo);
$("efecto").addEventListener("change", () => { actualizarEfecto(); refrescar(); animarEntrada(); });
$("repetir").addEventListener("click", () => { refrescar(); animarEntrada(); });
window.addEventListener("resize", () => cuadros.length && ajustarTamano(+$("ancho").value));

$("pausa").addEventListener("click", () => {
  pausado = !pausado;
  $("pausa").textContent = pausado ? "Reproducir" : "Pausar";
  if (pausado) clearTimeout(temporizador); else reproducir();
});

$("copiar").addEventListener("click", async () => {
  await navigator.clipboard.writeText(texto);
  const b = $("copiar"); b.textContent = "Copiado"; setTimeout(() => (b.textContent = "Copiar"), 1200);
});

// Guardar como imagen PNG (cuadro actual)
$("descargarPng").addEventListener("click", () => {
  const r = convertirCuadro(cuadros[indice].fuente, true);
  dibujarArte(r.filas, r.colores, 28, false, $("luz").checked).toBlob((blob) => descargarBlob(blob, "arte-ascii.png"), "image/png");
});

// ---------- Exportar GIF ----------
// Dibuja una cuadrícula de caracteres sobre un canvas (tam = tamaño de letra en píxeles)
function dibujarArte(filas, colores, tam, leer = false, luz = false) {
  const fuente = `${tam}px "Cascadia Mono", Consolas, "Courier New", monospace`;
  const ancho = filas[0].length, alto = filas.length;
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d", { willReadFrequently: leer });
  ctx.font = fuente;
  const anchoCar = ctx.measureText("M").width; // en fuente monoespaciada todos miden lo mismo
  const margen = tam;
  canvas.width = Math.ceil(ancho * anchoCar + margen * 2);
  canvas.height = Math.ceil(alto * tam + margen * 2);

  ctx.fillStyle = "#050507"; // mismo fondo oscuro de la página
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.font = fuente; // al cambiar el tamaño del canvas se reinicia la fuente
  ctx.textBaseline = "top";
  for (let y = 0; y < alto; y++) {
    for (let x = 0; x < ancho; x++) {
      const c = filas[y][x];
      if (c === " ") continue;
      const col = colores ? colores[y][x] : "#e6e6f0";
      ctx.fillStyle = col;
      if (luz) { ctx.shadowColor = col; ctx.shadowBlur = tam * 0.6; }
      ctx.fillText(c, margen + x * anchoCar, margen + y * tam);
    }
  }
  return canvas;
}

// Compresión LZW del formato GIF (códigos de 9 a 12 bits)
function lzw(indices) {
  const LIMPIAR = 256, FIN = 257;
  let bits = 9, siguiente = 258, tabla = new Map();
  const salida = [];
  let acum = 0, n = 0;
  const emitir = (codigo) => {
    acum |= codigo << n; n += bits;
    while (n >= 8) { salida.push(acum & 255); acum >>>= 8; n -= 8; }
  };
  emitir(LIMPIAR);
  let prefijo = indices[0];
  for (let i = 1; i < indices.length; i++) {
    const k = indices[i], clave = prefijo * 256 + k, codigo = tabla.get(clave);
    if (codigo !== undefined) { prefijo = codigo; continue; }
    emitir(prefijo);
    if (siguiente === 4096) { emitir(LIMPIAR); tabla = new Map(); siguiente = 258; bits = 9; }
    else { if (siguiente >= (1 << bits)) bits++; tabla.set(clave, siguiente++); }
    prefijo = k;
  }
  emitir(prefijo);
  emitir(FIN);
  if (n > 0) salida.push(acum & 255);
  return Uint8Array.from(salida);
}

// Escritor de GIF animado. Paleta: índice 0 = fondo, 1..216 = cubo de colores 6x6x6
function nuevoGif(w, h) {
  const partes = [];
  const cab = [];
  const w16 = (v) => cab.push(v & 255, (v >> 8) & 255);
  for (const c of "GIF89a") cab.push(c.charCodeAt(0));
  w16(w); w16(h); cab.push(0xf7, 0, 0);
  cab.push(5, 5, 7);
  for (let r = 0; r < 6; r++) for (let g = 0; g < 6; g++) for (let b = 0; b < 6; b++) cab.push(r * 51, g * 51, b * 51);
  while (cab.length < 13 + 768) cab.push(0);
  cab.push(0x21, 0xff, 0x0b);
  for (const c of "NETSCAPE2.0") cab.push(c.charCodeAt(0));
  cab.push(3, 1, 0, 0, 0); // repetir para siempre
  partes.push(Uint8Array.from(cab));
  return {
    agregar(indices, ms) {
      const cs = Math.max(2, Math.round(ms / 10)); // el GIF cuenta en centésimas de segundo
      partes.push(Uint8Array.from([0x21, 0xf9, 4, 0x04, cs & 255, (cs >> 8) & 255, 0, 0,
        0x2c, 0, 0, 0, 0, w & 255, w >> 8, h & 255, h >> 8, 0, 8]));
      const datos = lzw(indices);
      const bloques = new Uint8Array(datos.length + Math.ceil(datos.length / 255) + 1);
      let q = 0;
      for (let i = 0; i < datos.length; i += 255) {
        const m = Math.min(255, datos.length - i);
        bloques[q++] = m; bloques.set(datos.subarray(i, i + m), q); q += m;
      }
      partes.push(bloques);
    },
    terminar() { partes.push(Uint8Array.of(0x3b)); return new Blob(partes, { type: "image/gif" }); },
  };
}
// ---------- fin del escritor de GIF ----------

$("descargarGif").addEventListener("click", async () => {
  const boton = $("descargarGif"), etiqueta = boton.textContent;
  boton.disabled = true;
  try {
    const ancho = +$("ancho").value;
    const tam = Math.max(5, Math.min(14, Math.round(560 / ancho / 0.6))); // GIF más liviano que el PNG
    let total, obtener;
    if (cuadros.length > 1) { // GIF de origen: un cuadro ASCII por cada cuadro del GIF
      total = cuadros.length;
      obtener = (i) => {
        const r = convertirCuadro(cuadros[i].fuente, true), d = cuadros[i].duracion;
        return { filas: r.filas, colores: r.colores, ms: d < 20 ? 100 : d };
      };
    } else { // imagen fija: se exporta el efecto de entrada y el resultado se queda 2 segundos
      const modo = $("efecto").value;
      const r = cache.get(0) || convertirCuadro(cuadros[0].fuente, true);
      const { umbral, azar, duracion } = prepararEntrada(r, modo);
      const pasos = Math.round(duracion / 60);
      total = pasos + 1;
      obtener = (i) => ({
        filas: i === pasos ? r.filas : cuadroEntrada(r, modo, umbral, azar, i / pasos),
        colores: r.colores,
        ms: i === pasos ? 2000 : duracion / pasos,
      });
    }

    let gif = null;
    for (let i = 0; i < total; i++) {
      const f = obtener(i);
      const canvas = dibujarArte(f.filas, f.colores, tam, true);
      const w = canvas.width, h = canvas.height;
      if (!gif) gif = nuevoGif(w, h);
      const px = canvas.getContext("2d").getImageData(0, 0, w, h).data;
      const indices = new Uint8Array(w * h);
      for (let q = 0, p = 0; q < indices.length; q++, p += 4) {
        const idx = 1 + Math.round(px[p] / 51) * 36 + Math.round(px[p + 1] / 51) * 6 + Math.round(px[p + 2] / 51);
        indices[q] = idx === 1 ? 0 : idx; // el negro puro se vuelve el color de fondo
      }
      gif.agregar(indices, f.ms);
      boton.textContent = `Creando GIF… ${Math.round(((i + 1) / total) * 100)}%`;
      if (i % 3 === 2) await new Promise((ok) => setTimeout(ok)); // deja respirar a la página
    }
    descargarBlob(gif.terminar(), "arte-ascii.gif");
  } catch (e) {
    alert("No se pudo crear el GIF.");
  }
  boton.textContent = etiqueta;
  boton.disabled = false;
});

// ---------- Mi galería (se guarda en este navegador con IndexedDB) ----------
// Cada obra guarda el archivo original + los ajustes, y al abrirla se vuelve a generar.
const BD = "galeria-ascii", TIENDA = "obras";

function abrirBD() {
  return new Promise((ok, fallo) => {
    const rq = indexedDB.open(BD, 1);
    rq.onupgradeneeded = () => rq.result.createObjectStore(TIENDA, { keyPath: "id", autoIncrement: true });
    rq.onsuccess = () => ok(rq.result);
    rq.onerror = () => fallo(rq.error);
  });
}
async function operar(modo, fn) {
  const db = await abrirBD();
  return new Promise((ok, fallo) => {
    const t = db.transaction(TIENDA, modo);
    const rq = fn(t.objectStore(TIENDA));
    t.oncomplete = () => { db.close(); ok(rq.result); };
    t.onerror = () => fallo(t.error);
  });
}
const guardarObra = (o) => operar("readwrite", (t) => t.add(o));
const listarObras = () => operar("readonly", (t) => t.getAll());
const borrarObra = (id) => operar("readwrite", (t) => t.delete(id));

async function actualizarCuenta() {
  try { const n = (await listarObras()).length; $("cuenta").textContent = n ? `(${n})` : ""; } catch (e) {}
}

function irA(vista) {
  const galeria = vista === "galeria";
  $("vistaCrear").hidden = galeria;
  $("vistaGaleria").hidden = !galeria;
  document.querySelectorAll(".tab").forEach((b) => b.classList.toggle("activo", b.dataset.vista === vista));
  if (galeria) renderGaleria(); else if (cuadros.length) ajustarTamano(+$("ancho").value);
}

function tarjeta(o) {
  const el = document.createElement("article");
  el.className = "obra";

  const vista = document.createElement("div");
  vista.className = "vista";
  const pre = document.createElement("pre");
  pre.style.fontSize = Math.max(1.5, 216 / o.vista.ancho / 0.6).toFixed(2) + "px";
  if (o.vista.html) pre.innerHTML = o.vista.html; else pre.textContent = o.vista.texto;
  vista.append(pre);
  vista.addEventListener("click", () => abrirObra(o));

  const datos = document.createElement("div");
  datos.className = "datos";
  const h = document.createElement("h3");
  h.textContent = o.titulo;
  const f = document.createElement("span");
  f.className = "fecha";
  f.textContent = new Date(o.fecha).toLocaleDateString("es-MX", { day: "numeric", month: "short", year: "numeric" }) + (o.tipo === "image/gif" ? ", GIF" : "");

  const acciones = document.createElement("div");
  acciones.className = "acciones";
  const abrir = document.createElement("button");
  abrir.className = "mini"; abrir.textContent = "Abrir";
  abrir.addEventListener("click", () => abrirObra(o));
  const borrar = document.createElement("button");
  borrar.className = "mini"; borrar.textContent = "Borrar";
  borrar.addEventListener("click", async () => {
    if (!confirm(`¿Borrar “${o.titulo}”?`)) return;
    await borrarObra(o.id);
    renderGaleria();
  });
  acciones.append(abrir, borrar);

  datos.append(h, f, acciones);
  el.append(vista, datos);
  return el;
}

async function renderGaleria() {
  const rejilla = $("rejilla");
  let obras;
  try { obras = await listarObras(); }
  catch (e) { rejilla.textContent = "Este navegador no permite guardar la galería."; return; }
  $("cuenta").textContent = obras.length ? `(${obras.length})` : "";
  rejilla.replaceChildren();
  if (!obras.length) {
    const p = document.createElement("p");
    p.className = "sinobras";
    p.textContent = "Todavía no hay obras. Crea una en el generador y usa “Guardar en mi galería”.";
    rejilla.append(p);
    return;
  }
  obras.sort((a, b) => b.fecha - a.fecha).forEach((o) => rejilla.append(tarjeta(o)));
}

function abrirObra(o) {
  const a = o.ajustes;
  $("ancho").value = a.ancho; $("anchoVal").textContent = $("ancho").value;
  $("rampa").value = a.rampa; if (!$("rampa").value) $("rampa").selectedIndex = 0;
  $("efecto").value = a.efecto; if (!$("efecto").value) $("efecto").selectedIndex = 0;
  $("invertir").checked = a.invertir;
  $("color").checked = a.color;
  $("estilo").value = a.estilo || "clasico"; // las obras viejas se abren como se guardaron
  $("corte").value = a.corte ?? 15;
  $("luz").checked = !!a.luz;
  actualizarEstilo();
  irA("crear");
  cargar(o.archivo);
}

document.querySelectorAll(".tab").forEach((b) => b.addEventListener("click", () => irA(b.dataset.vista)));

$("guardar").addEventListener("click", async () => {
  if (!archivoActual || !cache.get(indice)) return;
  const nombre = (archivoActual.name || "").replace(/\.[^.]+$/, "") || "Sin título";
  const titulo = prompt("Título de la obra:", nombre);
  if (titulo === null) return;
  const r = cache.get(indice);
  try {
    await guardarObra({
      titulo: titulo.trim() || "Sin título",
      fecha: Date.now(),
      tipo: archivoActual.type,
      archivo: archivoActual,
      ajustes: { ancho: +$("ancho").value, rampa: $("rampa").value, invertir: $("invertir").checked, color: $("color").checked, efecto: $("efecto").value,
                estilo: $("estilo").value, corte: +$("corte").value, luz: $("luz").checked },
      vista: { texto: r.texto, html: r.html, ancho: +$("ancho").value },
    });
    const b = $("guardar"); b.textContent = "Guardada"; setTimeout(() => (b.textContent = "Guardar en mi galería"), 1400);
    actualizarCuenta();
  } catch (e) {
    alert("No se pudo guardar en este navegador.");
  }
});

// ---------- Respaldo: exportar e importar ----------
function aDataURL(blob) {
  return new Promise((ok, fallo) => { const l = new FileReader(); l.onload = () => ok(l.result); l.onerror = fallo; l.readAsDataURL(blob); });
}
function descargarBlob(blob, nombre) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = nombre;
  a.click();
}
// El html de la vista previa solo puede tener <span style="color:rgb(...)"> con texto simple
const htmlSeguro = (h) => typeof h === "string" && /^(?:<span style="color:rgb\(\d{1,3},\d{1,3},\d{1,3}\)">[^<>&]*<\/span>|[^<>&])*$/.test(h);
const ajustesSeguros = (a = {}) => ({
  ancho: Math.min(250, Math.max(30, Number(a.ancho) || 100)),
  rampa: String(a.rampa || ""), invertir: !!a.invertir, color: !!a.color, efecto: String(a.efecto || "ninguno"),
  estilo: a.estilo === "luminoso" ? "luminoso" : "clasico", corte: Math.min(60, Math.max(0, Number(a.corte) || 0)), luz: !!a.luz,
});

$("exportar").addEventListener("click", async () => {
  const obras = await listarObras();
  if (!obras.length) { alert("Todavía no hay obras para exportar."); return; }
  const salida = [];
  for (const o of obras) {
    salida.push({ titulo: o.titulo, fecha: o.fecha, tipo: o.tipo, ajustes: o.ajustes, vista: o.vista, archivo: await aDataURL(o.archivo) });
  }
  descargarBlob(new Blob([JSON.stringify(salida)], { type: "application/json" }), "mi-galeria-ascii.json");
});

$("importarBtn").addEventListener("click", () => $("importar").click());
$("importar").addEventListener("change", async (e) => {
  const f = e.target.files[0];
  if (!f) return;
  try {
    const datos = JSON.parse(await f.text());
    let n = 0;
    for (const o of datos) {
      if (!o || typeof o.archivo !== "string" || !o.archivo.startsWith("data:image/")) continue;
      const blob = await (await fetch(o.archivo)).blob();
      const v = o.vista || {};
      await guardarObra({
        titulo: String(o.titulo || "Sin título").slice(0, 80),
        fecha: Number(o.fecha) || Date.now(),
        tipo: blob.type, archivo: blob, ajustes: ajustesSeguros(o.ajustes),
        vista: { texto: String(v.texto || ""), html: htmlSeguro(v.html) ? v.html : "", ancho: Number(v.ancho) || 100 },
      });
      n++;
    }
    alert(`Se importaron ${n} obras.`);
  } catch (err) {
    alert("Ese archivo no es un respaldo válido.");
  }
  e.target.value = "";
  renderGaleria();
});

actualizarCuenta();

actualizarEstilo();