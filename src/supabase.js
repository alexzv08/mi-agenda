import { createClient } from '@supabase/supabase-js';

// Limpia errores típicos al pegar los valores en Vercel: espacios, comillas, falta de https://
const clean = v => String(v ?? '').trim().replace(/^["']+|["']+$/g, '').trim();

function normalizeUrl(raw) {
  let v = clean(raw);
  if (!v) return { url: '', problem: 'Falta la variable VITE_SUPABASE_URL.' };
  if (!/^https?:\/\//i.test(v)) v = 'https://' + v;
  try {
    const u = new URL(v);
    if (!/^[a-z0-9.-]+$/i.test(u.hostname) || !u.hostname.includes('.')) throw new Error('bad host');
    if (u.hostname === 'supabase.com' || u.hostname.endsWith('.supabase.com')) {
      return { url: '', problem: `VITE_SUPABASE_URL tiene la dirección del panel de Supabase («${clean(raw)}»). Debe ser la Project URL, que termina en .supabase.co.` };
    }
    return { url: u.origin, problem: '' };
  } catch {
    return { url: '', problem: `VITE_SUPABASE_URL no es una dirección válida: «${clean(raw)}». Debe ser algo como https://abcd1234.supabase.co.` };
  }
}

const { url, problem: urlProblem } = normalizeUrl(import.meta.env.VITE_SUPABASE_URL);
const key = clean(import.meta.env.VITE_SUPABASE_ANON_KEY);
const keyProblem = !key
  ? 'Falta la variable VITE_SUPABASE_ANON_KEY.'
  : /^https?:\/\//i.test(key) ? 'VITE_SUPABASE_ANON_KEY contiene una dirección web: parece que las dos variables están intercambiadas.' : '';

export const setupProblem = urlProblem || keyProblem;
export const configured = !setupProblem;

let client = null;
if (configured) {
  try {
    client = createClient(url, key, { auth: { persistSession: true, autoRefreshToken: true } });
  } catch (e) {
    console.error(e);
  }
}
export const supabase = client;
