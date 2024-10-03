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
  ['bolly-14', 'Subhanallah', 'Sreerama Chandra', 'Yeh Jawaani Hai Deewani', 175, 'Romantic', 'linear-gradient(135deg, #a1c4fd 0%, #c2e9fb 100%)'],
  ['bolly-15', 'Dilliwaali Girlfriend', 'Arijit Singh, Sunidhi', 'Yeh Jawaani Hai Deewani', 195, 'Dance', 'linear-gradient(135deg, #a1c4fd 0%, #c2e9fb 100%)'],
  // 3 Idiots (16-20)
  ['bolly-16', 'Give Me Some Sunshine', 'Suraj Jagan, Sharman', '3 Idiots', 185, 'Acoustic', 'linear-gradient(135deg, #84fab0 0%, #8fd3f4 100%)'],
  ['bolly-17', 'Zoobi Doobi', 'Sonu Nigam, Shreya Ghoshal', '3 Idiots', 190, 'Upbeat', 'linear-gradient(135deg, #84fab0 0%, #8fd3f4 100%)'],
  ['bolly-18', 'Behti Hawa Sa Tha Wo', 'Shaan', '3 Idiots', 210, 'Sad', 'linear-gradient(135deg, #84fab0 0%, #8fd3f4 100%)'],
  ['bolly-19', 'Aal Izz Well', 'Sonu Nigam, Swanand', '3 Idiots', 220, 'Upbeat', 'linear-gradient(135deg, #84fab0 0%, #8fd3f4 100%)'],
  ['bolly-20', 'Jaane Nahin Denge Tujhe', 'Sonu Nigam', '3 Idiots', 200, 'Sad', 'linear-gradient(135deg, #84fab0 0%, #8fd3f4 100%)'],
  // Dhurandhar (21-25)
  ['bolly-21', 'Dhurandhar Title Track', 'Sukhwinder Singh', 'Dhurandhar', 180, 'Epic', 'linear-gradient(135deg, #f093fb 0%, #f5576c 100%)'],
  ['bolly-22', 'Sanki Yaar', 'Mika Singh', 'Dhurandhar', 195, 'Rock', 'linear-gradient(135deg, #f093fb 0%, #f5576c 100%)'],
  ['bolly-23', 'Pyaar Ki Dhoon', 'Shreya Ghoshal', 'Dhurandhar', 170, 'Romantic', 'linear-gradient(135deg, #f093fb 0%, #f5576c 100%)'],
  ['bolly-24', 'Aag Ka Darya', 'KK', 'Dhurandhar', 215, 'Sad Rock', 'linear-gradient(135deg, #f093fb 0%, #f5576c 100%)'],
  ['bolly-25', 'Chalte Chalte', 'Udit Narayan', 'Dhurandhar', 185, 'Romantic', 'linear-gradient(135deg, #f093fb 0%, #f5576c 100%)'],
  // Om Shanti Om (26-30)
  ['bolly-26', 'Ajab Si', 'KK', 'Om Shanti Om', 200, 'Romantic', 'linear-gradient(135deg, #fa709a 0%, #fee140 100%)'],
  ['bolly-27', 'Deewangi Deewangi', 'Udit Narayan, Shaan', 'Om Shanti Om', 240, 'Dance', 'linear-gradient(135deg, #fa709a 0%, #fee140 100%)'],
  ['bolly-28', 'Main Agar Kahoon', 'Sonu Nigam, Shreya Ghoshal', 'Om Shanti Om', 210, 'Romantic', 'linear-gradient(135deg, #fa709a 0%, #fee140 100%)'],
  ['bolly-29', 'Dastaan-E-Om Shanti Om', 'Shaan', 'Om Shanti Om', 230, 'Epic', 'linear-gradient(135deg, #fa709a 0%, #fee140 100%)'],
  ['bolly-30', 'Jag Soona Soona Lage', 'Rahat Fateh Ali Khan', 'Om Shanti Om', 225, 'Sad', 'linear-gradient(135deg, #fa709a 0%, #fee140 100%)'],
  // Zindagi Na Milegi Dobara (31-35)
  ['bolly-31', 'Dil Dhadakne Do', 'Suraj Jagan, Jigar', 'Zindagi Na Milegi Dobara', 190, 'Upbeat', 'linear-gradient(135deg, #4facfe 0%, #00f2fe 100%)'],
  ['bolly-32', 'Senorita', 'Farhan Akhtar, Hrithik, Abhay', 'Zindagi Na Milegi Dobara', 200, 'Dance', 'linear-gradient(135deg, #4facfe 0%, #00f2fe 100%)'],
  ['bolly-33', 'Ik Junoon', 'Vishal Dadlani', 'Zindagi Na Milegi Dobara', 185, 'Dance', 'linear-gradient(135deg, #4facfe 0%, #00f2fe 100%)'],
  ['bolly-34', 'Khaabon Ke Parindey', 'Mohit Chauhan', 'Zindagi Na Milegi Dobara', 215, 'Acoustic', 'linear-gradient(135deg, #4facfe 0%, #00f2fe 100%)'],
  ['bolly-35', 'Der Lagi Lekin', 'Shankar Mahadevan', 'Zindagi Na Milegi Dobara', 195, 'Sad', 'linear-gradient(135deg, #4facfe 0%, #00f2fe 100%)'],
  // Rockstar (36-41)
  ['bolly-36', 'Kun Faya Kun', 'A.R. Rahman, Mohit Chauhan', 'Rockstar', 250, 'Sufi', 'linear-gradient(135deg, #cfd9df 0%, #e2ebf0 100%)'],
  ['bolly-37', 'Nadaan Parindey', 'A.R. Rahman, Mohit Chauhan', 'Rockstar', 230, 'Rock', 'linear-gradient(135deg, #cfd9df 0%, #e2ebf0 100%)'],
  ['bolly-38', 'Phir Se Ud Chala', 'Mohit Chauhan', 'Rockstar', 195, 'Acoustic', 'linear-gradient(135deg, #cfd9df 0%, #e2ebf0 100%)'],
  ['bolly-39', 'Sadda Haq', 'Mohit Chauhan', 'Rockstar', 220, 'Hard Rock', 'linear-gradient(135deg, #cfd9df 0%, #e2ebf0 100%)'],
  ['bolly-40', 'Jo Bhi Main', 'Mohit Chauhan', 'Rockstar', 205, 'Rock', 'linear-gradient(135deg, #cfd9df 0%, #e2ebf0 100%)'],
  ['bolly-41', 'Hawaa Hawaa', 'Mohit Chauhan', 'Rockstar', 210, 'Folk Upbeat', 'linear-gradient(135deg, #cfd9df 0%, #e2ebf0 100%)'],
  // Kabir Singh (42-46)
  ['bolly-42', 'Bekhayali', 'Sachet Tandon', 'Kabir Singh', 225, 'Sad Rock', 'linear-gradient(135deg, #ff0844 0%, #ffb199 100%)'],
  ['bolly-43', 'Kaise Hua', 'Vishal Mishra', 'Kabir Singh', 200, 'Romantic', 'linear-gradient(135deg, #ff0844 0%, #ffb199 100%)'],
  ['bolly-44', 'Tujhe Kitna Chahi Aur', 'Arijit Singh', 'Kabir Singh', 190, 'Romantic', 'linear-gradient(135deg, #ff0844 0%, #ffb199 100%)'],
  ['bolly-45', 'Pehla Pyaar', 'Armaan Malik', 'Kabir Singh', 180, 'Romantic', 'linear-gradient(135deg, #ff0844 0%, #ffb199 100%)'],
  ['bolly-46', 'Tera Ban Jaunga', 'Akhil Sachdeva, Tulsi Kumar', 'Kabir Singh', 195, 'Romantic', 'linear-gradient(135deg, #ff0844 0%, #ffb199 100%)'],
  // Ae Dil Hai Mushkil (47-51)
  ['bolly-47', 'Channa Mereya', 'Arijit Singh', 'Ae Dil Hai Mushkil', 210, 'Sad', 'linear-gradient(135deg, #a18cd1 0%, #fbc2eb 100%)'],
  ['bolly-48', 'Ae Dil Hai Mushkil', 'Arijit Singh', 'Ae Dil Hai Mushkil', 200, 'Romantic', 'linear-gradient(135deg, #a18cd1 0%, #fbc2eb 100%)'],
  ['bolly-49', 'Bulleya', 'Amit Mishra, Shilpa Rao', 'Ae Dil Hai Mushkil', 220, 'Rock Sufi', 'linear-gradient(135deg, #a18cd1 0%, #fbc2eb 100%)'],
  ['bolly-50', 'The Breakup Song', 'Arijit Singh, Badshah', 'Ae Dil Hai Mushkil', 190, 'Dance', 'linear-gradient(135deg, #a18cd1 0%, #fbc2eb 100%)'],
  ['bolly-51', 'Cutiepie', 'Nakash Aziz', 'Ae Dil Hai Mushkil', 175, 'Dance', 'linear-gradient(135deg, #a18cd1 0%, #fbc2eb 100%)'],
  // Jab We Met (52-56)
  ['bolly-52', 'Tum Se Hi', 'Mohit Chauhan', 'Jab We Met', 210, 'Romantic', 'linear-gradient(135deg, #fccb90 0%, #d57eeb 100%)'],
  ['bolly-53', 'Ye Ishq Hai', 'Shreya Ghoshal', 'Jab We Met', 195, 'Dance', 'linear-gradient(135deg, #fccb90 0%, #d57eeb 100%)'],
  ['bolly-54', 'Mauja Hi Mauja', 'Mika Singh', 'Jab We Met', 200, 'Dance', 'linear-gradient(135deg, #fccb90 0%, #d57eeb 100%)'],
  ['bolly-55', 'Nagada Nagada', 'Sonu Nigam', 'Jab We Met', 190, 'Folk', 'linear-gradient(135deg, #fccb90 0%, #d57eeb 100%)'],
  ['bolly-56', 'Aaoge Jab Tum', 'Rashid Khan', 'Jab We Met', 230, 'Classical', 'linear-gradient(135deg, #fccb90 0%, #d57eeb 100%)'],
  // Dilwale Dulhania Le Jayenge (57-65)
  ['bolly-57', 'Tujhe Dekha To', 'Kumar Sanu, Lata Mangeshkar', 'Dilwale Dulhania Le Jayenge', 210, 'Romantic', 'linear-gradient(135deg, #e6b980 0%, #eacda3 100%)'],
  ['bolly-58', 'Mehndi Laga Ke Rakhna', 'Kumar Sanu, Lata Mangeshkar', 'Dilwale Dulhania Le Jayenge', 225, 'Dance', 'linear-gradient(135deg, #e6b980 0%, #eacda3 100%)'],
  ['bolly-59', 'Mere Khwabon Mein', 'Lata Mangeshkar', 'Dilwale Dulhania Le Jayenge', 190, 'Upbeat', 'linear-gradient(135deg, #e6b980 0%, #eacda3 100%)'],
  ['bolly-60', 'Ruk Ja O Dil Deewane', 'Udit Narayan', 'Dilwale Dulhania Le Jayenge', 200, 'Dance', 'linear-gradient(135deg, #e6b980 0%, #eacda3 100%)'],
  ['bolly-61', 'Ho Gaya Hai Tujhko', 'Udit Narayan, Lata Mangeshkar', 'Dilwale Dulhania Le Jayenge', 220, 'Romantic', 'linear-gradient(135deg, #e6b980 0%, #eacda3 100%)'],
  ['bolly-62', 'Zara Sa Jhoom Loon Main', 'Abhijeet, Asha Bhosle', 'Dilwale Dulhania Le Jayenge', 180, 'Dance', 'linear-gradient(135deg, #e6b980 0%, #eacda3 100%)'],
  ['bolly-63', 'Ghar Aaja Pardesi', 'Manpreet Kaur', 'Dilwale Dulhania Le Jayenge', 240, 'Folk', 'linear-gradient(135deg, #e6b980 0%, #eacda3 100%)'],
  ['bolly-64', 'Tujh Mein Rab Dikhta Hai', 'Roop Kumar Rathod', 'Rab Ne Bana Di Jodi', 210, 'Romantic', 'linear-gradient(135deg, #e6b980 0%, #eacda3 100%)'],
  ['bolly-65', 'Haule Haule', 'Sukhwinder Singh', 'Rab Ne Bana Di Jodi', 190, 'Romantic', 'linear-gradient(135deg, #e6b980 0%, #eacda3 100%)']
];

export const BOLLYWOOD_SEEDS = SEED_DATA.map(item => ({
  id: item[0],
  title: item[1],
  artist: item[2],
  album: item[3],
  duration: item[4],
  genre: item[5],
  isProcedural: true,
  coverGradient: item[6]
}));

const DB_NAME = 'BeatStreamDB';
const DB_VERSION = 1;
const TRACK_STORE_NAME = 'tracks';

export const Database = {
  db: null,

  /**
   * Initializes IndexedDB and checks/seeds default values in LocalStorage.
   */
  async init() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onerror = (event) => {
        console.error('IndexedDB error:', event.target.error);
        reject(event.target.error);
      };

      request.onsuccess = (event) => {
        this.db = event.target.result;
        this._initLocalStorage();
        resolve(this.db);
      };

      request.onupgradeneeded = (event) => {
