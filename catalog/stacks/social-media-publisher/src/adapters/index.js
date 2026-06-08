import { facebookPageAdapter } from './facebook-page.js';
import { instagramProfileAdapter } from './instagram-profile.js';
import { linkedinProfileAdapter } from './linkedin-profile.js';
import { unsupportedPlatform } from './platform-errors.js';
import { tiktokProfileAdapter } from './tiktok-profile.js';
import { twitterProfileAdapter } from './twitter-profile.js';
import { youtubeChannelAdapter } from './youtube-channel.js';

const adapters = new Map([
  [facebookPageAdapter.platform, facebookPageAdapter],
  [instagramProfileAdapter.platform, instagramProfileAdapter],
  [linkedinProfileAdapter.platform, linkedinProfileAdapter],
  [tiktokProfileAdapter.platform, tiktokProfileAdapter],
  [twitterProfileAdapter.platform, twitterProfileAdapter],
  [youtubeChannelAdapter.platform, youtubeChannelAdapter],
]);

export function getPlatformAdapter(platform) {
  const adapter = adapters.get(platform);
  if (!adapter) {
    throw unsupportedPlatform(platform);
  }

  return adapter;
}

export function listSupportedPlatforms() {
  return [...adapters.keys()];
}

export { PlatformAdapterError } from './platform-errors.js';
