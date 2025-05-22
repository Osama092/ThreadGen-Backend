let configPromiseResolve, configPromiseReject;
window.playerConfigPromise = new Promise((resolve, reject) => {
  configPromiseResolve = resolve;
  configPromiseReject = reject;
});

export async function loadPlayerConfig() {
  try {
    const config = await window.playerConfigPromise;
    console.log("==================");
    console.log("Received config:", config);

    if (!config) {
      throw new Error('Failed to load configuration');
    }
    
    normalizeColorConfig(config);
    applyPlayerConfig(config);
    return config;
  } catch (error) {
    console.error('Error loading player configuration:', error);
    const defaultConfig = getDefaultConfig();
    normalizeColorConfig(defaultConfig);
    applyPlayerConfig(defaultConfig);
    return defaultConfig;
  }
}

function normalizeColorConfig(config) {
  if (!config.colors) {
    config.colors = {};
  }
  
  config.colors.primary = config.colors.primary || "#3366CC";
  config.colors.controlsBackground = config.colors.controlsBackground || config.colors.primary;
  config.colors.controlsText = config.colors.controlsText || "#FFFFFF";
  config.colors.progressBar = config.colors.progressBar || "#FFFFFF";
  config.colors.progressBarBackground = config.colors.progressBarBackground || "rgba(255, 255, 255, 0.3)";
  config.colors.overlayBackground = config.colors.overlayBackground || "rgba(0, 0, 0, 0.5)";
}

function getDefaultConfig() {
  return {
    player: {
      muted: true,
    },
    colors: {
      primary: "#3366CC",
      controlsBackground: "#3366CC",
      controlsText: "#FFFFFF",
      progressBar: "#FFFFFF",
      progressBarBackground: "rgba(255, 255, 255, 0.3)",
      overlayBackground: "rgba(0, 0, 0, 0.5)"
    },
    behavior: {
      pauseOnTabChange: true,
      keyboardControlsEnabled: true,
      thumbnailOnPause: {
        enabled: true,
        showAfterSeconds: 10,
        imagePath: "thumbnail.jpg"
      },
      thumbnailOnEnd: {
        enabled: true,
        imagePath: "end_thumbnail.gif"
      },
      startThumbnail: {
        enabled: true,
        imagePath: "start_thumbnail.jpg"
      }
    },
    captions: {
      enabled: true,
      defaultTrack: "en-US",
      tracks: [
        {
          src: "en_dolphin.com.vtt",
          kind: "subtitles",
          label: "English",
          srclang: "en-US",
          default: true
        }
      ]
    }
  };
}

function applyPlayerConfig(config) {
  const player = document.querySelector('media-player');
  if (!player) {
    console.error('Player element not found');
    return;
  }

  player.muted = config.player?.muted ?? true;
  applyColorScheme(config.colors);
  configureBehavior(config.behavior);
  configureCaptions(config.captions);
}

function applyColorScheme(colors) {
  const styleElement = document.createElement('style');
  const css = `
    media-player {
      --media-primary: ${colors.primary} !important;
      --media-controls-bg: ${colors.controlsBackground} !important;
      --media-controls-color: ${colors.controlsText} !important;
      border: 10px solid ${colors.primary} !important;
    }
    
    .vds-controls-group {
      background-color: var(--media-controls-bg) !important;
    }
    
    .pause-indicator {
      background-color: ${colors.primary}80 !important;

    }
    .vds-button {
      color: var(--media-controls-color) !important;
    }

    .illusion-slider-progress {
      background-color: ${colors.progressBar} !important;
    }
    
    .illusion-slider-track {
      background-color: ${colors.progressBarBackground} !important;
    }
    
    .replay-button {
      background-color: ${colors.primary} !important;
      color: ${colors.controlsText} !important;
    }
    
    .unmute-overlay {
      background-color: ${colors.overlayBackground} !important;
    }
    
    .unmute-content {
      background-color: ${colors.primary} !important;
      color: ${colors.controlsText} !important;
    }
  `;
  
  styleElement.textContent = css;
  document.head.appendChild(styleElement);
}

function configureBehavior(behavior) {
  if (!behavior.pauseOnTabChange) {
    const oldListener = document.querySelector('[data-tab-visibility-listener]');
    if (oldListener) {
      document.removeEventListener('visibilitychange', oldListener);
    }
  }
  
  const thumbnailContainer = document.querySelector('.thumbnail-container');
  if (thumbnailContainer) {
    if (!behavior.thumbnailOnPause?.enabled) {
      thumbnailContainer.style.display = 'none';
    } else {
      const thumbnailImage = thumbnailContainer.querySelector('.thumbnail-image');
      if (thumbnailImage && behavior.thumbnailOnPause.imagePath) {
        thumbnailImage.src = behavior.thumbnailOnPause.imagePath;
      }
    }
  }
  
  const endThumbnailContainer = document.querySelector('.end-thumbnail-container');
  if (endThumbnailContainer) {
    if (!behavior.thumbnailOnEnd?.enabled) {
      endThumbnailContainer.style.display = 'none';
    } else {
      const endThumbnailImage = endThumbnailContainer.querySelector('.end-thumbnail-image');
      if (endThumbnailImage) {
        endThumbnailImage.src = behavior.thumbnailOnEnd.imagePath;
      }
    }
  }
  
  if (behavior.startThumbnail && document.querySelector('.start-thumbnail-container')) {
    const startThumbnailContainer = document.querySelector('.start-thumbnail-container');
    if (!behavior.startThumbnail.enabled) {
      startThumbnailContainer.style.display = 'none';
    } else {
      const startThumbnailImage = startThumbnailContainer.querySelector('.start-thumbnail-image');
      if (startThumbnailImage && behavior.startThumbnail.imagePath) {
        startThumbnailImage.src = behavior.startThumbnail.imagePath;
      }
    }
  }
}

function configureCaptions(captionConfig) {
  const player = document.querySelector('media-player');
  player.hasCaptions = captionConfig.enabled;
  
  if (captionConfig.enabled && captionConfig.tracks?.length > 0) {
    const mediaProvider = player.querySelector('media-provider');
    if (mediaProvider) {
      const existingTracks = mediaProvider.querySelectorAll('track');
      existingTracks.forEach(track => track.remove());
      
      captionConfig.tracks.forEach(trackConfig => {
        const track = document.createElement('track');
        track.src = trackConfig.src;
        track.kind = trackConfig.kind;
        track.label = trackConfig.label;
        track.srclang = trackConfig.srclang;
        if (trackConfig.default) {
          track.default = true;
        }
        mediaProvider.appendChild(track);
      });
    }
  }
  
  const captionsElement = player.querySelector('media-captions');
  if (captionsElement && captionConfig.styling) {
    if (captionConfig.styling.fontSize) {
      captionsElement.style.setProperty('--media-cue-font-size', captionConfig.styling.fontSize);
    }
    if (captionConfig.styling.backgroundColor) {
      captionsElement.style.setProperty('--media-cue-bg', captionConfig.styling.backgroundColor);
    }
    if (captionConfig.styling.textColor) {
      captionsElement.style.setProperty('--media-cue-color', captionConfig.styling.textColor);
    }
    if (captionConfig.styling.padding) {
      captionsElement.style.setProperty('--media-cue-padding-x', captionConfig.styling.padding);
    }
  }
}

export function setPlayerConfig(configData) {
  if (configPromiseResolve) {
    configPromiseResolve(configData);
  }
}

export function rejectPlayerConfig(error) {
  if (configPromiseReject) {
    configPromiseReject(error);
  }
}