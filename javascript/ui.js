/**
 * BeatStream User Interface Controller
 * Connects the Database, Audio Engine, Lyrics Engine, and Visualizers to the DOM.
 * Coordinates layouts, drag-and-drop local uploads, EQ sliders, and playlists.
 */

import { Database, BOLLYWOOD_SEEDS } from './database.js';
import { AudioEngine } from './audio.js';
import { LyricsEngine } from './lyrics.js';
import { Visualizer } from './visualizer.js';
import { KeyboardShortcuts } from './shortcuts.js';

export const PlayerUI = {
  tracks: [], // Cached merged tracks list (Procedural + Local DB)
  currentQueue: [], // List of track IDs
  queueIndex: -1,
  currentTrack: null,
  isPlaying: false,
  isMuted: false,
  previousVolume: 0.8,
  activeTab: 'discover',
  selectedPlaylistId: null,
  isPlayingSynthFallback: false,

  async init() {
    await Database.init();
    await this.refreshTracks();

    // Setup volume
    const settings = Database.getSettings();
    this.isMuted = false;
    this.previousVolume = settings.volume || 0.8;
    AudioEngine.setVolume(this.isMuted ? 0 : this.previousVolume);

    // Setup EQ
    if (settings.equalizer) {
      settings.equalizer.forEach((gain, index) => {
        AudioEngine.setEqualizerBand(index, gain);
      });
    }

    // Set theme
    this.applyTheme(settings.theme || 'midnight-blue');

    // Setup visualizer canvas
    const canvas = document.getElementById('visualizer-canvas');
    if (canvas) {
      Visualizer.init(canvas, AudioEngine);
      Visualizer.setMode('bars');
    }

    // Connect audio callbacks
    AudioEngine.onTimeUpdateCallback = (current, duration) => this.updatePlaybackProgress(current, duration);
    AudioEngine.onTrackEndedCallback = () => this.handleTrackEnded();
    AudioEngine.onAudioErrorCallback = () => {
      if (this.currentTrack && !this.isPlayingSynthFallback) {
        console.warn("Playback error on stream URL, falling back to procedural synthesizer.");
        this.isPlayingSynthFallback = true;
        AudioEngine.playSynthTrack(this.currentTrack.id, AudioEngine.audioEl.currentTime || 0, this.currentTrack.duration);
      }
    };

    // Initial UI Render
    this.renderDiscover();
    this.renderHome();
    this.renderSongsTable();
    this.renderPlaylists();
    this.setupEventListeners();
    this.initQueue();

    // Start keyboard shortcuts
    KeyboardShortcuts.init(this);

    // Load last playing track without auto-playing
    const lastTrackId = Database.getCurrentTrackId();
    const lastTime = Database.getPlaybackTime();
    await this.loadTrack(lastTrackId, false, lastTime);
  },

  async refreshTracks() {
    const dbTracks = await Database.getAllTracksFromDB();
    const synthTracks = [
      {
        id: 'synth-1',
        title: 'Chiptune Odyssey',
        artist: 'Procedural Synth Engine',
        album: 'Synthesized Dreams',
        duration: 90,
        genre: '8-Bit Retro',
        isProcedural: true,
        coverGradient: 'linear-gradient(135deg, #fbc2eb 0%, #a18cd1 100%)'
      },
      {
        id: 'synth-2',
        title: 'Midnight Breeze',
        artist: 'Procedural Synth Engine',
        album: 'Ambient Waves',
        duration: 120,
        genre: 'Ambient Lofi',
        isProcedural: true,
        coverGradient: 'linear-gradient(135deg, #00f2fe 0%, #4facfe 100%)'
      },
      {
        id: 'synth-3',
        title: 'Neon Horizon',
        artist: 'Procedural Synth Engine',
        album: 'Retro Future',
        duration: 100,
        genre: 'Synthwave',
        isProcedural: true,
        coverGradient: 'linear-gradient(135deg, #f97316 0%, #ff5e62 100%)'
      }
    ];

    this.tracks = [...synthTracks, ...BOLLYWOOD_SEEDS, ...dbTracks];
  },

  // --- PLAYBACK LOADING & TRIGGERS ---

  async playTrack(id, seekTime = 0) {
    this.isPlaying = true;
    Database.saveCurrentTrackId(id);
    await this.loadTrack(id, true, seekTime);
    this.updatePlayStateUI();
  },

  async loadTrack(id, shouldPlay = true, seekTime = 0) {
    const track = this.tracks.find(t => String(t.id) === String(id));
    if (!track) return;

    this.currentTrack = track;

    // Add to history
    if (shouldPlay) {
      Database.addHistory(id);
      this.renderHome(); // Refresh recently played
    }

    // Load track metadata to player bar
    const titleEl = document.getElementById('player-track-title');
    const artistEl = document.getElementById('player-track-artist');
    const coverEl = document.getElementById('player-cover-img');
    const coverGradientEl = document.getElementById('player-cover-gradient');

    if (titleEl) titleEl.textContent = track.title;
    if (artistEl) artistEl.textContent = track.artist;

    if (track.isProcedural) {
      if (coverEl) coverEl.classList.add('d-none');
      if (coverGradientEl) {
        coverGradientEl.classList.remove('d-none');
        coverGradientEl.style.background = track.coverGradient || 'linear-gradient(135deg, #00f2fe 0%, #4facfe 100%)';
      }
    } else {
      if (track.coverGradient && !track.coverUrl && !track.coverBlob) {
        if (coverEl) coverEl.classList.add('d-none');
        if (coverGradientEl) {
          coverGradientEl.classList.remove('d-none');
          coverGradientEl.style.background = track.coverGradient;
        }
      } else {
        if (coverGradientEl) coverGradientEl.classList.add('d-none');
        if (coverEl) {
          coverEl.classList.remove('d-none');
          if (track.coverBlob) {
            coverEl.src = URL.createObjectURL(track.coverBlob);
          } else if (track.coverUrl) {
            coverEl.src = track.coverUrl;
          } else {
            coverEl.src = 'assets/orange_logo.png'; // Fallback icon
          }
        }
      }
    }

    // Set Favorite Heart state
    const favHeart = document.getElementById('player-favorite-btn');
    if (favHeart) {
      if (Database.isFavorite(id)) {
        favHeart.classList.add('active');
        favHeart.innerHTML = '♥'; // Full heart
      } else {
        favHeart.classList.remove('active');
        favHeart.innerHTML = '♡'; // Empty heart
      }
    }

    // Load Lyrics
    if (track.isProcedural) {
      LyricsEngine.loadProceduralLyrics(track.id, track.title, track.artist, track.duration);
    } else {
      // Mock lyrics for local files based on title
      const mockLrc = `
[00:00.00] (Playing local file: ${track.title})
[00:05.00] Enjoy the high fidelity local audio!
[00:15.00] Adjust the equalizer in settings for custom tuning.
[00:25.00] Open visualizers tab to view canvas animations.
[00:35.00] Support for local LRC files is coming soon.
[00:45.00] BeatStream Music Player - Desktop grade experience.
      `;
      LyricsEngine.parse(mockLrc.trim());
    }

    const lyricsContainer = document.getElementById('lyrics-container');
    if (lyricsContainer) {
      LyricsEngine.render(lyricsContainer);
      LyricsEngine.bindClicks((t) => AudioEngine.seek(t, track.duration));
    }

    // Set up Media Session API
    if ('mediaSession' in navigator) {
      navigator.mediaSession.metadata = new MediaMetadata({
        title: track.title,
        artist: track.artist,
        album: track.album,
        artwork: [
          { src: 'assets/orange_logo.png', sizes: '512x512', type: 'image/png' }
        ]
      });

      navigator.mediaSession.setActionHandler('play', () => this.togglePlayPause());
      navigator.mediaSession.setActionHandler('pause', () => this.togglePlayPause());
      navigator.mediaSession.setActionHandler('nexttrack', () => this.playNextTrack());
      navigator.mediaSession.setActionHandler('previoustrack', () => this.playPreviousTrack());
    }

    // Start/Stop Audio Playback
    if (shouldPlay) {
      this.isPlayingSynthFallback = false;
      if (track.streamUrl) {
        AudioEngine.playUrlTrack(track.streamUrl, seekTime);
      } else if (track.isProcedural) {
        AudioEngine.playSynthTrack(track.id, seekTime, track.duration);
      } else {
        // Retrieve IndexedDB blob
        const dbRecord = await Database.getTrack(track.id);
        if (dbRecord && dbRecord.audioBlob) {
          AudioEngine.playLocalTrack(dbRecord.audioBlob, seekTime);
        } else if (dbRecord && dbRecord.streamUrl) {
          AudioEngine.playUrlTrack(dbRecord.streamUrl, seekTime);
        } else {
          console.warn("Could not find audio blob or stream URL, falling back to synth:", track.id);
          this.isPlayingSynthFallback = true;
          AudioEngine.playSynthTrack(track.id, seekTime, track.duration);
        }
      }
      this.isPlaying = true;
    } else {
      AudioEngine.stop();
      this.isPlaying = false;
      // Pre-populate time slider
      this.updatePlaybackProgress(seekTime, track.duration);
    }

    // Highlight row in track tables
    document.querySelectorAll('tr[data-track-id]').forEach(row => {
      if (String(row.dataset.trackId) === String(id)) {
        row.classList.add('playing-row');
      } else {
        row.classList.remove('playing-row');
      }
    });

    this.updatePlayStateUI();
    this.updateQueueUI();
  },

  togglePlayPause() {
    if (!this.currentTrack) return;
    this.isPlaying = !this.isPlaying;

    if (this.isPlaying) {
      AudioEngine.resume();
    } else {
      AudioEngine.pause();
    }
    this.updatePlayStateUI();
  },

  seekForward(secs) {
    if (!this.currentTrack) return;
    const dur = this.currentTrack.duration;
    const current = Database.getPlaybackTime();
    AudioEngine.seek(current + secs, dur);
  },

  seekBackward(secs) {
    if (!this.currentTrack) return;
    const dur = this.currentTrack.duration;
    const current = Database.getPlaybackTime();
    AudioEngine.seek(Math.max(0, current - secs), dur);
  },

  adjustVolume(delta) {
    const settings = Database.getSettings();
    let vol = (settings.volume || 0.8) + delta;
    vol = Math.max(0, Math.min(vol, 1));
    Database.saveSettings({ volume: vol });
    
    const slider = document.getElementById('volume-slider');
    if (slider) slider.value = Math.round(vol * 100);
    
    AudioEngine.setVolume(this.isMuted ? 0 : vol);
  },

  toggleMute() {
    this.isMuted = !this.isMuted;
    const settings = Database.getSettings();
    const currentVol = settings.volume || 0.8;
    AudioEngine.setVolume(this.isMuted ? 0 : currentVol);

    const btn = document.getElementById('player-mute-btn');
    if (btn) {
      btn.innerHTML = this.isMuted ? '🔇' : '🔊';
      if (this.isMuted) btn.classList.add('muted');
      else btn.classList.remove('muted');
    }
  },

  // --- QUEUE SYSTEM ---

  initQueue() {
    this.currentQueue = Database.getQueue();
    const currentId = Database.getCurrentTrackId();
    this.queueIndex = this.currentQueue.indexOf(currentId);
  },

  setQueue(trackIds, startIndex = 0) {
    this.currentQueue = trackIds;
    Database.saveQueue(trackIds);
    this.queueIndex = startIndex;
    if (this.currentQueue[startIndex]) {
      this.playTrack(this.currentQueue[startIndex]);
    }
  },

  addToQueue(trackId) {
    if (!this.currentQueue.includes(trackId)) {
      this.currentQueue.push(trackId);
      Database.saveQueue(this.currentQueue);
      this.updateQueueUI();
    }
  },

  playNextTrack() {
    if (this.currentQueue.length === 0) return;

    const settings = Database.getSettings();
    
    if (settings.shuffle) {
      // Pick random index
      this.queueIndex = Math.floor(Math.random() * this.currentQueue.length);
    } else {
      this.queueIndex++;
      if (this.queueIndex >= this.currentQueue.length) {
        if (settings.repeat === 'all') {
          this.queueIndex = 0;
        } else {
          this.queueIndex = this.currentQueue.length - 1;
          this.isPlaying = false;
          AudioEngine.stop();
          this.updatePlayStateUI();
          return;
        }
      }
    }

    const nextId = this.currentQueue[this.queueIndex];
    if (nextId) this.playTrack(nextId);
  },

  playPreviousTrack() {
    if (this.currentQueue.length === 0) return;

    this.queueIndex--;
    if (this.queueIndex < 0) {
      const settings = Database.getSettings();
      if (settings.repeat === 'all') {
        this.queueIndex = this.currentQueue.length - 1;
      } else {
        this.queueIndex = 0;
      }
    }

    const prevId = this.currentQueue[this.queueIndex];
    if (prevId) this.playTrack(prevId);
  },

  handleTrackEnded() {
    const settings = Database.getSettings();
    if (settings.repeat === 'one') {
      // Replay same song
      if (this.currentTrack) this.playTrack(this.currentTrack.id);
    } else {
      this.playNextTrack();
    }
  },

  toggleShuffle() {
    const settings = Database.getSettings();
    const shuffleVal = !settings.shuffle;
    Database.saveSettings({ shuffle: shuffleVal });

    const btn = document.getElementById('player-shuffle-btn');
    if (btn) {
      if (shuffleVal) btn.classList.add('active');
      else btn.classList.remove('active');
    }
  },

  cycleRepeatMode() {
    const settings = Database.getSettings();
    let repeatVal = 'all';
    if (settings.repeat === 'all') repeatVal = 'one';
    else if (settings.repeat === 'one') repeatVal = 'off';
    else repeatVal = 'all';

    Database.saveSettings({ repeat: repeatVal });

    const btn = document.getElementById('player-repeat-btn');
    if (btn) {
      btn.classList.remove('repeat-all', 'repeat-one', 'repeat-off');
      if (repeatVal === 'all') {
        btn.classList.add('active', 'repeat-all');
        btn.innerHTML = '🔁';
      } else if (repeatVal === 'one') {
        btn.classList.add('active', 'repeat-one');
        btn.innerHTML = '🔂';
      } else {
        btn.classList.remove('active');
        btn.classList.add('repeat-off');
        btn.innerHTML = '🔁';
      }
    }
  },

  // --- THEME & UI UPDATES ---

  applyTheme(themeName) {
    document.body.className = ''; // Reset body classes
    document.body.classList.add(`theme-${themeName}`);

    // Update settings in LocalStorage
    Database.saveSettings({ theme: themeName });

    // Active state in settings panel buttons
    document.querySelectorAll('.theme-btn').forEach(btn => {
      if (btn.dataset.theme === themeName) {
        btn.classList.add('active');
      } else {
        btn.classList.remove('active');
      }
    });
  },

  updatePlayStateUI() {
    const playBtns = document.querySelectorAll('.play-btn-circle');
    playBtns.forEach(btn => {
      btn.innerHTML = this.isPlaying ? '⏸' : '▶';
    });

    if (this.isPlaying) {
      Visualizer.start();
    } else {
      Visualizer.stop();
    }
  },

  updatePlaybackProgress(current, duration) {
    Database.savePlaybackTime(current);

    const formatTime = (time) => {
      if (isNaN(time)) return '0:00';
      const m = Math.floor(time / 60);
      const s = Math.floor(time % 60).toString().padStart(2, '0');
      return `${m}:${s}`;
    };

    const currentText = document.getElementById('player-time-current');
    const remainingText = document.getElementById('player-time-total');
    const progressBar = document.getElementById('player-progress-bar');

    if (currentText) currentText.textContent = formatTime(current);
    if (remainingText) remainingText.textContent = formatTime(duration);

    if (progressBar) {
      const pct = duration > 0 ? (current / duration) * 100 : 0;
      progressBar.value = pct;
      progressBar.style.background = `linear-gradient(to right, var(--accent-color) ${pct}%, rgba(255, 255, 255, 0.1) ${pct}%)`;
    }

    // Sync Lyrics
    LyricsEngine.sync(current);
  },

  // --- PAGE RENDERING MODULES ---

  switchTab(tabId, data = null) {
    if (tabId === 'favorites') {
      tabId = 'playlist-detail';
      data = 'favorites';
    } else if (tabId === 'recently-played') {
      tabId = 'home';
    } else if (tabId === 'top-charts') {
      tabId = 'discover';
    }

    this.activeTab = tabId;
    
    // Hide all tab panes
    document.querySelectorAll('.tab-pane').forEach((pane) => {
      pane.classList.add('d-none');
    });

    // Remove active class from navigation elements
    document.querySelectorAll('.sidebar-nav-item').forEach((item) => {
      item.classList.remove('active');
    });

    // Show active pane
    const activePane = document.getElementById(`pane-${tabId}`);
    if (activePane) {
      activePane.classList.remove('d-none');
    }

    // Highlight sidebar items
    const navItem = document.querySelector(`.sidebar-nav-item[data-tab="${tabId}"]`);
    if (navItem) {
      navItem.classList.add('active');
    }

    // Custom tab lifecycle actions
    if (tabId === 'discover') {
      this.renderDiscover();
    } else if (tabId === 'home') {
      this.renderHome();
    } else if (tabId === 'songs') {
      this.renderSongsTable();
    } else if (tabId === 'playlists') {
      this.renderPlaylists();
    } else if (tabId === 'playlist-detail' && data) {
      this.renderPlaylistDetail(data);
    } else if (tabId === 'settings') {
      this.renderSettings();
    } else if (tabId === 'artist-detail' && data) {
      this.renderArtistDetail(data);
    } else if (tabId === 'album-detail' && data) {
      this.renderAlbumDetail(data);
    }

    // Handle full screen visualizer active loop
    if (tabId === 'visualizers') {
      Visualizer.resize();
      if (this.isPlaying) Visualizer.start();
    } else {
      // If we are playing, visualizer runs in small bar backgrounds, but we can resize canvas
    }
  },

  renderDiscover() {
    const discoverContainer = document.getElementById('discover-featured-albums');
    if (!discoverContainer) return;

    discoverContainer.innerHTML = '';
    
    // Default featured albums matching the mockup
    const featuredAlbums = [
      {
        id: 'pl-movie-0', // Ek Tha Tiger -> Aether Waves
        title: 'Aether Waves',
        artist: 'Midnight Pulse',
        coverUrl: 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?auto=format&fit=crop&w=300&q=80',
        active: true
      },
      {
        id: 'pl-movie-7', // Rockstar -> Nova Horizon
        title: 'Nova Horizon',
        artist: 'Cosmic Echo',
        coverUrl: 'https://images.unsplash.com/photo-1506318137071-a8e063b4bec0?auto=format&fit=crop&w=300&q=80'
      },
      {
        id: 'pl-movie-2', // Yeh Jawaani -> Indigo Dreams
        title: 'Indigo Dreams',
        artist: 'Luminous Kid',
        coverUrl: 'https://images.unsplash.com/photo-1534447677768-be436bb09401?auto=format&fit=crop&w=300&q=80'
      },
      {
        id: 'pl-movie-4', // Dhurandhar -> Neon City
        title: 'Neon City',
        artist: 'Cyber Funk',
        coverUrl: 'https://images.unsplash.com/photo-1515621061946-eff1c2a352bd?auto=format&fit=crop&w=300&q=80'
      },
      {
        id: 'pl-movie-1', // Aashiqui 2 -> Velvet Nights
        title: 'Velvet Nights',
        artist: 'Soul Echoes',
        coverUrl: 'https://images.unsplash.com/photo-1509198397868-475647b2a1e5?auto=format&fit=crop&w=300&q=80'
      },
      {
        id: 'pl-movie-3', // 3 Idiots -> Prism Theory
        title: 'Prism Theory',
        artist: 'Spectral Flow',
        coverUrl: 'https://images.unsplash.com/photo-1614850523459-c2f4c699c52e?auto=format&fit=crop&w=300&q=80'
      },
      {
        id: 'pl-movie-8', // Kabir Singh -> Astral Journey
        title: 'Astral Journey',
        artist: 'Space Cadets',
        coverUrl: 'https://images.unsplash.com/photo-1462331940025-496dfbfc7564?auto=format&fit=crop&w=300&q=80'
      },
      {
        id: 'pl-movie-5', // Om Shanti Om -> Gravity Drop
        title: 'Gravity Drop',
        artist: 'Bass Collective',
        coverUrl: 'https://images.unsplash.com/photo-1541701494587-cb58502866ab?auto=format&fit=crop&w=300&q=80'
      },
      {
        id: 'pl-movie-6', // Zindagi Na Milegi -> Urban Tales
        title: 'Urban Tales',
        artist: 'Vinyl Souls',
        coverUrl: 'https://images.unsplash.com/photo-1514525253161-7a46d19cd819?auto=format&fit=crop&w=300&q=80'
      },
      {
        id: 'pl-movie-9', // Ae Dil Hai Mushkil -> Digital Rain
        title: 'Digital Rain',
        artist: 'The Grid',
        coverUrl: 'https://images.unsplash.com/photo-1526374965328-7f61d4dc18c5?auto=format&fit=crop&w=300&q=80'
      }
    ];

    featuredAlbums.forEach(album => {
      const col = document.createElement('div');
      col.classList.add('col-6', 'col-md-4', 'col-lg-3', 'mb-4');
      
      const isActive = album.active ? 'active-album-card' : '';
      
      col.innerHTML = `
        <div class="discover-album-card glass-card p-3 h-100 ${isActive}" data-playlist-id="${album.id}" style="border: 1px solid var(--surface-border); border-radius: 12px; transition: transform 0.3s, box-shadow 0.3s; background: rgba(28,28,38,0.4); backdrop-filter: blur(10px);">
          <div class="discover-album-cover-container mb-3 position-relative rounded overflow-hidden" style="cursor: pointer;">
            <img src="${album.coverUrl}" alt="${album.title}" class="discover-album-img w-100 h-100 object-fit-cover" style="aspect-ratio: 1; transition: transform 0.3s;" />
            <div class="discover-album-overlay d-flex align-items-center justify-content-center" style="position: absolute; top:0; left:0; width:100%; height:100%; background: rgba(0,0,0,0.5); opacity: 0; transition: opacity 0.2s;">
              <button class="btn btn-info rounded-circle play-discover-btn" data-playlist-id="${album.id}" style="width: 45px; height: 45px; display: flex; align-items: center; justify-content: center;">▶</button>
            </div>
            <button class="favorite-star-btn position-absolute bottom-2 right-2 btn p-0 text-white-50 fs-5" style="z-index: 5; border:none; background:none;">★</button>
          </div>
          <h6 class="text-white text-truncate mb-1 font-gilroy-bold">${album.title}</h6>
          <p class="text-white-50 text-truncate small mb-0">${album.artist}</p>
        </div>
      `;

      // Hover overlay effects
      const cardCover = col.querySelector('.discover-album-cover-container');
      const img = col.querySelector('.discover-album-img');
      const overlay = col.querySelector('.discover-album-overlay');
      cardCover.addEventListener('mouseenter', () => {
        if(img) img.style.transform = 'scale(1.08)';
        if(overlay) overlay.style.opacity = '1';
      });
      cardCover.addEventListener('mouseleave', () => {
        if(img) img.style.transform = 'scale(1.0)';
        if(overlay) overlay.style.opacity = '0';
      });

      col.querySelector('.discover-album-card').addEventListener('click', (e) => {
        if (e.target.closest('.play-discover-btn') || e.target.closest('.favorite-star-btn')) return;
        this.switchTab('playlist-detail', album.id);
      });

      col.querySelector('.play-discover-btn').addEventListener('click', (e) => {
        e.stopPropagation();
        const pl = Database.getPlaylists().find(p => p.id === album.id);
        if (pl && pl.tracks.length > 0) {
          this.setQueue(pl.tracks, 0);
        }
      });

      const starBtn = col.querySelector('.favorite-star-btn');
      starBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        starBtn.classList.toggle('active');
        starBtn.style.color = starBtn.classList.contains('active') ? '#00f2fe' : 'rgba(255,255,255,0.5)';
      });

      discoverContainer.appendChild(col);
    });
  },

  async searchYouTubeAndRender(query) {
    const resultsContainer = document.getElementById('discover-yt-results');
    const spinner = document.getElementById('discover-yt-spinner');
    const resultsSection = document.getElementById('discover-yt-section');

    if (!resultsContainer || !resultsSection) return;

    if (spinner) spinner.classList.remove('d-none');
    resultsSection.classList.remove('d-none');
    resultsContainer.innerHTML = '';

    try {
      const { YouTubeService } = await import('./youtube.js');
      const results = await YouTubeService.search(query);
      
      if (spinner) spinner.classList.add('d-none');
      
      if (results.length === 0) {
        resultsContainer.innerHTML = `<div class="col-12 text-center text-white-50 py-3">No results found on YouTube Music.</div>`;
        return;
      }

      results.forEach(track => {
        const isImported = this.tracks.some(t => String(t.id) === String(track.id) || (t.isYouTube && t.videoId === track.videoId));

        const col = document.createElement('div');
        col.classList.add('col-12', 'col-md-6', 'mb-3');
        
        col.innerHTML = `
          <div class="yt-search-card glass-card d-flex align-items-center p-2" data-video-id="${track.videoId}" style="border: 1px solid var(--surface-border); border-radius: 10px; background: rgba(28,28,38,0.4); backdrop-filter: blur(10px);">
            <img src="${track.coverUrl}" alt="${track.title}" class="yt-card-cover rounded" style="width: 50px; height: 50px; object-fit: cover;" />
            <div class="flex-grow-1 ms-3 text-truncate">
              <h6 class="mb-0 text-white text-truncate font-gilroy-bold text-capitalize">${track.title}</h6>
              <small class="text-white-50 text-truncate d-block">${track.artist}</small>
            </div>
            <div class="d-flex align-items-center gap-2">
              <button class="btn btn-outline-info btn-sm rounded-circle play-yt-btn" style="width: 32px; height: 32px; display: flex; align-items: center; justify-content: center;" title="Stream Now">▶</button>
              <button class="btn btn-sm rounded-circle import-yt-btn ${isImported ? 'btn-success disabled' : 'btn-outline-light'}" style="width: 32px; height: 32px; display: flex; align-items: center; justify-content: center;" title="${isImported ? 'Imported' : 'Import Track'}">
                ${isImported ? '✓' : '＋'}
              </button>
            </div>
          </div>
        `;

        col.querySelector('.play-yt-btn').addEventListener('click', () => {
          if (!this.tracks.some(t => String(t.id) === String(track.id))) {
            this.tracks.push(track);
          }
          this.setQueue([track.id], 0);
        });

        const importBtn = col.querySelector('.import-yt-btn');
        if (!isImported) {
          importBtn.addEventListener('click', async () => {
            try {
              importBtn.classList.remove('btn-outline-light');
              importBtn.classList.add('btn-success', 'disabled');
              importBtn.innerHTML = '✓';
              
              const saved = await Database.saveTrack(null, {
                title: track.title,
                artist: track.artist,
                album: 'YouTube Music',
                genre: 'YouTube Stream',
                duration: track.duration,
                coverUrl: track.coverUrl,
                streamUrl: track.streamUrl,
                isYouTube: true
              });

              this.tracks.push(saved);
              await this.refreshTracks();
              this.renderSongsTable();
              alert(`"${track.title}" has been successfully imported to your library!`);
            } catch (err) {
              console.error("Failed to import YouTube track:", err);
              alert("Failed to import track.");
              importBtn.classList.remove('btn-success', 'disabled');
              importBtn.classList.add('btn-outline-light');
              importBtn.innerHTML = '＋';
            }
          });
        }

        resultsContainer.appendChild(col);
      });
    } catch (err) {
      console.error("YouTube search error:", err);
      if (spinner) spinner.classList.add('d-none');
      resultsContainer.innerHTML = `<div class="col-12 text-center text-danger py-3">Error fetching search results. Please try again.</div>`;
    }
  },

  renderHome() {
    const greetingEl = document.getElementById('home-greeting');
    if (greetingEl) {
      const hour = new Date().getHours();
      let greeting = 'Good Evening';
      if (hour < 12) greeting = 'Good Morning';
      else if (hour < 18) greeting = 'Good Afternoon';
      greetingEl.textContent = `${greeting}, Music Lover`;
    }

    // Render Quick Picks (first 4 tracks)
    const quickPicksContainer = document.getElementById('home-quick-picks');
    if (quickPicksContainer) {
      quickPicksContainer.innerHTML = '';
      const picks = this.tracks.slice(0, 4);

      picks.forEach(track => {
        const item = document.createElement('div');
        item.classList.add('quick-pick-item', 'glass-card', 'd-flex', 'align-items-center', 'p-2');
        item.dataset.trackId = track.id;
        
        let coverHtml = '';
        if (track.isProcedural) {
          coverHtml = `<div class="quick-cover-gradient" style="background: ${track.coverGradient}"></div>`;
        } else if (track.coverBlob) {
          coverHtml = `<img src="${URL.createObjectURL(track.coverBlob)}" alt="${track.title}" class="quick-cover-img" />`;
        } else {
          coverHtml = `<img src="assets/orange_logo.png" alt="${track.title}" class="quick-cover-img" style="filter: grayscale(1);" />`;
        }

        item.innerHTML = `
          ${coverHtml}
          <div class="flex-grow-1 ms-3 text-truncate">
            <h6 class="mb-0 text-white text-truncate text-capitalize font-gilroy-bold">${track.title}</h6>
            <small class="text-white-50 text-truncate">${track.artist}</small>
          </div>
          <button class="btn btn-outline-light btn-sm rounded-circle play-track-btn" data-track-id="${track.id}">▶</button>
        `;
        quickPicksContainer.appendChild(item);
      });
    }

    // Render Recently Played
    const recentContainer = document.getElementById('home-recently-played');
    if (recentContainer) {
      recentContainer.innerHTML = '';
      const history = Database.getHistory();
      
      if (history.length === 0) {
        recentContainer.innerHTML = `
          <div class="col-12 py-4 text-center text-white-50 glass-card">
            <p class="mb-0">No playback history yet. Start listening to see your history!</p>
          </div>
        `;
        return;
      }

      // Render max 6 items
      history.slice(0, 6).forEach(histItem => {
        const track = this.tracks.find(t => String(t.id) === String(histItem.trackId));
        if (!track) return;

        const col = document.createElement('div');
        col.classList.add('col-6', 'col-md-4', 'col-lg-2', 'mb-3');
        
        let coverHtml = '';
        if (track.isProcedural) {
          coverHtml = `<div class="album-card-gradient" style="background: ${track.coverGradient}"></div>`;
        } else if (track.coverBlob) {
          coverHtml = `<img src="${URL.createObjectURL(track.coverBlob)}" alt="${track.title}" class="album-card-img" />`;
        } else {
          coverHtml = `<img src="assets/orange_logo.png" alt="${track.title}" class="album-card-img" style="filter: grayscale(1);" />`;
        }

        col.innerHTML = `
          <div class="album-card glass-card text-center p-3 h-100" data-track-id="${track.id}">
            <div class="album-card-cover-container mb-3 position-relative">
              ${coverHtml}
              <div class="album-card-overlay d-flex align-items-center justify-content-center">
                <button class="btn btn-primary play-btn-card rounded-circle" data-track-id="${track.id}">▶</button>
              </div>
            </div>
            <h6 class="text-white text-truncate mb-1 font-gilroy-bold text-capitalize">${track.title}</h6>
            <p class="text-white-50 text-truncate small mb-0">${track.artist}</p>
          </div>
        `;
        recentContainer.appendChild(col);
      });
    }

    // Render Home Artists Circles
    const artistContainer = document.getElementById('home-featured-artists');
    if (artistContainer) {
      artistContainer.innerHTML = '';
      
      // Get unique artists
      const uniqueArtists = [...new Set(this.tracks.map(t => t.artist))].slice(0, 5);
      uniqueArtists.forEach(artist => {
        const col = document.createElement('div');
        col.classList.add('col-4', 'col-md-2', 'text-center', 'mb-3');
        col.innerHTML = `
          <div class="artist-circle-card cursor-pointer" data-artist-name="${artist}">
            <div class="artist-avatar mx-auto mb-2 d-flex align-items-center justify-content-center text-white font-gilroy-bold">
              ${artist[0].toUpperCase()}
            </div>
            <h6 class="text-white text-truncate small mb-0">${artist}</h6>
          </div>
        `;
        artistContainer.appendChild(col);
      });
    }

    // Render Home Albums
    const albumContainer = document.getElementById('home-featured-albums');
    if (albumContainer) {
      albumContainer.innerHTML = '';
      const uniqueAlbums = [];
      this.tracks.forEach(track => {
        if (!uniqueAlbums.some(a => a.name === track.album && a.artist === track.artist)) {
          uniqueAlbums.push({ name: track.album, artist: track.artist, trackId: track.id, isProcedural: track.isProcedural, coverGradient: track.coverGradient, coverBlob: track.coverBlob });
        }
      });

      uniqueAlbums.slice(0, 4).forEach(album => {
        const col = document.createElement('div');
        col.classList.add('col-6', 'col-md-3', 'mb-3');

        let coverHtml = '';
        if (album.isProcedural) {
          coverHtml = `<div class="album-card-gradient" style="background: ${album.coverGradient}"></div>`;
        } else if (album.coverBlob) {
          coverHtml = `<img src="${URL.createObjectURL(album.coverBlob)}" alt="${album.name}" class="album-card-img" />`;
        } else {
          coverHtml = `<img src="assets/orange_logo.png" alt="${album.name}" class="album-card-img" style="filter: grayscale(1);" />`;
        }

        col.innerHTML = `
          <div class="album-card glass-card text-center p-3 h-100" data-album-name="${album.name}" data-artist-name="${album.artist}">
            <div class="album-card-cover-container mb-3 position-relative">
              ${coverHtml}
              <div class="album-card-overlay d-flex align-items-center justify-content-center">
                <button class="btn btn-secondary rounded-circle view-album-btn" data-album-name="${album.name}" data-artist-name="${album.artist}">👁</button>
              </div>
            </div>
            <h6 class="text-white text-truncate mb-1 font-gilroy-bold">${album.name}</h6>
            <p class="text-white-50 text-truncate small mb-0">${album.artist}</p>
          </div>
        `;
        albumContainer.appendChild(col);
      });
    }
  },

  renderSongsTable(filterText = '') {
    const tableBody = document.getElementById('songs-table-body');
    if (!tableBody) return;

    tableBody.innerHTML = '';

    // Filter tracks
    const filtered = this.tracks.filter(track => {
      const matchText = filterText.toLowerCase();
      return track.title.toLowerCase().includes(matchText) ||
             track.artist.toLowerCase().includes(matchText) ||
             track.album.toLowerCase().includes(matchText);
    });

    if (filtered.length === 0) {
      tableBody.innerHTML = `
        <tr>
          <td colspan="5" class="text-center py-4 text-white-50">
            No tracks found matching your query. Drag and drop MP3s to add!
          </td>
        </tr>
      `;
      return;
    }

    filtered.forEach((track, index) => {
      const row = document.createElement('tr');
      row.dataset.trackId = track.id;
      if (this.currentTrack && String(this.currentTrack.id) === String(track.id)) {
        row.classList.add('playing-row');
      }

      const formatSecs = (secs) => {
        const m = Math.floor(secs / 60);
        const s = Math.floor(secs % 60).toString().padStart(2, '0');
        return `${m}:${s}`;
      };

      const isFav = Database.isFavorite(track.id);
      const rowNum = index + 1;

      row.innerHTML = `
        <td class="text-white-50 width-row-num">${rowNum}</td>
        <td>
          <div class="d-flex align-items-center">
            <div class="song-table-cover me-3">
              ${track.isProcedural 
                ? `<div class="table-cover-gradient" style="background: ${track.coverGradient}"></div>`
                : (track.coverBlob 
                    ? `<img src="${URL.createObjectURL(track.coverBlob)}" alt="${track.title}" />`
                    : `<img src="assets/orange_logo.png" style="filter: grayscale(1);" />`
                  )
              }
            </div>
            <div class="text-truncate">
              <span class="text-white font-gilroy-bold d-block text-capitalize cursor-pointer play-row-title">${track.title}</span>
              <span class="text-white-50 small cursor-pointer hover-link view-row-artist">${track.artist}</span>
            </div>
          </div>
        </td>
        <td><span class="text-white-50 cursor-pointer hover-link view-row-album">${track.album}</span></td>
        <td class="text-white-50">${formatSecs(track.duration)}</td>
        <td>
          <div class="d-flex align-items-center gap-2">
            <button class="btn btn-link text-white-50 fav-row-btn ${isFav ? 'active text-danger' : ''}">${isFav ? '♥' : '♡'}</button>
            <div class="dropdown">
              <button class="btn btn-link text-white-50 dropdown-toggle no-caret" data-bs-toggle="dropdown">⋮</button>
              <ul class="dropdown-menu dropdown-menu-dark dropdown-menu-end">
                <li><a class="dropdown-item add-to-queue-item" href="#">Add to Queue</a></li>
                <li><hr class="dropdown-divider"></li>
                <li class="dropdown-header">Add to Playlist</li>
                ${Database.getPlaylists().filter(p => !p.isSystem).map(p => `
                  <li><a class="dropdown-item add-to-playlist-item" data-playlist-id="${p.id}" href="#">${p.name}</a></li>
                `).join('')}
                ${Database.getPlaylists().filter(p => !p.isSystem).length === 0 ? '<li><a class="dropdown-item disabled" href="#">No playlists</a></li>' : ''}
                ${!track.isProcedural ? `
                  <li><hr class="dropdown-divider"></li>
                  <li><a class="dropdown-item text-danger delete-track-item" href="#">Delete Track</a></li>
                ` : ''}
              </ul>
            </div>
          </div>
        </td>
      `;

      // Event handlers inside row
      row.querySelector('.play-row-title').addEventListener('click', () => {
        // Set queue to filtered list and play
        const qIds = filtered.map(t => t.id);
        const qIdx = qIds.indexOf(track.id);
        this.setQueue(qIds, qIdx);
      });

      row.querySelector('.view-row-artist').addEventListener('click', () => {
        this.switchTab('artist-detail', track.artist);
      });

      row.querySelector('.view-row-album').addEventListener('click', () => {
        this.switchTab('album-detail', { name: track.album, artist: track.artist });
      });

      row.querySelector('.fav-row-btn').addEventListener('click', (e) => {
        const heartBtn = e.target;
        const activated = Database.toggleFavorite(track.id);
        if (activated) {
          heartBtn.innerHTML = '♥';
          heartBtn.classList.add('active', 'text-danger');
        } else {
          heartBtn.innerHTML = '♡';
          heartBtn.classList.remove('active', 'text-danger');
        }
        this.renderHome();
      });

      // Dropdown Actions
      row.querySelector('.add-to-queue-item').addEventListener('click', (e) => {
        e.preventDefault();
        this.addToQueue(track.id);
      });

      row.querySelectorAll('.add-to-playlist-item').forEach(item => {
        item.addEventListener('click', (e) => {
          e.preventDefault();
          const plId = item.dataset.playlistId;
          const added = Database.addTrackToPlaylist(plId, track.id);
          if (added) {
            alert(`Added to playlist!`);
          } else {
            alert(`Song is already in playlist.`);
          }
        });
      });

      const delBtn = row.querySelector('.delete-track-item');
      if (delBtn) {
        delBtn.addEventListener('click', async (e) => {
          e.preventDefault();
          if (confirm(`Are you sure you want to delete ${track.title}?`)) {
            await Database.deleteTrackFromDB(track.id);
            await this.refreshTracks();
            this.renderSongsTable(filterText);
            this.renderHome();
            this.initQueue();
          }
        });
      }

      tableBody.appendChild(row);
    });
  },

  renderPlaylists() {
    const listContainer = document.getElementById('playlists-container');
    if (!listContainer) return;

    listContainer.innerHTML = '';
    const playlists = Database.getPlaylists();

    playlists.forEach(pl => {
      const col = document.createElement('div');
      col.classList.add('col-6', 'col-md-4', 'col-lg-3', 'mb-4');

      col.innerHTML = `
        <div class="playlist-card glass-card text-center p-3 h-100 cursor-pointer" data-playlist-id="${pl.id}">
          <div class="playlist-cover-gradient mb-3" style="background: ${pl.coverGradient || 'linear-gradient(135deg, #a18cd1 0%, #fbc2eb 100%)'}">
            <span class="playlist-cover-letters">${pl.name.slice(0, 2).toUpperCase()}</span>
          </div>
          <h5 class="text-white text-truncate font-gilroy-bold mb-1">${pl.name}</h5>
          <p class="text-white-50 text-truncate small mb-2">${pl.tracks.length} tracks</p>
          ${!pl.isSystem ? `<button class="btn btn-outline-danger btn-sm delete-pl-btn" data-playlist-id="${pl.id}">Delete</button>` : ''}
        </div>
      `;

      col.querySelector('.playlist-card').addEventListener('click', (e) => {
        if (e.target.classList.contains('delete-pl-btn')) return;
        this.switchTab('playlist-detail', pl.id);
      });

      const delBtn = col.querySelector('.delete-pl-btn');
      if (delBtn) {
        delBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          if (confirm(`Delete playlist "${pl.name}"?`)) {
            Database.deletePlaylist(pl.id);
            this.renderPlaylists();
          }
        });
      }

      listContainer.appendChild(col);
    });
  },

  renderPlaylistDetail(playlistId) {
    const pl = Database.getPlaylists().find(p => p.id === playlistId);
    if (!pl) return;

    this.selectedPlaylistId = playlistId;

    const bannerName = document.getElementById('playlist-detail-name');
    const bannerDesc = document.getElementById('playlist-detail-desc');
    const bannerCount = document.getElementById('playlist-detail-count');
    const bannerCover = document.getElementById('playlist-detail-cover');

    if (bannerName) bannerName.textContent = pl.name;
    if (bannerDesc) bannerDesc.textContent = pl.description || 'No description provided.';
    if (bannerCount) bannerCount.textContent = `${pl.tracks.length} tracks`;
    if (bannerCover) {
      bannerCover.style.background = pl.coverGradient || 'linear-gradient(135deg, #a18cd1 0%, #fbc2eb 100%)';
      bannerCover.innerHTML = `<span class="detail-cover-text">${pl.name.slice(0, 2).toUpperCase()}</span>`;
    }

    const tableBody = document.getElementById('playlist-songs-table-body');
    if (!tableBody) return;
    tableBody.innerHTML = '';

    const playlistTracks = this.tracks.filter(t => pl.tracks.map(String).includes(String(t.id)));

    if (playlistTracks.length === 0) {
      tableBody.innerHTML = `
        <tr>
          <td colspan="5" class="text-center py-4 text-white-50">
            No tracks in this playlist yet. Add tracks from the Songs list!
          </td>
        </tr>
      `;
      return;
    }

    playlistTracks.forEach((track, index) => {
      const row = document.createElement('tr');
      row.dataset.trackId = track.id;
      row.draggable = true; // Drag and drop reordering
      if (this.currentTrack && String(this.currentTrack.id) === String(track.id)) {
        row.classList.add('playing-row');
      }

      const formatSecs = (secs) => {
        const m = Math.floor(secs / 60);
        const s = Math.floor(secs % 60).toString().padStart(2, '0');
        return `${m}:${s}`;
      };

      row.innerHTML = `
        <td class="text-white-50 drag-handle" style="cursor: move;">☰</td>
        <td>
          <div class="d-flex align-items-center">
            <div class="song-table-cover me-3">
              ${track.isProcedural 
                ? `<div class="table-cover-gradient" style="background: ${track.coverGradient}"></div>`
                : (track.coverBlob 
                    ? `<img src="${URL.createObjectURL(track.coverBlob)}" />`
                    : `<img src="assets/orange_logo.png" style="filter: grayscale(1);" />`
                  )
              }
            </div>
            <div>
              <span class="text-white font-gilroy-bold d-block text-capitalize cursor-pointer play-pl-row-title">${track.title}</span>
              <span class="text-white-50 small">${track.artist}</span>
            </div>
          </div>
        </td>
        <td class="text-white-50">${track.album}</td>
        <td class="text-white-50">${formatSecs(track.duration)}</td>
        <td>
          <button class="btn btn-link text-white-50 remove-pl-row-btn">✕</button>
        </td>
      `;

      row.querySelector('.play-pl-row-title').addEventListener('click', () => {
        const qIds = playlistTracks.map(t => t.id);
        const qIdx = qIds.indexOf(track.id);
        this.setQueue(qIds, qIdx);
      });

      row.querySelector('.remove-pl-row-btn').addEventListener('click', () => {
        Database.removeTrackFromPlaylist(playlistId, track.id);
        this.renderPlaylistDetail(playlistId);
      });

      // DRAG AND DROP HANDLERS
      row.addEventListener('dragstart', (e) => {
        e.dataTransfer.setData('text/plain', index);
        row.classList.add('dragging');
      });

      row.addEventListener('dragend', () => {
        row.classList.remove('dragging');
      });

      row.addEventListener('dragover', (e) => {
        e.preventDefault();
      });

      row.addEventListener('drop', (e) => {
        e.preventDefault();
        const fromIndex = parseInt(e.dataTransfer.getData('text/plain'), 10);
        const toIndex = index;

        if (fromIndex !== toIndex) {
          const trackIds = [...pl.tracks];
          const [movedId] = trackIds.splice(fromIndex, 1);
          trackIds.splice(toIndex, 0, movedId);
          
          Database.reorderPlaylistTracks(playlistId, trackIds);
          this.renderPlaylistDetail(playlistId);
        }
      });

      tableBody.appendChild(row);
    });

    // Play playlist button action
    const playPlBtn = document.getElementById('play-playlist-detail-btn');
    if (playPlBtn) {
      // Clear previous listeners
      const newPlayPlBtn = playPlBtn.cloneNode(true);
      playPlBtn.parentNode.replaceChild(newPlayPlBtn, playPlBtn);

      newPlayPlBtn.addEventListener('click', () => {
        const qIds = playlistTracks.map(t => t.id);
        if (qIds.length > 0) {
          this.setQueue(qIds, 0);
        }
      });
    }
  },

  renderArtistDetail(artistName) {
    const bannerName = document.getElementById('artist-detail-name');
    const bannerBio = document.getElementById('artist-detail-bio');
    const popularTable = document.getElementById('artist-songs-table-body');

    if (bannerName) bannerName.textContent = artistName;
    if (bannerBio) {
      bannerBio.textContent = `Premium artist discovery page for ${artistName}. Enjoy all their synthesized tracks and imported albums.`;
    }

    if (popularTable) {
      popularTable.innerHTML = '';
      const artistTracks = this.tracks.filter(t => t.artist === artistName);

      if (artistTracks.length === 0) {
        popularTable.innerHTML = `
          <tr>
            <td colspan="4" class="text-center py-4 text-white-50">
              No tracks for this artist.
            </td>
          </tr>
        `;
        return;
      }

      artistTracks.forEach((track, index) => {
        const row = document.createElement('tr');
        row.dataset.trackId = track.id;
        if (this.currentTrack && String(this.currentTrack.id) === String(track.id)) {
          row.classList.add('playing-row');
        }

        const formatSecs = (secs) => {
          const m = Math.floor(secs / 60);
          const s = Math.floor(secs % 60).toString().padStart(2, '0');
          return `${m}:${s}`;
        };

        row.innerHTML = `
          <td class="text-white-50">${index + 1}</td>
          <td>
            <span class="text-white font-gilroy-bold cursor-pointer play-artist-song-title text-capitalize">${track.title}</span>
          </td>
          <td class="text-white-50">${track.album}</td>
          <td class="text-white-50">${formatSecs(track.duration)}</td>
        `;

        row.querySelector('.play-artist-song-title').addEventListener('click', () => {
          const qIds = artistTracks.map(t => t.id);
          const qIdx = qIds.indexOf(track.id);
          this.setQueue(qIds, qIdx);
        });

        popularTable.appendChild(row);
      });
    }
  },

  renderAlbumDetail(albumData) {
    const bannerName = document.getElementById('album-detail-name');
    const bannerArtist = document.getElementById('album-detail-artist');
    const tracksTable = document.getElementById('album-songs-table-body');

    if (bannerName) bannerName.textContent = albumData.name;
    if (bannerArtist) bannerArtist.textContent = albumData.artist;

    if (tracksTable) {
      tracksTable.innerHTML = '';
      const albumTracks = this.tracks.filter(t => t.album === albumData.name && t.artist === albumData.artist);

      if (albumTracks.length === 0) {
        tracksTable.innerHTML = `
          <tr>
            <td colspan="3" class="text-center py-4 text-white-50">
              No tracks in this album.
            </td>
          </tr>
        `;
        return;
      }

      albumTracks.forEach((track, index) => {
        const row = document.createElement('tr');
        row.dataset.trackId = track.id;
        if (this.currentTrack && String(this.currentTrack.id) === String(track.id)) {
          row.classList.add('playing-row');
        }

        const formatSecs = (secs) => {
          const m = Math.floor(secs / 60);
          const s = Math.floor(secs % 60).toString().padStart(2, '0');
          return `${m}:${s}`;
        };

        row.innerHTML = `
          <td class="text-white-50">${index + 1}</td>
          <td>
            <span class="text-white font-gilroy-bold cursor-pointer play-album-song-title text-capitalize">${track.title}</span>
          </td>
          <td class="text-white-50">${formatSecs(track.duration)}</td>
        `;

        row.querySelector('.play-album-song-title').addEventListener('click', () => {
          const qIds = albumTracks.map(t => t.id);
          const qIdx = qIds.indexOf(track.id);
          this.setQueue(qIds, qIdx);
        });

        tracksTable.appendChild(row);
      });
    }
  },

  renderSettings() {
    const settings = Database.getSettings();

    // Set Slider positions
    const eqSliders = document.querySelectorAll('.eq-slider');
    eqSliders.forEach((slider, index) => {
      if (settings.equalizer && settings.equalizer[index] !== undefined) {
        slider.value = settings.equalizer[index];
      }
    });

    // Spatializer toggle
    const spatBtn = document.getElementById('settings-spatial-toggle');
    if (spatBtn) {
      spatBtn.checked = settings.spatializer || false;
    }

    // Playback Speed Selector
    const speedSelect = document.getElementById('settings-speed-select');
    if (speedSelect) {
      speedSelect.value = (settings.speed || 1.0).toString();
    }
  },

  updateQueueUI() {
    const container = document.getElementById('queue-list-container');
    if (!container) return;

    container.innerHTML = '';

    if (this.currentQueue.length === 0) {
      container.innerHTML = `<div class="p-3 text-center text-white-50 small">Queue is empty</div>`;
      return;
    }

    this.currentQueue.forEach((trackId, index) => {
      const track = this.tracks.find(t => String(t.id) === String(trackId));
      if (!track) return;

      const item = document.createElement('div');
      item.classList.add('queue-item', 'd-flex', 'align-items-center', 'p-2');
      if (index === this.queueIndex) {
        item.classList.add('active');
      }

      item.innerHTML = `
        <span class="text-white-50 small me-2 width-row-num">${index + 1}</span>
        <div class="flex-grow-1 text-truncate">
          <span class="text-white d-block text-capitalize font-gilroy-bold text-truncate small">${track.title}</span>
          <span class="text-white-50 text-truncate x-small">${track.artist}</span>
        </div>
        <button class="btn btn-link btn-sm text-white-50 remove-queue-btn">✕</button>
      `;

      item.addEventListener('click', (e) => {
        if (e.target.classList.contains('remove-queue-btn')) return;
        this.queueIndex = index;
        this.playTrack(trackId);
      });

      item.querySelector('.remove-queue-btn').addEventListener('click', (e) => {
        e.stopPropagation();
        this.currentQueue.splice(index, 1);
        Database.saveQueue(this.currentQueue);
        if (index === this.queueIndex) {
          // Play next or stop
          if (this.currentQueue.length > 0) {
            this.queueIndex = Math.min(this.queueIndex, this.currentQueue.length - 1);
            this.playTrack(this.currentQueue[this.queueIndex]);
          } else {
            this.queueIndex = -1;
            AudioEngine.stop();
            this.isPlaying = false;
            this.updatePlayStateUI();
          }
        } else if (index < this.queueIndex) {
          this.queueIndex--;
        }
        this.updateQueueUI();
      });

      container.appendChild(item);
    });
  },

  // --- EVENTS & HANDLERS ---

  setupEventListeners() {
    // Sidebar Tabs
    document.querySelectorAll('.sidebar-nav-item').forEach((item) => {
      item.addEventListener('click', () => {
        const tab = item.dataset.tab;
        this.switchTab(tab);
      });
    });

    // Sidebar Playlists Shortcuts
    document.querySelectorAll('.sidebar-nav-item-playlist').forEach((item) => {
      item.addEventListener('click', () => {
        const playlistId = item.dataset.playlistId;
        this.switchTab('playlist-detail', playlistId);
      });
    });

    // Bottom Player Controls
    const playBtn = document.getElementById('player-play-btn');
    if (playBtn) playBtn.addEventListener('click', () => this.togglePlayPause());

    const nextBtn = document.getElementById('player-next-btn');
    if (nextBtn) nextBtn.addEventListener('click', () => this.playNextTrack());

    const prevBtn = document.getElementById('player-prev-btn');
    if (prevBtn) prevBtn.addEventListener('click', () => this.playPreviousTrack());

    const shuffleBtn = document.getElementById('player-shuffle-btn');
    if (shuffleBtn) shuffleBtn.addEventListener('click', () => this.toggleShuffle());

    const repeatBtn = document.getElementById('player-repeat-btn');
    if (repeatBtn) repeatBtn.addEventListener('click', () => this.cycleRepeatMode());

    const muteBtn = document.getElementById('player-mute-btn');
    if (muteBtn) muteBtn.addEventListener('click', () => this.toggleMute());

    // Volume Slider
    const volumeSlider = document.getElementById('volume-slider');
    if (volumeSlider) {
      volumeSlider.addEventListener('input', (e) => {
        const vol = parseFloat(e.target.value) / 100;
        Database.saveSettings({ volume: vol });
        AudioEngine.setVolume(this.isMuted ? 0 : vol);
      });
    }

    // Playback Progress Bar Seeking
    const progressBar = document.getElementById('player-progress-bar');
    if (progressBar) {
      progressBar.addEventListener('input', (e) => {
        if (!this.currentTrack) return;
        const pct = parseFloat(e.target.value);
        const seekTime = (pct / 100) * this.currentTrack.duration;
        AudioEngine.seek(seekTime, this.currentTrack.duration);
      });
    }

    // Search bar filtering and YouTube Search
    const searchInput = document.getElementById('search-input');
    if (searchInput) {
      searchInput.addEventListener('input', (e) => {
        const filterVal = e.target.value;
        if (this.activeTab !== 'discover' && this.activeTab !== 'songs' && filterVal.trim() !== '') {
          this.switchTab('songs');
        }
        if (this.activeTab === 'songs') {
          this.renderSongsTable(filterVal);
        }
      });

      searchInput.addEventListener('keypress', async (e) => {
        if (e.key === 'Enter') {
          const query = searchInput.value.trim();
          if (query !== '') {
            this.switchTab('discover');
            await this.searchYouTubeAndRender(query);
          }
        }
      });
    }

    // Player heart click
    const playerHeart = document.getElementById('player-favorite-btn');
    if (playerHeart) {
      playerHeart.addEventListener('click', () => {
        if (!this.currentTrack) return;
        const active = Database.toggleFavorite(this.currentTrack.id);
        if (active) {
          playerHeart.innerHTML = '♥';
          playerHeart.classList.add('active');
        } else {
          playerHeart.innerHTML = '♡';
          playerHeart.classList.remove('active');
        }
        this.renderHome();
        this.renderSongsTable();
      });
    }

    // Theme selector click triggers
    document.querySelectorAll('.theme-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const theme = btn.dataset.theme;
        this.applyTheme(theme);
      });
    });

    // Equalizer slider listeners
    document.querySelectorAll('.eq-slider').forEach((slider, index) => {
      slider.addEventListener('input', (e) => {
        const val = parseFloat(e.target.value);
        AudioEngine.setEqualizerBand(index, val);
        
        // Save to settings
        const settings = Database.getSettings();
        const eq = settings.equalizer || [0, 0, 0, 0, 0];
        eq[index] = val;
        Database.saveSettings({ equalizer: eq });
      });
    });

    // Speed selector change listener
    const speedSelect = document.getElementById('settings-speed-select');
    if (speedSelect) {
      speedSelect.addEventListener('change', (e) => {
        const speed = parseFloat(e.target.value);
        Database.saveSettings({ speed: speed });
        AudioEngine.setPlaybackRate(speed);
      });
    }

    // Panner balance slider listener
    const panSlider = document.getElementById('settings-pan-slider');
    if (panSlider) {
      panSlider.addEventListener('input', (e) => {
        const val = parseFloat(e.target.value);
        AudioEngine.setPan(val);
      });
    }

    // Spatializer checkbox toggle
    const spatialCheckbox = document.getElementById('settings-spatial-toggle');
    if (spatialCheckbox) {
      spatialCheckbox.addEventListener('change', (e) => {
        const check = e.target.checked;
        Database.saveSettings({ spatializer: check });
        // Map balance to panner for mock spatial reverb panner ticks
        if (check) {
          AudioEngine.setPan(0.3); // Slight spatial panner offset
        } else {
          AudioEngine.setPan(0.0); // Reset center
        }
      });
    }

    // Modal Create Playlist Action
    const savePlBtn = document.getElementById('save-playlist-modal-btn');
    if (savePlBtn) {
      savePlBtn.addEventListener('click', () => {
        const nameInput = document.getElementById('modal-playlist-name');
        const descInput = document.getElementById('modal-playlist-desc');
        const gradientSelect = document.getElementById('modal-playlist-gradient');

        const name = nameInput.value.trim();
        const desc = descInput.value.trim();
        const grad = gradientSelect.value;

        if (name === '') {
          alert('Playlist name is required.');
          return;
        }

        Database.createPlaylist(name, desc, grad);
        
        // Reset modal fields
        nameInput.value = '';
        descInput.value = '';

        // Close bootstrap modal programmatically
        const modalEl = document.getElementById('createPlaylistModal');
        const modal = bootstrap.Modal.getInstance(modalEl);
        if (modal) modal.hide();

        this.renderPlaylists();
        this.renderSongsTable(); // Reload dropdown menus
      });
    }

    // Upload files handler click
    const importInput = document.getElementById('import-audio-input');
    if (importInput) {
      importInput.addEventListener('change', async (e) => {
        const files = Array.from(e.target.files);
        if (files.length > 0) {
          await this.handleAudioUploads(files);
        }
      });
    }

    // Drag and drop local upload handlers on body
    const dropZone = document.body;
    dropZone.addEventListener('dragover', (e) => {
      e.preventDefault();
      // Show upload indicator if in songs view
      const dragOverlay = document.getElementById('drag-upload-overlay');
      if (dragOverlay) dragOverlay.classList.remove('d-none');
    });

    dropZone.addEventListener('dragleave', (e) => {
      e.preventDefault();
      const dragOverlay = document.getElementById('drag-upload-overlay');
      if (dragOverlay && (e.clientX === 0 && e.clientY === 0)) {
        dragOverlay.classList.add('d-none');
      }
    });

    dropZone.addEventListener('drop', async (e) => {
      e.preventDefault();
      const dragOverlay = document.getElementById('drag-upload-overlay');
      if (dragOverlay) dragOverlay.classList.add('d-none');

      const files = Array.from(e.dataTransfer.files);
      const audioFiles = files.filter(f => f.type.startsWith('audio/') || f.name.endsWith('.mp3') || f.name.endsWith('.wav'));
      
      if (audioFiles.length > 0) {
        await this.handleAudioUploads(audioFiles);
      }
    });

    // Visualizer selection toggles
    document.querySelectorAll('.viz-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const mode = btn.dataset.viz;
        Visualizer.setMode(mode);

        document.querySelectorAll('.viz-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
      });
    });

    // UI elements triggering Artist/Album transitions
    document.addEventListener('click', (e) => {
      const artistCard = e.target.closest('.artist-circle-card');
      if (artistCard) {
        const artName = artistCard.dataset.artistName;
        this.switchTab('artist-detail', artName);
        return;
      }

      const albumCard = e.target.closest('.album-card');
      if (albumCard) {
        const albName = albumCard.dataset.albumName;
        const albArtist = albumCard.dataset.artistName;
        this.switchTab('album-detail', { name: albName, artist: albArtist });
        return;
      }

      const viewAlbumBtn = e.target.closest('.view-album-btn');
      if (viewAlbumBtn) {
        const name = viewAlbumBtn.dataset.albumName;
        const artist = viewAlbumBtn.dataset.artistName;
        this.switchTab('album-detail', { name, artist });
      }
    });

    // Queue button drawer toggling
    const queueBtn = document.getElementById('player-queue-toggle-btn');
    const queueDrawer = document.getElementById('queue-drawer');
    if (queueBtn && queueDrawer) {
      queueBtn.addEventListener('click', () => {
        queueDrawer.classList.toggle('open');
        queueBtn.classList.toggle('active');
      });
    }

    // Toggle fullscreen lyrics button
    const lyricsToggleBtn = document.getElementById('player-lyrics-toggle-btn');
    if (lyricsToggleBtn) {
      lyricsToggleBtn.addEventListener('click', () => {
        this.toggleLyricsView();
      });
    }

    // Close buttons for fullscreen views
    document.querySelectorAll('.close-fullscreen-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        this.closeImmersiveViews();
      });
    });

    // Backup DB Button
    const backupBtn = document.getElementById('settings-backup-btn');
    if (backupBtn) {
      backupBtn.addEventListener('click', () => {
        this.backupSettingsAndPlaylists();
      });
    }

    // Restore DB Button
    const restoreBtn = document.getElementById('settings-restore-btn');
    if (restoreBtn) {
      restoreBtn.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (file) {
          this.restoreSettingsAndPlaylists(file);
        }
      });
    }
  },

  async handleAudioUploads(files) {
    const uploadProgress = document.getElementById('upload-progress-card');
    const uploadText = document.getElementById('upload-progress-text');
    
    if (uploadProgress && uploadText) {
      uploadProgress.classList.remove('d-none');
      uploadText.textContent = `Uploading 1 of ${files.length} files...`;
    }

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      if (uploadText) {
        uploadText.textContent = `Uploading ${i + 1} of ${files.length}: ${file.name}...`;
      }

      // Read duration and build basic title metadata
      try {
        const dur = await this.getFileDuration(file);
        
        // Simple name parser: e.g. "Alan Walker - Faded.mp3"
        let artist = 'Unknown Artist';
        let title = file.name.replace(/\.[^/.]+$/, "");
        
        if (title.includes('-')) {
          const parts = title.split('-');
          artist = parts[0].trim();
          title = parts.slice(1).join('-').trim();
        }

        await Database.saveTrack(file, {
          title,
          artist,
          album: 'Local Upload',
          genre: 'Local',
          duration: dur
        });
      } catch (err) {
        console.error("Failed to parse/upload file:", file.name, err);
      }
    }

    if (uploadProgress) {
      uploadProgress.classList.add('d-none');
    }

    // Refresh and notify
    await this.refreshTracks();
    this.renderSongsTable();
    this.renderHome();
    alert(`Successfully loaded ${files.length} track(s) into your library!`);
  },

  getFileDuration(file) {
    return new Promise((resolve) => {
      const audio = document.createElement('audio');
      audio.preload = 'metadata';
      audio.src = URL.createObjectURL(file);
      audio.onloadedmetadata = () => {
        resolve(audio.duration || 180);
      };
      audio.onerror = () => {
        resolve(180); // Default fallback duration
      };
    });
  },

  toggleLyricsView() {
    const lView = document.getElementById('pane-lyrics-fullscreen');
    const lyricsToggleBtn = document.getElementById('player-lyrics-toggle-btn');
    
    if (lView) {
      const isOpen = !lView.classList.contains('d-none');
      if (isOpen) {
        lView.classList.add('d-none');
        if (lyricsToggleBtn) lyricsToggleBtn.classList.remove('active');
      } else {
        lView.classList.remove('d-none');
        if (lyricsToggleBtn) lyricsToggleBtn.classList.add('active');
      }
    }
  },

  cycleVisualizerMode() {
    const modes = ['bars', 'wave', 'circle'];
    const currentIdx = modes.indexOf(Visualizer.mode);
    const nextIdx = (currentIdx + 1) % modes.length;
    const nextMode = modes[nextIdx];
    
    Visualizer.setMode(nextMode);
    
    document.querySelectorAll('.viz-btn').forEach(btn => {
      if (btn.dataset.viz === nextMode) btn.classList.add('active');
      else btn.classList.remove('active');
    });
  },

  closeImmersiveViews() {
    const lView = document.getElementById('pane-lyrics-fullscreen');
    const lyricsToggleBtn = document.getElementById('player-lyrics-toggle-btn');
    if (lView) {
      lView.classList.add('d-none');
      if (lyricsToggleBtn) lyricsToggleBtn.classList.remove('active');
    }

    const queueDrawer = document.getElementById('queue-drawer');
    const queueBtn = document.getElementById('player-queue-toggle-btn');
    if (queueDrawer) {
      queueDrawer.classList.remove('open');
      if (queueBtn) queueBtn.classList.remove('active');
    }
  },

  backupSettingsAndPlaylists() {
    const data = {
      settings: Database.getSettings(),
      playlists: Database.getPlaylists(),
      favorites: Database.getFavorites()
    };
    
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `beatstream-backup-${Date.now()}.json`;
    a.click();
  },

  restoreSettingsAndPlaylists(file) {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = JSON.parse(e.target.result);
        if (data.settings) Database.saveSettings(data.settings);
        if (data.playlists) Database.savePlaylists(data.playlists);
        if (data.favorites) {
          localStorage.setItem('beatstream_favorites', JSON.stringify(data.favorites));
        }
        
        alert('Restore successful! Reloading config...');
        window.location.reload();
      } catch (err) {
        alert('Invalid backup file structure.');
      }
    };
    reader.readAsText(file);
  }
};
export default PlayerUI;
