export interface FrontendConfig {
  server_url: string;
  device_id: string;
  device_token: string;
  user_id: number;
  reverb_app_key: string;
  reverb_host: string;
  reverb_port: number;
  reverb_scheme: string;
}

export interface RawClip {
  id: string;
  origin_device_id: string;
  kind?: string;
  blob_id?: string | null;
  mime?: string | null;
  pinned?: boolean;
  ciphertext: string;
  nonce: string;
  is_sensitive: boolean;
  created_at: string;
}

export interface Clip {
  id: string;
  origin_device_id: string;
  kind: "text" | "image" | "file";
  text: string;
  blobId?: string; // image/file : chargé à la demande (cache disque), pas en RAM
  mime?: string;
  pinned: boolean;
  is_sensitive: boolean;
  created_at: string;
  mine: boolean;
}

export type View = "history" | "settings" | "onboarding";
export type WsStatus = "connecting" | "connected" | "error";
export type AuthMode = "register" | "login";
