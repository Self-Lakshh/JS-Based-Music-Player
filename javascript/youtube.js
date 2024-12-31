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

  async search(query, limit = 20) {
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
    throw new Error('All Piped search instances failed.');
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
