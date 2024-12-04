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
  activeTab: 'home',
  selectedPlaylistId: null,

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

    // Initial UI Render
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
      if (coverGradientEl) coverGradientEl.classList.add('d-none');
      if (coverEl) {
        coverEl.classList.remove('d-none');
        if (track.coverBlob) {
          coverEl.src = URL.createObjectURL(track.coverBlob);
        } else {
          coverEl.src = 'assets/orange_logo.png'; // Fallback icon
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
      if (track.isProcedural) {
        AudioEngine.playSynthTrack(track.id, seekTime, track.duration);
      } else {
        // Retrieve IndexedDB blob
        const dbRecord = await Database.getTrack(track.id);
        if (dbRecord && dbRecord.audioBlob) {
          AudioEngine.playLocalTrack(dbRecord.audioBlob, seekTime);
        } else {
          console.error("Could not find audio blob for track", track.id);
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
    if (tabId === 'home') {
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
