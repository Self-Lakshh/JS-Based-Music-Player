/**
 * BeatStream YouTube / Invidious API Integration
 * Fetches search results and stream links directly from public Invidious instances.
 * Enables streaming and importing of any YouTube / YouTube Music track.
 */

export const YouTubeService = {
  instances: [
    'https://yewtu.be',
    'https://invidious.flokinet.to',
    'https://inv.tux.rs',
    'https://invidious.projectsegfau.lt',
    'https://invidious.lunar.icu',
    'https://invidious.nerdvpn.de'
  ],
  currentInstanceIndex: 0,

  getActiveInstance() {
    return this.instances[this.currentInstanceIndex];
  },

  rotateInstance() {
    this.currentInstanceIndex = (this.currentInstanceIndex + 1) % this.instances.length;
    console.log(`Rotating Invidious API to: ${this.getActiveInstance()}`);
  },

  async search(query, limit = 20) {
    let attempts = 0;
    while (attempts < this.instances.length) {
      const instance = this.getActiveInstance();
      const url = `${instance}/api/v1/search?q=${encodeURIComponent(query)}&type=video`;
      try {
        const response = await fetch(url, { signal: AbortSignal.timeout(6000) });
        if (!response.ok) throw new Error(`HTTP error ${response.status}`);
        const data = await response.json();
        
        // Filter and map results
        return data
          .filter(item => item.type === 'video')
          .slice(0, limit)
          .map(item => {
            let cover = 'assets/orange_logo.png';
            if (item.videoThumbnails && item.videoThumbnails.length > 0) {
              const med = item.videoThumbnails.find(t => t.quality === 'medium' || t.quality === 'default');
              cover = med ? med.url : item.videoThumbnails[0].url;
            }
            
            // Normalize Invidious thumbnail URL to ensure it is absolute
            if (cover.startsWith('/')) {
              cover = `${instance}${cover}`;
            }

            return {
              id: `yt-${item.videoId}`,
              videoId: item.videoId,
              title: item.title,
              artist: item.author,
              album: 'YouTube Music',
              duration: item.lengthSeconds || 200,
              genre: 'YouTube Stream',
              isProcedural: false,
              isYouTube: true,
              coverUrl: cover,
              coverGradient: 'linear-gradient(135deg, #FF0000 0%, #111111 100%)',
              streamUrl: `${instance}/latest_version?id=${item.videoId}&itag=140`
            };
          });
      } catch (err) {
        console.warn(`Search failed on ${instance}:`, err);
        this.rotateInstance();
        attempts++;
      }
    }
    throw new Error('All Invidious search instances failed.');
  },

  getStreamUrl(videoId) {
    const instance = this.getActiveInstance();
    return `${instance}/latest_version?id=${videoId}&itag=140`;
  }
};
