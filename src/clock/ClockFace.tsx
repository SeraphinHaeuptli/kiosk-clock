import { memo } from 'react';

import { faceOf, type FaceProps } from './faces';

/**
 * Renders whichever face the settings select.
 *
 * Memoised because the screen re-renders on every frame of a volume drag, and
 * the character-art face rebuilds a five-thousand-glyph string each time it
 * renders. None of its inputs change during a drag, so this holds.
 */
export const ClockFace = memo(function ClockFace(props: FaceProps) {
  const { Component } = faceOf(props.settings.face);
  return <Component {...props} />;
});
