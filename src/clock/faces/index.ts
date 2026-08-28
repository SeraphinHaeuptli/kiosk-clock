import type { ComponentType } from 'react';

import type { FaceId } from '../settings';
import { AnalogFace } from './AnalogFace';
import { AsciiFace } from './AsciiFace';
import { DigitalFace } from './DigitalFace';
import { StackFace } from './StackFace';
import { WordsFace } from './WordsFace';
import type { FaceProps } from './types';

export interface FaceDefinition {
  id: FaceId;
  name: string;
  Component: ComponentType<FaceProps>;
  /** Base size for this face's thumbnail in the picker. */
  previewSize: number;
}

/** Adding a face means adding one entry here and nothing else. */
export const FACES: readonly FaceDefinition[] = [
  { id: 'ascii', name: 'ascii', Component: AsciiFace, previewSize: 38 },
  { id: 'digital', name: 'digital', Component: DigitalFace, previewSize: 26 },
  { id: 'stack', name: 'stack', Component: StackFace, previewSize: 18 },
  { id: 'analog', name: 'analog', Component: AnalogFace, previewSize: 24 },
  { id: 'words', name: 'words', Component: WordsFace, previewSize: 22 },
];

export function faceOf(id: FaceId): FaceDefinition {
  return FACES.find((face) => face.id === id) ?? FACES[0];
}

export type { FaceProps };
