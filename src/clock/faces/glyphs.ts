/**
 * A 5x7 character-cell font for the ASCII face.
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

export interface Run {
  start: number;
  length: number;
}

/** Consecutive inked cells in a row, so a run of five draws as one rectangle. */
export function rowRuns(row: string): Run[] {
  const runs: Run[] = [];
  let start = -1;

  for (let index = 0; index <= row.length; index += 1) {
    const inked = row[index] === '#';
    if (inked && start === -1) start = index;
    if (!inked && start !== -1) {
      runs.push({ start, length: index - start });
      start = -1;
    }
  }

  return runs;
}

/** Width of the rendered block in character cells, gaps included. */
export function glyphColumns(text: string): number {
  const glyphs = [...text].map(glyphFor);
  const cells = glyphs.reduce((total, glyph) => total + glyph[0].length, 0);
  return cells + Math.max(0, glyphs.length - 1);
}
