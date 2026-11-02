export interface MusicTrackItem {
  id: string;
  title: string;
  artist: string;
  genre: "Tech Ambient" | "Chill Lo-Fi" | "Inspiring Cinematic" | "Upbeat Electronic" | "Corporate Soft";
  mood: string;
  duration: number; // in seconds
  audioUrl: string;
  coverImage: string;
  defaultVolume: number;
}

export const CURATED_MUSIC_TRACKS: MusicTrackItem[] = [
  {
    id: "track_tech_ambient",
    title: "Cyber Horizon",
    artist: "Kreovar Studio",
    genre: "Tech Ambient",
    mood: "Focused, Futuristic, Modern",
    duration: 120,
    audioUrl: "https://cdn.freesound.org/previews/612/612610_5674468-lq.mp3",
    coverImage: "https://images.unsplash.com/photo-1518770660439-4636190af475?auto=format&fit=crop&w=400&q=80",
    defaultVolume: 0.16,
  },
  {
    id: "track_lofi_chill",
    title: "Late Night Code",
    artist: "Echo Beats",
    genre: "Chill Lo-Fi",
    mood: "Relaxed, Warm, Atmospheric",
    duration: 98,
    audioUrl: "https://cdn.freesound.org/previews/615/615609_11861866-lq.mp3",
    coverImage: "https://images.unsplash.com/photo-1507525428034-b723cf961d3e?auto=format&fit=crop&w=400&q=80",
    defaultVolume: 0.18,
  },
  {
    id: "track_cinematic_pulse",
    title: "Viral Momentum",
    artist: "Hyperion Waves",
    genre: "Inspiring Cinematic",
    mood: "Uplifting, High Energy, Polished",
    duration: 105,
    audioUrl: "https://cdn.freesound.org/previews/536/536108_1156514-lq.mp3",
    coverImage: "https://images.unsplash.com/photo-1508739773434-c26b3d09e071?auto=format&fit=crop&w=400&q=80",
    defaultVolume: 0.15,
  },
  {
    id: "track_minimal_groove",
    title: "Deep Flow",
    artist: "Neural Sound",
    genre: "Corporate Soft",
    mood: "Subtle, Professional, Minimal",
    duration: 110,
    audioUrl: "https://cdn.freesound.org/previews/412/412068_5121236-lq.mp3",
    coverImage: "https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?auto=format&fit=crop&w=400&q=80",
    defaultVolume: 0.14,
  },
];
