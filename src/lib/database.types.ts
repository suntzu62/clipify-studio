export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export interface Database {
  public: {
    Tables: {
      projects: {
        Row: {
          id: string;
          user_id: string;
          youtube_url: string;
          title: string | null;
          status: "pending" | "processing" | "completed" | "failed";
          settings: Record<string, unknown> | null;
          created_at: string;
          updated_at: string | null;
        };
        Insert: {
          id?: string;
          user_id?: string;
          youtube_url: string;
          title?: string | null;
          status?: "pending" | "processing" | "completed" | "failed";
          settings?: Record<string, unknown> | null;
          created_at?: string;
          updated_at?: string | null;
        };
        Update: {
          id?: string;
          user_id?: string;
          youtube_url?: string;
          title?: string | null;
          status?: "pending" | "processing" | "completed" | "failed";
          settings?: Record<string, unknown> | null;
          created_at?: string;
          updated_at?: string | null;
        };
        Relationships: [];
      };
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}