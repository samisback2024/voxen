import { createClient } from "@supabase/supabase-js";

export const supabaseUrl =
  import.meta.env.VITE_SUPABASE_URL ||
  "https://gpkhehcnsggwjejkwuyv.supabase.co";
export const supabaseKey =
  import.meta.env.VITE_SUPABASE_ANON_KEY ||
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imdwa2hlaGNuc2dnd2plamt3dXl2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE1NDI5OTEsImV4cCI6MjA4NzExODk5MX0.NTL8HZCeBa46qqBf8YrvZMuBEHEyJ0i-hpL8OwNoLkU";

export const supabase = createClient(supabaseUrl, supabaseKey);
