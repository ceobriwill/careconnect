// js/supabaseClient.js
import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";

const SUPABASE_URL = "https://zkuumtohhjzircfnxicf.supabase.co";
const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InprdXVtdG9oaGp6aXJjZm54aWNmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODU0MTE1MDMsImV4cCI6MjEwMDk4NzUwM30.s3su12UsY48c4uorVWJ7dBOOWaa3J4aCmj3gNizvwIs";

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
