import { clamp01 } from '@/core/format';

/**
 * Device output volume, 0–1.
 *
 * Whether the level can actually be written is a runtime question: the native
 * module is absent in Expo Go and on the web, so the control has to be able to
 * say "I am not driving anything" rather than pretend.
 */
export interface VolumeState {
  level: number;
  /** False when no native volume module answered. */
  controllable: boolean;
}

export const VOLUME_STEP = 0.05;

export function clampVolume(level: number): number {
  return clamp01(level);
}

export function formatVolume(level: number): string {
  return `${Math.round(clampVolume(level) * 100)}%`;
}
