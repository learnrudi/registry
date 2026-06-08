import React from 'react';
import {AbsoluteFill, OffthreadVideo} from 'remotion';

export const SourceClip = ({src, muted = false, playbackRate = 1}) => {
  return (
    <AbsoluteFill>
      <OffthreadVideo
        src={src}
        muted={muted}
        playbackRate={playbackRate}
        style={{
          width: '100%',
          height: '100%',
          objectFit: 'cover'
        }}
      />
    </AbsoluteFill>
  );
};
