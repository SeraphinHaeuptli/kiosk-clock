import { noise } from '@/core/random';

/**
 * A 5x7 character-cell font for the ASCII face, and the renderer that blows it
 * up into character art.
 *
 * Each glyph is seven rows of equal length; '#' is ink and ' ' is paper. The
 * colon is one cell wide rather than five, so callers must measure glyphs
 * rather than assume a fixed width.
 */

export const GLYPH_HEIGHT = 7;

const GLYPHS: Record<string, readonly string[]> = {
  '0': [' ### ', '#   #', '#   #', '#   #', '#   #', '#   #', ' ### '],
  '1': ['  #  ', ' ##  ', '  #  ', '  #  ', '  #  ', '  #  ', ' ### '],
  '2': [' ### ', '#   #', '    #', '   # ', '  #  ', ' #   ', '#####'],
  '3': [' ### ', '#   #', '    #', '  ## ', '    #', '#   #', ' ### '],
  '4': ['   # ', '  ## ', ' # # ', '#  # ', '#####', '   # ', '   # '],
  '5': ['#####', '#    ', '#### ', '    #', '    #', '#   #', ' ### '],
  '6': ['  ## ', ' #   ', '#    ', '#### ', '#   #', '#   #', ' ### '],
  '7': ['#####', '    #', '   # ', '  #  ', ' #   ', ' #   ', ' #   '],
  '8': [' ### ', '#   #', '#   #', ' ### ', '#   #', '#   #', ' ### '],
  '9': [' ### ', '#   #', '#   #', ' ####', '    #', '   # ', ' ##  '],
  ':': [' ', '#', ' ', ' ', ' ', '#', ' '],
  ' ': ['     ', '     ', '     ', '     ', '     ', '     ', '     '],
};

function glyphFor(character: string): readonly string[] {
  return GLYPHS[character] ?? GLYPHS[' '];
}

/** Lays text out as GLYPH_HEIGHT rows, one blank cell between glyphs. */
export function glyphRows(text: string): string[] {
  const glyphs = [...text].map(glyphFor);

  return Array.from({ length: GLYPH_HEIGHT }, (_, row) =>
    glyphs.map((glyph) => glyph[row]).join(' '),
  );
}

/** Width of the coarse block in cells, gaps included. */
export function glyphColumns(text: string): number {
  const glyphs = [...text].map(glyphFor);
  const cells = glyphs.reduce((total, glyph) => total + glyph[0].length, 0);
  return cells + Math.max(0, glyphs.length - 1);
}

/* -------------------------------------------------------------------------- */
/* Character art                                                              */
/* -------------------------------------------------------------------------- */

/** Fine cells per coarse cell. The glyph grid is the sketch, not the output. */
const SUB_X = 6;
/**
 * More rows than columns per cell. The source font is 5x7, which at full
 * screen width leaves a block about three and a half times wider than tall;
 * subdividing further vertically stretches the digits back to a proportion a
 * clock can carry, and puts more characters on screen while doing it.
 */
const SUB_Y = 5;

/**
 * Light to dense, chosen per cell from how buried it is in the shape.
 *
 * Deliberately starts at '-' rather than '.': at the size these are set, a
 * character's ink coverage is what carries the silhouette, and a stroke built
 * from dots reads as a dashed line rather than a stroke.
 */
const RAMP = ['-', '+', '*', '#', '@'];

/**
 * Density floor. Strokes in a 5x7 font are one cell thick, so nearly every
 * cell borders empty space; letting depth alone drive the ramp drew the whole
 * digit in the lightest characters and it dissolved into noise. Everything
 * inked starts solid, and depth and jitter only shade it from there.
 */
const DENSITY_FLOOR = 0.45;
const DEPTH_RANGE = 0.25;
const JITTER_RANGE = 0.3;

/**
 * Renders text as character art: every inked cell of the 5x7 sketch becomes a
 * patch of small characters, weighted by how buried the cell is in the shape.
 * Deeper cells draw heavier, which shades the strokes, while jitter keeps them
 * from reading as flat fills. The silhouette has to stay legible first — the
 * texture is decoration on a shape that is already solid.
 */
export function artRows(text: string): string[] {
  const rows = glyphRows(text);
  const height = rows.length;
  const width = rows[0].length;

  const inked = (row: number, column: number): boolean =>
    row >= 0 &&
    row < height &&
    column >= 0 &&
    column < width &&
    rows[row][column] === '#';

  const lines: string[] = [];

  for (let row = 0; row < height; row += 1) {
    for (let subY = 0; subY < SUB_Y; subY += 1) {
      let line = '';

      for (let column = 0; column < width; column += 1) {
        if (!inked(row, column)) {
          line += ' '.repeat(SUB_X);
          continue;
        }

        const depth =
          (Number(inked(row - 1, column)) +
            Number(inked(row + 1, column)) +
            Number(inked(row, column - 1)) +
            Number(inked(row, column + 1))) /
          4;

        for (let subX = 0; subX < SUB_X; subX += 1) {
          const jitter = noise(row * 7919 + column * 131 + subY * 17 + subX * 3);
          const density =
            DENSITY_FLOOR + depth * DEPTH_RANGE + jitter * JITTER_RANGE;
          const index = Math.min(RAMP.length - 1, Math.floor(density * RAMP.length));
          line += RAMP[index];
        }
      }

      lines.push(line);
    }
  }

  return lines;
}

/** Fine columns in a rendered art block, for sizing against a target width. */
export function artColumns(text: string): number {
  return glyphColumns(text) * SUB_X;
}
