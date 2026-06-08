import React from 'react';
import {
  AbsoluteFill,
  Audio,
  interpolate,
  Sequence,
  staticFile,
  useCurrentFrame
} from 'remotion';
import {CaptionLayer} from './components/CaptionLayer.jsx';
import {ChapterLabel} from './components/ChapterLabel.jsx';
import {ChapterProgressBar} from './components/ChapterProgressBar.jsx';
import {InsightCardLayer} from './components/InsightCardLayer.jsx';
import {LowerThirdLayer} from './components/LowerThirdLayer.jsx';
import {SourceClip} from './components/SourceClip.jsx';
import {TextOverlayLayer} from './components/TextOverlayLayer.jsx';
import {
  getAudioCrossfadeFrames,
  getTimelineClips,
  getTimelineDurationInFrames,
  getVideoScale
} from './timeline.js';

const TimelineAudio = ({clip, crossfadeFrames, src}) => {
  const frame = useCurrentFrame();
  const fadeFrames = Math.min(crossfadeFrames, Math.floor(clip.durationInFrames / 2));
  let volume = 1;

  if (fadeFrames > 0 && frame < fadeFrames) {
    volume = interpolate(frame, [0, fadeFrames], [0, 1], {
      extrapolateLeft: 'clamp',
      extrapolateRight: 'clamp'
    });
  } else if (fadeFrames > 0 && frame > clip.durationInFrames - fadeFrames) {
    volume = interpolate(frame, [clip.durationInFrames - fadeFrames, clip.durationInFrames], [1, 0], {
      extrapolateLeft: 'clamp',
      extrapolateRight: 'clamp'
    });
  }

  return (
    <Sequence from={-clip.sourceStartFrame} layout="none">
      <Audio src={src} volume={volume} />
    </Sequence>
  );
};

export const VideoAgentComposition = ({composition, sourceStaticFile}) => {
  const frame = useCurrentFrame();
  const fps = composition.source?.fps || 30;
  const timelineClips = getTimelineClips(composition);
  const durationInFrames = getTimelineDurationInFrames(composition);
  const scale = getVideoScale(composition, frame);
  const source = staticFile(sourceStaticFile);
  const audioCrossfadeFrames = getAudioCrossfadeFrames(composition);
  const usesSeparateAudio = audioCrossfadeFrames > 0;
  const watermark = composition.timeline?.watermark || {enabled: true, text: 'rough cut'};

  return (
    <AbsoluteFill style={{backgroundColor: '#090909', overflow: 'hidden'}}>
      <AbsoluteFill
        style={{
          transform: `scale(${scale})`,
          transformOrigin: 'center center'
        }}
      >
        {timelineClips.map((clip) => (
          <Sequence
            key={`${clip.sourceStartFrame}-${clip.timelineStartFrame}`}
            from={clip.timelineStartFrame}
            durationInFrames={clip.durationInFrames}
          >
            <Sequence from={-clip.sourceStartFrame} layout="none">
              <SourceClip
                src={source}
                muted={usesSeparateAudio || clip.speed > 1}
                playbackRate={clip.speed || 1}
              />
            </Sequence>
            {usesSeparateAudio ? (
              <TimelineAudio clip={clip} crossfadeFrames={audioCrossfadeFrames} src={source} />
            ) : null}
          </Sequence>
        ))}
      </AbsoluteFill>

      <TextOverlayLayer overlays={composition.timeline.textOverlays} fps={fps} />
      <LowerThirdLayer items={composition.timeline.lowerThirds} fps={fps} />
      <CaptionLayer captions={composition.timeline.captions} fps={fps} />
      <ChapterProgressBar
        chapters={composition.timeline.chapters || []}
        insights={composition.timeline.insights || []}
        fps={fps}
        totalDurationInFrames={durationInFrames}
      />
      <ChapterLabel
        chapters={composition.timeline.chapters || []}
        insights={composition.timeline.insights || []}
        fps={fps}
        totalDurationInFrames={durationInFrames}
      />
      <InsightCardLayer
        insights={composition.timeline.insights || []}
        fps={fps}
      />

      {watermark.enabled === false ? null : (
        <div
          style={{
            position: 'absolute',
            right: 24,
            bottom: 20,
            padding: '6px 9px',
            borderRadius: 4,
            background: 'rgba(0, 0, 0, 0.5)',
            color: 'rgba(255, 255, 255, 0.82)',
            fontFamily: 'Inter, Arial, sans-serif',
            fontSize: 16,
            lineHeight: 1,
            opacity: interpolate(frame, [durationInFrames - 24, durationInFrames], [1, 0], {
              extrapolateLeft: 'clamp',
              extrapolateRight: 'clamp'
            })
          }}
        >
          {watermark.text || 'rough cut'}
        </div>
      )}
    </AbsoluteFill>
  );
};
