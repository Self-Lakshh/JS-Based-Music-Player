/**
 * BeatStream Local Database Layer
 * Handles local persistence using IndexedDB (for audio binary data)
 * and LocalStorage (for queue state, preferences, and playlists).
 */

// 65 Seed Bollywood Songs across 12 movies
const SEED_DATA = [
  // Ek Tha Tiger (1-4)
  ['bolly-1', 'Saiyara', 'Mohit Chauhan, Tarannum Mallik', 'Ek Tha Tiger', 180, 'Romantic', 'linear-gradient(135deg, #f6d365 0%, #fda085 100%)'],
  ['bolly-2', 'Mashallah', 'Wajid, Shreya Ghoshal', 'Ek Tha Tiger', 210, 'Dance', 'linear-gradient(135deg, #f6d365 0%, #fda085 100%)'],
  ['bolly-3', 'Banjaara', 'Sukhwinder Singh', 'Ek Tha Tiger', 195, 'Dance', 'linear-gradient(135deg, #f6d365 0%, #fda085 100%)'],
  ['bolly-4', 'Laapata', 'KK, Palak Muchhal', 'Ek Tha Tiger', 170, 'Upbeat', 'linear-gradient(135deg, #f6d365 0%, #fda085 100%)'],
  // Aashiqui 2 (5-9)
  ['bolly-5', 'Tum Hi Ho', 'Arijit Singh', 'Aashiqui 2', 200, 'Romantic', 'linear-gradient(135deg, #ff9a9e 0%, #fecfef 100%)'],
  ['bolly-6', 'Sunn Raha Hai', 'Ankit Tiwari', 'Aashiqui 2', 240, 'Sad Romantic', 'linear-gradient(135deg, #ff9a9e 0%, #fecfef 100%)'],
  ['bolly-7', 'Chahun Main Ya Naa', 'Arijit Singh, Palak Muchhal', 'Aashiqui 2', 190, 'Romantic', 'linear-gradient(135deg, #ff9a9e 0%, #fecfef 100%)'],
  ['bolly-8', 'Milne Hai Mujhse Aayi', 'Arijit Singh', 'Aashiqui 2', 215, 'Rock Romantic', 'linear-gradient(135deg, #ff9a9e 0%, #fecfef 100%)'],
  ['bolly-9', 'Hum Mar Jayenge', 'Arijit Singh, Tulsi Kumar', 'Aashiqui 2', 185, 'Romantic', 'linear-gradient(135deg, #ff9a9e 0%, #fecfef 100%)'],
  // Yeh Jawaani Hai Deewani (10-15)
  ['bolly-10', 'Kabira', 'Tochi Raina, Rekha Bhardwaj', 'Yeh Jawaani Hai Deewani', 190, 'Sufi', 'linear-gradient(135deg, #a1c4fd 0%, #c2e9fb 100%)'],
  ['bolly-11', 'Badtameez Dil', 'Benny Dayal', 'Yeh Jawaani Hai Deewani', 205, 'Dance', 'linear-gradient(135deg, #a1c4fd 0%, #c2e9fb 100%)'],
  ['bolly-12', 'Ilahi', 'Arijit Singh', 'Yeh Jawaani Hai Deewani', 180, 'Upbeat', 'linear-gradient(135deg, #a1c4fd 0%, #c2e9fb 100%)'],
  ['bolly-13', 'Balam Pichkari', 'Vishal Dadlani, Shalmali', 'Yeh Jawaani Hai Deewani', 210, 'Dance', 'linear-gradient(135deg, #a1c4fd 0%, #c2e9fb 100%)'],
