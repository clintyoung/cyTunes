// Minimal Spotify Web Playback SDK typings.
// Full types are available via @types/spotify-web-playback-sdk but this is what we use.

export {};

declare global {
  interface Window {
    onSpotifyWebPlaybackSDKReady: () => void;
    Spotify: typeof Spotify;
  }

  namespace Spotify {
    interface PlayerInit {
      name: string;
      getOAuthToken: (cb: (token: string) => void) => void;
      volume?: number;
    }

    interface WebPlaybackState {
      paused: boolean;
      position: number;
      duration: number;
      track_window: {
        current_track: WebPlaybackTrack;
        previous_tracks: WebPlaybackTrack[];
        next_tracks: WebPlaybackTrack[];
      };
    }

    interface WebPlaybackTrack {
      id: string;
      uri: string;
      name: string;
      duration_ms: number;
      album: { name: string; images: { url: string }[] };
      artists: { name: string }[];
    }

    interface WebPlaybackError {
      message: string;
    }

    class Player {
      constructor(init: PlayerInit);
      connect(): Promise<boolean>;
      disconnect(): void;
      addListener(event: "ready" | "not_ready", cb: (data: { device_id: string }) => void): void;
      addListener(event: "player_state_changed", cb: (state: WebPlaybackState | null) => void): void;
      addListener(
        event: "initialization_error" | "authentication_error" | "account_error" | "playback_error",
        cb: (err: WebPlaybackError) => void
      ): void;
      togglePlay(): Promise<void>;
      pause(): Promise<void>;
      resume(): Promise<void>;
      seek(positionMs: number): Promise<void>;
      previousTrack(): Promise<void>;
      nextTrack(): Promise<void>;
      setVolume(v: number): Promise<void>;
      getCurrentState(): Promise<WebPlaybackState | null>;
    }
  }
}
