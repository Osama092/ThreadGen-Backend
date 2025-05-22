import { loadPlayerConfig, setPlayerConfig, rejectPlayerConfig } from './config-loader.js';

let player = null;
let videoData = null;
let configData = null;

async function initializePlayer() {
  try {
    const loadedConfig = await loadPlayerConfig();
    console.log("Player config loaded:", loadedConfig);
    
    if (!videoData || !configData) {
      console.error('Cannot initialize player without video and config data');
      return;
    }

    const playerContainer = document.getElementById('player-container');
    if (!playerContainer) {
      console.error('Player container not found');
      return;
    }

    playerContainer.style.display = 'block';
    
    player = document.querySelector('media-player');
    if (!player) {
      console.error('Media player element not found.');
      return;
    }

    const videoUrl = videoData.video || videoData.fallback_video;
    if (videoUrl) {
      player.setAttribute('src', videoUrl);
    } else {
      console.error('No video URL available');
      return;
    }

    setupPlayerFunctionality(player, configData);
  } catch (error) {
    console.error('Failed to initialize player:', error);
  }
}
function setupPlayerFunctionality(player, config) {
  const thumbnailTimeThreshold = config.behavior?.thumbnailOnPause?.showAfterSeconds || 10;

  // Initialize KPI tracking
  initializeKPITracking();

  setupStartThumbnail(player, config);
  setupUnmuteOverlay(player);
  setupPlayPauseIndicator(player);
  setupProgressBar(player, config);
  setupReplayFunctionality(player);
  setupThumbnailHandling(player, thumbnailTimeThreshold);
  setupEndThumbnailHandling(player);
  setupKPITracking(player); // Add KPI tracking

  if (config.behavior?.pauseOnTabChange) {
    setupTabVisibilityHandling(player);
  }

  if (config.behavior?.keyboardControlsEnabled) {
    setupProgressBarClickControl(player);
  } else {
    disableKeyboardControls();
  }
}
function setupTabVisibilityHandling(player) {
  let wasPlaying = false;

  const visibilityChangeHandler = () => {
    if (document.hidden) {
      if (!player.paused && !player.ended) {
        wasPlaying = true;
        player.pause();
        
        // Send KPI data when tab loses visibility
        sendKPIData('tab_hidden');
      }
    } else if (wasPlaying) {
      player.play().catch(error => {
        console.error('Failed to resume playback:', error);
      });
      wasPlaying = false;
    }
  };

  document.addEventListener('visibilitychange', visibilityChangeHandler);
}

function setupStartThumbnail(player, config) {
  if (!config.behavior?.startThumbnail?.enabled) return;

  const startThumbnailContainer = document.querySelector('.start-thumbnail-container');
  if (!startThumbnailContainer) return;

  const startThumbnailImage = startThumbnailContainer.querySelector('.start-thumbnail-image');
  if (startThumbnailImage && config.behavior.startThumbnail.imagePath) {
    startThumbnailImage.src = config.behavior.startThumbnail.imagePath;
  }

  startThumbnailContainer.style.display = 'flex';

  startThumbnailContainer.addEventListener('click', () => {
    startThumbnailContainer.style.display = 'none';
    player.play().catch(error => {
      console.error('Failed to start playback:', error);
    });
  });

  player.addEventListener('play', () => {
    startThumbnailContainer.style.display = 'none';
  });

  player.subscribe(({ paused, currentTime, ended }) => {
    if (paused && currentTime === 0 && !ended) {
      startThumbnailContainer.style.display = 'flex';
    } else {
      startThumbnailContainer.style.display = 'none';
    }
  });
}

function setupUnmuteOverlay(player) {
  const overlayFullscreenMute = document.querySelector(".unmute-overlay");
  const muteButton = document.querySelector(".unmute-content");

  if (!overlayFullscreenMute || !muteButton) return;

  overlayFullscreenMute.addEventListener("click", () => {
    player.muted = false;
    player.play().catch(error => {
      console.error('Failed to start playback after unmuting:', error);
    });
  });

  player.subscribe(({ muted }) => {
    if (muted) {
      overlayFullscreenMute.style.display = "flex";
      overlayFullscreenMute.classList.remove("fade-out");
    } else {
      overlayFullscreenMute.classList.add("fade-out");
      overlayFullscreenMute.addEventListener("transitionend", () => {
        overlayFullscreenMute.style.display = "none";
      }, { once: true });
    }
  });
}
function setupPlayPauseIndicator(player) {
  const playPauseIndicator = document.querySelector('.play-pause-indicator');
  const pauseIndicator = document.querySelector('.pause-indicator');
  const videoClickArea = document.querySelector('.video-click-area');
  const controlsGroup = document.querySelector('.vds-controls-group');

  if (!playPauseIndicator || !pauseIndicator || !videoClickArea || !controlsGroup) return;

  // Initial state setup
  pauseIndicator.style.display = 'none';
  let fadeOutTimer = null;
  let isPlayingState = !player.paused;

  // Clear any existing timers to avoid conflicts
  const clearFadeOutTimer = () => {
    if (fadeOutTimer) {
      clearTimeout(fadeOutTimer);
      fadeOutTimer = null;
    }
  };

  // Handle click on video area
  videoClickArea.addEventListener('click', async (event) => {
    const overlayFullscreenMute = document.querySelector(".unmute-overlay");
    if (overlayFullscreenMute && overlayFullscreenMute.style.display !== 'none') {
      return;
    }

    // Only toggle play/pause if not clicking on controls
    if (!controlsGroup.contains(event.target)) {
      clearFadeOutTimer(); // Clear any existing fade out timer

      if (player.paused) {
        try {
          await player.play();
        } catch (error) {
          console.error('Failed to start playback:', error);
        }
      } else {
        player.pause();
      }
    }
  });

  // Handle pause events
  player.addEventListener('pause', () => {
    clearFadeOutTimer(); // Clear any existing fade out timer
    
    pauseIndicator.style.display = 'flex';
    playPauseIndicator.classList.add('fade-in');
    playPauseIndicator.classList.remove('fade-out');
    
    // Update internal state
    isPlayingState = false;
  });

  // Handle play events with proper state management
  player.addEventListener('play', () => {
    pauseIndicator.style.display = 'none';
    playPauseIndicator.classList.add('fade-in');
    playPauseIndicator.classList.remove('fade-out');
    
    // Update internal state
    isPlayingState = true;
    
    // Set timeout to fade out the indicator, but only if we're still playing
    clearFadeOutTimer(); // Clear any existing timers first
    fadeOutTimer = setTimeout(() => {
      // Double-check we're still in playing state before fading out
      if (isPlayingState && !player.paused && !player.ended) {
        playPauseIndicator.classList.remove('fade-in');
        playPauseIndicator.classList.add('fade-out');
      }
    }, 800);
  });

  // Use the subscription API for continuous state tracking
  player.subscribe(({ paused, playing, ended, seeking }) => {
    // Update our internal state
    isPlayingState = playing && !paused && !ended;
    
    // Handle paused state consistently
    if (paused && !ended) {
      pauseIndicator.style.display = 'flex';
      playPauseIndicator.classList.add('fade-in');
      playPauseIndicator.classList.remove('fade-out');
    } 
    // Only hide the indicator when confirmed playing
    else if (playing) {
      pauseIndicator.style.display = 'none';
      
      // Don't immediately fade out if we just started playing
      // The play event handler will take care of the fade timing
    }
    
    // For seeking events, maintain appropriate visibility
    if (seeking && !paused) {
      pauseIndicator.style.display = 'none';
    }
  });
}

function setupProgressBar(player, config) {
  const illusionProgress = document.querySelector('.illusion-slider-progress');
  if (!illusionProgress) return;

  const linearSpeedFactor = config.behavior?.linearSpeedFactor || 10;
  const easeOutIntensity = 1.2;

  player.subscribe(({ currentTime, duration }) => {
    if (duration > 0) {
      let progressPercent;
      const actualPercent = currentTime / duration;

      if (config.behavior?.keyboardControlsEnabled) {
        progressPercent = actualPercent;
      } else {
        const targetPercent = 0.4;
        const transitionPoint = targetPercent / linearSpeedFactor;

        if (actualPercent <= transitionPoint) {
          progressPercent = actualPercent * linearSpeedFactor;
        } else {
          const remainingVideoTime = (actualPercent - transitionPoint) / (1 - transitionPoint);
          const remainingVisualDistance = (1 - targetPercent);
          const easeOutFactor = 1 - Math.pow((1 - remainingVideoTime), 3 * easeOutIntensity);
          progressPercent = targetPercent + (easeOutFactor * remainingVisualDistance);
        }
      }

      progressPercent = Math.min(progressPercent, 1.0);
      illusionProgress.style.width = `${progressPercent * 100}%`;
    }
  });
}

function setupProgressBarClickControl(player) {
  const progressBarContainer = document.querySelector('.vds-time-slider');
  if (!progressBarContainer) return;

  progressBarContainer.addEventListener('click', (event) => {
    const progressBarRect = progressBarContainer.getBoundingClientRect();
    const clickPositionX = event.clientX - progressBarRect.left;
    const clickRatio = Math.max(0, Math.min(1, clickPositionX / progressBarRect.width));

    if (player.duration > 0) {
      player.currentTime = clickRatio * player.duration;
    }
  });
}
function setupReplayFunctionality(player) {
  let replayContainer = document.querySelector('.replay-container');

  if (!replayContainer) {
    replayContainer = document.createElement('div');
    replayContainer.className = 'replay-container';

    const replayButton = document.createElement('div');
    replayButton.className = 'replay-button';

    const replayIcon = document.createElement('img');
    replayIcon.src = 'media-icons/raw/replay.svg';
    replayIcon.alt = 'Replay Icon';

    const replayText = document.createElement('span');
    replayText.textContent = 'Replay';

    replayButton.appendChild(replayIcon);
    replayButton.appendChild(replayText);
    replayContainer.appendChild(replayButton);
    player.appendChild(replayContainer);
  }

  player.subscribe(({ ended, playing, seeking }) => {
    if (ended) {
      const pauseIndicator = document.querySelector('.pause-indicator');
      if (pauseIndicator) pauseIndicator.style.display = 'none';

      const playPauseIndicator = document.querySelector('.play-pause-indicator');
      if (playPauseIndicator) {
        playPauseIndicator.classList.remove('fade-in');
        playPauseIndicator.classList.add('fade-out');
      }

      replayContainer.classList.add('show');
    }

    if (playing || seeking) {
      replayContainer.classList.remove('show');
    }
  });

  replayContainer.addEventListener('click', () => {
    player.currentTime = 0;
    setTimeout(() => {
      // Set replay_rate to 1 when replay button is clicked
      kpiData.replay_rate = 1;
      kpiData.has_replayed = true;
      sendKPIData('replay_clicked');
      
      player.play().catch(error => {
        console.error('Playback failed:', error);
      });
      replayContainer.classList.remove('show');
    }, 100);
  });
}

function setupThumbnailHandling(player, thumbnailTimeThreshold) {
  const thumbnailContainer = document.querySelector('.thumbnail-container');
  if (!thumbnailContainer) return;

  player.subscribe(({ paused, playing, currentTime, ended }) => {
    if (playing) {
      thumbnailContainer.style.display = 'none';
      return;
    }

    if (paused && !ended) {
      thumbnailContainer.style.display = currentTime >= thumbnailTimeThreshold ? 'block' : 'none';
      return;
    }

    if (paused && currentTime >= thumbnailTimeThreshold) {
      thumbnailContainer.style.display = 'block';
    }
  });
}

function setupEndThumbnailHandling(player) {
  const endThumbnailContainer = document.querySelector('.end-thumbnail-container');
  const thumbnailContainer = document.querySelector('.thumbnail-container');

  if (!endThumbnailContainer) return;

  player.subscribe(({ ended, playing, seeking }) => {
    if (ended) {
      if (thumbnailContainer) {
        thumbnailContainer.style.display = 'none';
      }
      endThumbnailContainer.style.display = 'block';
      const replayContainer = document.querySelector('.replay-container');
      if (replayContainer) {
        replayContainer.classList.add('show');
      }
      return;
    }

    if (playing || (seeking && !ended)) {
      endThumbnailContainer.style.display = 'none';
      return;
    }
  });
}

function disableKeyboardControls() {
  const keyboardEventHandler = function(event) {
    const keysToBlock = [
      'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown',
      'f', 'm', 'j', 'l'
    ];

    if (keysToBlock.includes(event.key)) {
      event.preventDefault();
      event.stopPropagation();
      return false;
    }
  };

  document.addEventListener('keydown', keyboardEventHandler, true);
}

document.addEventListener('DOMContentLoaded', () => {
  const thumbnailContainer = document.querySelector('.thumbnail-container');
  const endThumbnailContainer = document.querySelector('.end-thumbnail-container');
  const startThumbnailContainer = document.querySelector('.start-thumbnail-container');
  const playerContainer = document.getElementById('player-container');

  if (thumbnailContainer) thumbnailContainer.style.display = 'none';
  if (endThumbnailContainer) endThumbnailContainer.style.display = 'none';
  if (startThumbnailContainer) startThumbnailContainer.style.display = 'none';
  if (playerContainer) playerContainer.style.display = 'none';

  initializeVideo();
});

async function initializeVideo() {
  const params = new URLSearchParams(window.location.search);
  const apiKey = params.get('apiKey');
  const threadName = params.get('threadName');
  const ttsText = params.get('ttsText');
  const videoParam = params.get('video'); // Check if video parameter exists

  showLoadingIndicator();

  if (!apiKey || !threadName || !ttsText) {
    console.error('Missing required URL parameters');
    showErrorMessage('Missing required URL parameters');
    return;
  }

  try {
    // If the video URL is provided directly in parameters, use it
    if (videoParam) {
      videoData = { video: videoParam };
      
      // Just fetch the config since we already have the video URL
      configData = await fetchPlayerConfig(JSON.stringify({ apiKey, threadName, ttsText }));
      
      if (!configData) {
        throw new Error('Failed to fetch player configuration');
      }
    } else {
      // For standalone testing: fetch both video and config together
      const requestBody = JSON.stringify({ apiKey, threadName, ttsText });
      
      videoData = await fetchVideoData(requestBody);
      if (!videoData) {
        throw new Error('Failed to fetch video data');
      }
      
      configData = await fetchPlayerConfig(requestBody);
      if (!configData) {
        throw new Error('Failed to fetch player configuration');
      }
    }

    setPlayerConfig(configData);
    hideLoadingIndicator();
    await initializePlayer();
  } catch (error) {
    console.error(`Error initializing video: ${error.message}`);
    showErrorMessage(`Error: ${error.message}`);
    rejectPlayerConfig(error);
  }
}

async function fetchVideoData(requestBody) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 30000);

  try {
    const res = await fetch('http://192.168.1.23:5000/generate-video', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: requestBody,
      signal: controller.signal
    });
    
    clearTimeout(timeoutId);
    
    if (!res.ok) {
      console.error(`Video API error: ${res.status} ${res.statusText}`);
      throw new Error(`API error: ${res.status}`);
    }
    
    return await res.json();
  } catch (error) {
    clearTimeout(timeoutId);
    console.error(`Video fetch error: ${error.message}`);
    throw error;
  }
}

async function fetchPlayerConfig(requestBody) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 30000);

  try {
    const res = await fetch('http://192.168.1.23:5000/player-config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: requestBody,
      signal: controller.signal
    });
    
    clearTimeout(timeoutId);
    
    if (!res.ok) {
      console.error(`Config API error: ${res.status} ${res.statusText}`);
      throw new Error(`Config API error: ${res.status}`);
    }
    
    return await res.json();
  } catch (error) {
    clearTimeout(timeoutId);
    console.error(`Config fetch error: ${error.message}`);
    throw error;
  }
}

function showLoadingIndicator() {
  if (document.getElementById('loading-indicator')) return;
  
  const loadingIndicator = document.createElement('div');
  loadingIndicator.id = 'loading-indicator';
  loadingIndicator.innerHTML = `
    <div class="loading-spinner"></div>
    <p>Loading video player...</p>
  `;
  document.body.appendChild(loadingIndicator);
}

function hideLoadingIndicator() {
  const loadingIndicator = document.getElementById('loading-indicator');
  if (loadingIndicator) loadingIndicator.remove();
}

function showErrorMessage(message) {
  hideLoadingIndicator();
  
  if (document.getElementById('error-message')) return;
  
  const errorMessage = document.createElement('div');
  errorMessage.id = 'error-message';
  errorMessage.innerHTML = `
    <div class="error-icon">⚠️</div>
    <p>${message}</p>
    <button onclick="location.reload()">Retry</button>
  `;
  document.body.appendChild(errorMessage);
}

let kpiData = {
  api_key: '',
  thread_name: '',
  watch_time: 0,
  play_rate: 0,       // Binary: 1 if played, 0 if not played
  completion_rate: 0, // 0 to 1 value representing % of video watched
  replay_rate: 0,     // Binary: 1 if replayed, 0 if not replayed
  session_start_time: null,
  last_time_update: 0,
  has_started_playing: false,
  has_completed: false,
  has_replayed: false,
  session_id: null,    // Unique session identifier
  kpi_submitted: false // Flag to prevent any additional KPI submissions
};


// Initialize KPI tracking
function initializeKPITracking() {
  const params = new URLSearchParams(window.location.search);
  kpiData.api_key = params.get('apiKey') || '';
  kpiData.thread_name = params.get('threadName') || '';
  kpiData.session_start_time = Date.now();
  
  // Reset all tracking metrics
  kpiData.watch_time = 0;
  kpiData.play_rate = 0;
  kpiData.completion_rate = 0;
  kpiData.replay_rate = 0;
  kpiData.has_started_playing = false;
  kpiData.has_completed = false;
  kpiData.has_replayed = false;
  kpiData.kpi_submitted = false;
  
  // Generate a unique session ID
  kpiData.session_id = generateSessionId();
  
  // Check if this session has already been tracked
  const previousSession = checkPreviousSession();
  
  if (previousSession) {
    console.log('Previous session found for this content. KPI already submitted.');
    kpiData.kpi_submitted = true;
  }
}

// Generate a unique session ID
function generateSessionId() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).substring(2, 7)}`;
}

// Check for previous session in local storage
function checkPreviousSession() {
  try {
    const storageKey = `kpi_submission_${kpiData.api_key}_${kpiData.thread_name}`;
    const storedData = localStorage.getItem(storageKey);
    
    if (storedData) {
      return JSON.parse(storedData);
    }
    return null;
  } catch (error) {
    console.error('Error checking previous session:', error);
    return null;
  }
}

// Record session in local storage to prevent duplicate submissions
function recordSession(finalData) {
  try {
    const storageKey = `kpi_submission_${kpiData.api_key}_${kpiData.thread_name}`;
    const sessionRecord = {
      timestamp: Date.now(),
      session_id: kpiData.session_id,
      final_data: finalData
    };
    
    localStorage.setItem(storageKey, JSON.stringify(sessionRecord));
    console.log('Session recorded to prevent duplicate submissions');
  } catch (error) {
    console.error('Error recording session:', error);
  }
}

// Update watch time metrics accurately
function updateWatchTimeMetrics(currentTime, duration, isPlaying) {
  if (!kpiData.session_start_time) return;
  
  const now = Date.now();
  
  // Only count watch time when video is actually playing
  if (isPlaying && kpiData.last_time_update > 0) {
    const timeElapsed = (now - kpiData.last_time_update) / 1000;
    
    // Sanity check to prevent counting large jumps (e.g., seeking)
    if (timeElapsed > 0 && timeElapsed < 5) {
      kpiData.watch_time += timeElapsed;
    }
  }
  
  // Update completion rate
  if (duration > 0) {
    kpiData.completion_rate = Math.min(currentTime / duration, 1);
  }
  
  kpiData.last_time_update = now;
}

// Track play events (initial play or replay)
function trackPlayEvent(isReplay) {
  kpiData.play_rate = 1; // Video was played
  kpiData.has_started_playing = true;
  
  if (isReplay) {
    kpiData.replay_rate = 1;
    kpiData.has_replayed = true;
  }
}

// Send KPI data to server - follows the specified rules
async function sendKPIData(event_type) {
  // If KPI data was already submitted for this session, don't send again
  if (kpiData.kpi_submitted) {
    console.log('KPI already submitted for this session, skipping submission');
    return;
  }
  
  // Missing required data
  if (!kpiData.api_key || !kpiData.thread_name) {
    console.error('Cannot send KPI data: Missing API key or thread name');
    return;
  }
  
  // Determine if this is a final submission event
  const isFinalEvent = ['tab_close', 'video_completed', 'final_submission'].includes(event_type);
  
  // Only send final KPI data in these specific scenarios:
  // 1. Player loaded but user never played video and closed tab (play_rate=0)
  // 2. User played video but didn't complete it and closed tab 
  // 3. User completed the video (completion_rate=1)
  // 4. User replayed the video (replay_rate=1)
  
  let shouldSubmit = false;
  
  if (isFinalEvent) {
    // Case 1: Player loaded but user never played and closed tab
    if (event_type === 'tab_close' && !kpiData.has_started_playing) {
      shouldSubmit = true;
    }
    // Case 2: User played but didn't complete and closed tab
    else if (event_type === 'tab_close' && kpiData.has_started_playing && !kpiData.has_completed) {
      shouldSubmit = true;
    }
    // Case 3: User completed the video
    else if (event_type === 'video_completed' || 
            (kpiData.has_completed && event_type === 'tab_close')) {
      shouldSubmit = true;
    }
    // Case 4: User has replayed the video
    else if (kpiData.has_replayed) {
      shouldSubmit = true;
    }
  }
  
  if (!shouldSubmit) {
    console.log(`Skipping KPI submission for event ${event_type} - conditions not met`);
    return;
  }
  
  try {
    // Prepare the final KPI data
    const kpiPayload = {
      api_key: kpiData.api_key,
      thread_name: kpiData.thread_name,
      watch_time: Math.round(kpiData.watch_time), // round to nearest second
      play_rate: kpiData.play_rate,
      completion_rate: parseFloat(kpiData.completion_rate.toFixed(2)),
      replay_rate: kpiData.replay_rate,
      event_type: event_type,
      session_id: kpiData.session_id
    };
    
    console.log(`Sending final KPI data (${event_type}):`, kpiPayload);
    
    const response = await fetch('http://192.168.1.23:5000/player-kpi', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(kpiPayload)
    });
    
    if (!response.ok) {
      throw new Error(`KPI data send error: ${response.status}`);
    }
    
    console.log('KPI data sent successfully');
    
    // Mark KPI as submitted and record the session to prevent future submissions
    kpiData.kpi_submitted = true;
    recordSession(kpiPayload);
    
    return await response.json();
  } catch (error) {
    console.error('Failed to send KPI data:', error);
  }
}

// Set up event listeners for KPI tracking
function setupKPITracking(player) {
  // First play event
  player.addEventListener('play', () => {
    // Check if this is the first play or a replay
    const isReplay = player.currentTime === 0 && kpiData.has_started_playing;
    trackPlayEvent(isReplay);
  });
  
  // Video completion
  player.addEventListener('ended', () => {
    kpiData.has_completed = true;
    kpiData.completion_rate = 1.0;
    
    // Send KPI data immediately on completion
    sendKPIData('video_completed');
  });
  
  // Track watch time continuously
  player.subscribe(({ paused, playing, currentTime, duration }) => {
    updateWatchTimeMetrics(currentTime, duration, playing);
  });
  
  // Track replay button clicks
  const replayContainer = document.querySelector('.replay-container');
  if (replayContainer) {
    replayContainer.addEventListener('click', () => {
      kpiData.replay_rate = 1;
      kpiData.has_replayed = true;
    });
  }
  
  // Final KPI submission when tab/window closes
  window.addEventListener('beforeunload', () => {
    sendKPIData('tab_close');
  });
  
  // Backup periodic check (every 60 seconds) to catch any missed completion events
  // This will only send data if play_rate=1 and completion_rate=1 but KPI not yet submitted
  setInterval(() => {
    if (kpiData.has_completed && kpiData.play_rate === 1 && 
        kpiData.completion_rate >= 0.99 && !kpiData.kpi_submitted) {
      sendKPIData('final_submission');
    }
  }, 60000);
}