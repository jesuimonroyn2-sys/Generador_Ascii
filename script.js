const $ = (id) => document.getElementById(id);
const arte = $("arte"), vacio = $("vacio"), ventana = $("ventana"), archivo = $("archivo");
const FACTOR_ALTURA = 0.5; // los caracteres son ~2x más altos que anchos
let imagen = null;
let texto = "";

function convertir() {
  if (!imagen) return;
  const ancho = +$("ancho").value;
  const alto = Math.max(1, Math.round(ancho * (imagen.height / imagen.width) * FACTOR_ALTURA));

  const canvas = document.createElement("canvas");
  canvas.width = ancho;
  canvas.height = alto;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  ctx.fillStyle = "#fff"; // fondo blanco para PNG con transparencia
  ctx.fillRect(0, 0, ancho, alto);
  ctx.drawImage(imagen, 0, 0, ancho, alto);
  const datos = ctx.getImageData(0, 0, ancho, alto).data;

  const rampa = [...$("rampa").value]; // spread: respeta caracteres como █
  if ($("invertir").checked) rampa.reverse();
  const pasos = rampa.length - 1;

  const conColor = $("color").checked;
  const cuantizar = (v) => Math.min(255, Math.round(v / 16) * 16); // menos tonos = menos <span>
  const filas = [];
  let html = "";
  for (let y = 0; y < alto; y++) {
    let fila = "", tramo = "", colorTramo = "";
    for (let x = 0; x < ancho; x++) {
      const i = (y * ancho + x) * 4;
      const brillo = 0.299 * datos[i] + 0.587 * datos[i + 1] + 0.114 * datos[i + 2];
      const c = rampa[Math.round((brillo / 255) * pasos)];
      fila += c;
      if (conColor) {
        const col = `rgb(${cuantizar(datos[i])},${cuantizar(datos[i + 1])},${cuantizar(datos[i + 2])})`;
        if (col !== colorTramo) { // cambió el color: cerramos el tramo anterior
          if (tramo) html += `<span style="color:${colorTramo}">${tramo}</span>`;
          tramo = ""; colorTramo = col;
        }
        tramo += c;
      }
    }
    if (conColor && tramo) html += `<span style="color:${colorTramo}">${tramo}</span>`;
    html += "\n";
    filas.push(fila);
  }
  texto = filas.join("\n"); // el .txt y "Copiar" siempre son texto plano
  if (conColor) arte.innerHTML = html; else arte.textContent = texto;

  arte.style.display = "block";
  vacio.style.display = "none";
  ajustarTamano(ancho);
  $("copiar").disabled = $("descargar").disabled = false;
}

// Ajusta la fuente para que el arte quepa en la ventana sin scroll horizontal
function ajustarTamano(ancho) {
  const disponible = arte.parentElement.clientWidth - 40;
  const tam = Math.max(3, Math.min(14, disponible / ancho / 0.6));
  arte.style.fontSize = tam.toFixed(2) + "px";
}

function cargar(file) {
  if (!file || !file.type.startsWith("image/")) return;
  const img = new Image();
  img.onload = () => { imagen = img; convertir(); };
  img.src = URL.createObjectURL(file);
}

$("elegir").addEventListener("click", () => archivo.click());
archivo.addEventListener("change", () => cargar(archivo.files[0]));

// Arrastrar y soltar sobre la ventana
["dragenter", "dragover"].forEach((ev) => ventana.addEventListener(ev, (e) => { e.preventDefault(); ventana.classList.add("sobre"); }));
["dragleave", "drop"].forEach((ev) => ventana.addEventListener(ev, (e) => { e.preventDefault(); ventana.classList.remove("sobre"); }));
ventana.addEventListener("drop", (e) => cargar(e.dataTransfer.files[0]));

$("ancho").addEventListener("input", () => { $("anchoVal").textContent = $("ancho").value; convertir(); });
$("rampa").addEventListener("change", convertir);
$("invertir").addEventListener("change", convertir);
$("color").addEventListener("change", convertir);
window.addEventListener("resize", () => imagen && ajustarTamano(+$("ancho").value));

$("copiar").addEventListener("click", async () => {
  await navigator.clipboard.writeText(texto);
  const b = $("copiar"); b.textContent = "Copiado"; setTimeout(() => (b.textContent = "Copiar"), 1200);
});

$("descargar").addEventListener("click", () => {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([texto], { type: "text/plain;charset=utf-8" }));
  a.download = "arte-ascii.txt";
  a.click();
});
