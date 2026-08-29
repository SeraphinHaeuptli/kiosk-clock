import type { ComponentType } from 'react';

import type { FaceId } from '../settings';
import { AnalogFace } from './AnalogFace';
import { AsciiFace } from './AsciiFace';
import { DigitalFace } from './DigitalFace';
import { FlipFace } from './FlipFace';
import { MatrixFace } from './MatrixFace';
import { RingsFace } from './RingsFace';
import { StackFace } from './StackFace';
import { WordsFace } from './WordsFace';
import type { FaceProps } from './types';

export interface FaceDefinition {
  id: FaceId;
  name: string;
  Component: ComponentType<FaceProps>;
  /** Base size for this face's thumbnail in the picker. */
  previewSize: number;
  /**
   * How many multiples of `size` the rendered face spans.
   *
   * Faces differ enormously in proportion — the stacked face is over three
   * times taller than its base size, the digital face barely one — so a single
   * screen-derived size cannot fit them all. In landscape the short axis is
   * the binding one, and without these the tall faces overflowed it. The
   * screen picks a size from the space it actually has and these ratios.
   */
  widthRatio: number;
  heightRatio: number;
}

/**
 * Adding a face means adding one entry here and nothing else.
 *
 * The plain digital face leads because it is the default and the one face the
 * free app has: `faceOf` falls back to the first entry for an id it does not
 * recognise, and that fallback must never land on something locked.
 */
export const FACES: readonly FaceDefinition[] = [
  {
    id: 'digital',
    name: 'digital',
    Component: DigitalFace,
    previewSize: 26,
    widthRatio: 3.5,
    heightRatio: 1.2,
  },
  {
    id: 'ascii',
    name: 'ascii',
    Component: AsciiFace,
    previewSize: 38,
    widthRatio: 2.95,
    heightRatio: 1.15,
  },
  {
    id: 'stack',
    name: 'stack',
    Component: StackFace,
    previewSize: 18,
    widthRatio: 2.3,
    heightRatio: 3.8,
  },
  {
    id: 'analog',
    name: 'analog',
    Component: AnalogFace,
    previewSize: 24,
    widthRatio: 3.0,
    heightRatio: 3.0,
  },
  {
    id: 'words',
    name: 'words',
    Component: WordsFace,
    previewSize: 22,
    widthRatio: 2.6,
    heightRatio: 1.85,
  },
  {
    id: 'flip',
    name: 'flip',
    Component: FlipFace,
    previewSize: 32,
    widthRatio: 4.0,
    heightRatio: 1.3,
  },
  {
    id: 'matrix',
    name: 'matrix',
    Component: MatrixFace,
    previewSize: 30,
    widthRatio: 4.0,
    heightRatio: 1.45,
  },
  {
    id: 'rings',
    name: 'rings',
    Component: RingsFace,
    previewSize: 26,
    widthRatio: 3.0,
    heightRatio: 3.0,
  },
];

export function faceOf(id: FaceId): FaceDefinition {
  return FACES.find((face) => face.id === id) ?? FACES[0];
}

export type { FaceProps };
