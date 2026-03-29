import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';

const SUPABASE_URL = 'https://bovjgindnqpmdlfxwzxx.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJvdmpnaW5kbnFwbWRsZnh3enh4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ3OTg2NTUsImV4cCI6MjA5MDM3NDY1NX0.GpdMvJebz59Bvd8-u8WOmHxdWFuAc9U6C1U1z4yLUB0';

if (!SUPABASE_URL || SUPABASE_URL.includes('COLE_AQUI')) {
  alert('Você ainda não configurou a Project URL no arquivo supabase.js');
}

if (!SUPABASE_ANON_KEY || SUPABASE_ANON_KEY.includes('COLE_AQUI')) {
  alert('Você ainda não configurou a anon key no arquivo supabase.js');
}

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
