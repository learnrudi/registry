import React from 'react';
import {Composition} from 'remotion';
import {VideoAgentComposition} from './VideoAgentComposition.jsx';
import {getCompositionMetadata} from './timeline.js';

const defaultProps = {
  project: {
    settings: {
      fps: 30
    }
  },
  composition: {
    timeline: {
      keepRanges: [],
      audioCrossfadeSeconds: 0.04,
      textOverlays: [],
      lowerThirds: [],
      punchIns: [],
      captions: {
        enabled: false
      }
    }
  },
  probeSummary: {
    video: {
      width: 1620,
      height: 1080
    }
  },
  sourceStaticFile: ''
};

export const RemotionRoot = () => {
  return (
    <Composition
      id="VideoAgent"
      component={VideoAgentComposition}
      defaultProps={defaultProps}
      durationInFrames={30}
      fps={30}
      width={1620}
      height={1080}
      calculateMetadata={({props}) => getCompositionMetadata(props)}
    />
  );
};
