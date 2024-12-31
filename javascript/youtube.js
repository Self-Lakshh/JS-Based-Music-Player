/**
 * BeatStream YouTube / YouTube Music API Integration
 * Fetches search results, audio streams, and official lyrics directly from public Piped / YouTube Music API instances.
 * Enables streaming and importing of any YouTube / YouTube Music track.
 */

export const YouTubeService = {
  instances: [
    'https://pipedapi.kavin.rocks',
    'https://api.piped.yt',
    'https://piped-api.privacydev.net',
    'https://piped-api.lunar.icu'
  ],
  currentInstanceIndex: 0,

  getActiveInstance() {
    return this.instances[this.currentInstanceIndex];
  },

  rotateInstance() {
    this.currentInstanceIndex = (this.currentInstanceIndex + 1) % this.instances.length;
    console.log(`Rotating Piped API instance to: ${this.getActiveInstance()}`);
  },

  async getApiKey() {
    try {
      const response = await fetch('.env');
      if (response.ok) {
        const text = await response.text();
        const match = text.match(/YT_API_KEY\s*=\s*(.*)/);
        if (match && match[1]) {
          const key = match[1].trim().replace(/['"]/g, '');
          localStorage.setItem('BEATSTREAM_YT_API_KEY', key);
          return key;
        }
      }
    } catch (e) {
      console.warn("Could not fetch .env file, falling back to LocalStorage:", e);
    }
    return localStorage.getItem('BEATSTREAM_YT_API_KEY');
  },

  parseISO8601Duration(duration) {
    const match = duration.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
    if (!match) return 180;
    const hours = parseInt(match[1] || 0, 10);
    const minutes = parseInt(match[2] || 0, 10);
    const seconds = parseInt(match[3] || 0, 10);
    return hours * 3600 + minutes * 60 + seconds;
  },

  async search(query, limit = 20) {
    // 1. Try official YouTube Data API v3 if API key exists
    const apiKey = await this.getApiKey();
    if (apiKey) {
      try {
        console.log("Searching YouTube via Official Data API...");
        const searchUrl = `https://www.googleapis.com/youtube/v3/search?part=snippet&maxResults=${limit}&q=${encodeURIComponent(query)}&type=video&key=${apiKey}`;
        const searchRes = await fetch(searchUrl);
        if (!searchRes.ok) throw new Error(`Google API Search failed: ${searchRes.status}`);
        const searchData = await searchRes.json();
        
        const items = searchData.items || [];
        if (items.length > 0) {
          const videoIds = items.map(item => item.id.videoId).filter(Boolean);
          
          if (videoIds.length > 0) {
            const detailsUrl = `https://www.googleapis.com/youtube/v3/videos?part=contentDetails,snippet&id=${videoIds.join(',')}&key=${apiKey}`;
            const detailsRes = await fetch(detailsUrl);
            if (!detailsRes.ok) throw new Error(`Google API Details failed: ${detailsRes.status}`);
            const detailsData = await detailsRes.json();
            
            return (detailsData.items || []).map(item => {
              const durationSec = this.parseISO8601Duration(item.contentDetails?.duration || 'PT3M0S');
              return {
                id: `yt-${item.id}`,
                videoId: item.id,
                title: item.snippet.title,
                artist: item.snippet.channelTitle || 'Unknown Artist',
                album: 'YouTube Music',
                duration: durationSec,
                genre: 'YouTube Music',
                isProcedural: false,
                isYouTube: true,
                coverUrl: item.snippet.thumbnails?.high?.url || item.snippet.thumbnails?.default?.url || 'assets/orange_logo.png',
                coverGradient: 'linear-gradient(135deg, #FF0000 0%, #111111 100%)',
                streamUrl: '' // Loaded dynamically when played
              };
            });
          }
        }
      } catch (err) {
        console.warn("Official YouTube search failed, falling back to Piped:", err);
      }
    }

    // 2. Fallback Piped API instance search loop
    let attempts = 0;
    while (attempts < this.instances.length) {
      const instance = this.getActiveInstance();
      const url = `${instance}/music/search?q=${encodeURIComponent(query)}&filter=songs`;
      try {
        const response = await fetch(url, { signal: AbortSignal.timeout(6000) });
        if (!response.ok) throw new Error(`HTTP error ${response.status}`);
        const data = await response.json();
        
        // Filter and map results
        return data.slice(0, limit).map(item => ({
          id: `yt-${item.videoId}`,
          videoId: item.videoId,
          title: item.title,
          artist: item.uploaderName || item.artist || 'Unknown Artist',
          album: item.album || 'YouTube Music',
          duration: item.duration || 200,
          genre: 'YouTube Music',
          isProcedural: false,
          isYouTube: true,
          coverUrl: item.thumbnail || 'assets/orange_logo.png',
          coverGradient: 'linear-gradient(135deg, #FF0000 0%, #111111 100%)',
          streamUrl: '' // Loaded dynamically when played to prevent link expiration
        }));
      } catch (err) {
        console.warn(`YouTube Music search failed on ${instance}:`, err);
        this.rotateInstance();
        attempts++;
      }
    }
    throw new Error('All search options failed.');
  },

  async getStreamUrl(videoId) {
    let attempts = 0;
    while (attempts < this.instances.length) {
      const instance = this.getActiveInstance();
      const url = `${instance}/streams/${videoId}`;
      try {
        const response = await fetch(url, { signal: AbortSignal.timeout(6000) });
        if (!response.ok) throw new Error(`HTTP error ${response.status}`);
        const data = await response.json();
        
        const audioStreams = data.audioStreams || [];
        // Sort streams to find high quality m4a
        const bestStream = audioStreams.find(s => s.mimeType.includes('audio/mp4')) || audioStreams[0];
        if (!bestStream) throw new Error("No audio streams found");
        
        return bestStream.url;
      } catch (err) {
        console.warn(`Failed to fetch stream URL on ${instance}:`, err);
        this.rotateInstance();
        attempts++;
      }
    }
    // Final fallback to Invidious direct stream link
    return `https://yewtu.be/latest_version?id=${videoId}&itag=140`;
  },

  async getLyrics(videoId) {
    let attempts = 0;
    while (attempts < this.instances.length) {
      const instance = this.getActiveInstance();
      const url = `${instance}/lyrics?videoId=${videoId}`;
      try {
        const response = await fetch(url, { signal: AbortSignal.timeout(6000) });
        if (!response.ok) throw new Error(`HTTP error ${response.status}`);
        const data = await response.json();
        
        return data.lyrics || null;
      } catch (err) {
        console.warn(`Failed to fetch lyrics on ${instance}:`, err);
        this.rotateInstance();
        attempts++;
      }
    }
    return null;
  }
};
