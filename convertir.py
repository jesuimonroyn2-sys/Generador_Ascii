"""
Generador de imágenes ASCII - Etapa 1

Uso:
    python convertir.py imagenes/foto.jpg
    python convertir.py imagenes/foto.jpg --ancho 120
    python convertir.py imagenes/foto.jpg --invertir --guardar salidas/foto.txt
"""

import argparse
from PIL import Image

# Rampa de caracteres: del más oscuro (denso) al más claro (ligero)
RAMPA = "@%#*+=-:. "

# Los caracteres son ~2 veces más altos que anchos,
# así que comprimimos la altura para que la imagen no se vea estirada
FACTOR_ALTURA = 0.5


def imagen_a_ascii(ruta, ancho=100, invertir=False):
    imagen = Image.open(ruta).convert("L")  # "L" = escala de grises

    # Redimensionar manteniendo la proporción
    proporcion = imagen.height / imagen.width
    alto = max(1, int(ancho * proporcion * FACTOR_ALTURA))
    imagen = imagen.resize((ancho, alto))

    rampa = RAMPA[::-1] if invertir else RAMPA
    pasos = len(rampa) - 1

    filas = []
    for y in range(alto):
        fila = ""
        for x in range(ancho):
            brillo = imagen.getpixel((x, y))  # 0 (negro) a 255 (blanco)
            indice = round(brillo / 255 * pasos)
            fila += rampa[indice]
        filas.append(fila)

    return "\n".join(filas)


def main():
    parser = argparse.ArgumentParser(description="Convierte una imagen a arte ASCII")
    parser.add_argument("imagen", help="ruta de la imagen")
    parser.add_argument("--ancho", type=int, default=100, help="ancho en caracteres (default 100)")
    parser.add_argument("--invertir", action="store_true", help="invierte claros y oscuros")
    parser.add_argument("--guardar", help="guarda el resultado en un archivo .txt")
    args = parser.parse_args()

    arte = imagen_a_ascii(args.imagen, args.ancho, args.invertir)
    print(arte)

    if args.guardar:
        with open(args.guardar, "w", encoding="utf-8") as f:
            f.write(arte)
        print(f"\nGuardado en {args.guardar}")


if __name__ == "__main__":
    main()