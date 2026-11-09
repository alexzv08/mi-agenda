import './styles.css';
import { supabase, configured, setupProblem } from './supabase.js';
import { startApp } from './app.js';

const $ = id => document.getElementById(id);
let app = null;
let mode = 'login'; // o 'signup'

function showAuth(msg = '', isErr = false) {
  $('app').hidden = true;
  $('auth').hidden = false;
  $('auth-msg').textContent = msg;
  $('auth-msg').classList.toggle('err', isErr);
}

async function enter(session) {
  $('auth').hidden = true;
  $('app').hidden = false;
  $('who').textContent = session.user.email || '';
  if (!app) { app = startApp(); app.route(); }
  app.render();
  app.setSync('warn', 'Cargando tus datos…');
  try {
    await app.load();
    app.render();
    app.setSync('ok', 'Sincronizado');
  } catch (e) {
    console.error(e);
    app.setSync('err', 'No se pudieron cargar tus datos. ¿Ejecutaste el esquema SQL en Supabase?');
  }
}

function setMode(m) {
  mode = m;
  const signup = m === 'signup';
  $('auth-title').textContent = signup ? 'Crea tu cuenta' : 'Entra en tu agenda';
  $('auth-submit').textContent = signup ? 'Crear cuenta' : 'Entrar';
  $('auth-switch').textContent = signup ? '¿Ya tienes cuenta? Entrar' : '¿No tienes cuenta? Crear una';
  $('auth-pass').autocomplete = signup ? 'new-password' : 'current-password';
  $('auth-msg').textContent = '';
}

async function boot() {
  if (!configured || !supabase) {
    $('setup').hidden = false;
    $('setup-problem').textContent = setupProblem || 'No se pudo conectar con Supabase. Revisa las dos variables.';
    return;
  }

  $('auth-switch').onclick = () => setMode(mode === 'login' ? 'signup' : 'login');
  $('auth-form').onsubmit = async e => {
    e.preventDefault();
    const email = $('auth-email').value.trim();
    const password = $('auth-pass').value;
    if (!email || password.length < 6) { showAuth('Escribe tu correo y una contraseña de al menos 6 caracteres.', true); return; }
    $('auth-submit').disabled = true;
    $('auth-msg').classList.remove('err');
    $('auth-msg').textContent = mode === 'signup' ? 'Creando cuenta…' : 'Entrando…';
    try {
      if (mode === 'signup') {
        const { data, error } = await supabase.auth.signUp({ email, password, options: { emailRedirectTo: location.origin } });
        if (error) throw error;
        if (!data.session) { setMode('login'); showAuth('Cuenta creada. Revisa tu correo y pulsa el enlace de confirmación; después entra aquí.'); }
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
      }
    } catch (err) {
      const m = String(err.message || '');
      showAuth(
        /invalid login/i.test(m) ? 'Correo o contraseña incorrectos.' :
        /not confirmed/i.test(m) ? 'Confirma tu correo con el enlace que te enviamos y vuelve a intentarlo.' :
        /already registered/i.test(m) ? 'Ese correo ya tiene cuenta. Entra con tu contraseña.' :
        /signups not allowed/i.test(m) ? 'El registro de cuentas nuevas está desactivado.' :
        'No se pudo completar: ' + m, true);
    } finally {
      $('auth-submit').disabled = false;
    }
  };
  $('logout').onclick = async () => { await supabase.auth.signOut(); location.hash = ''; location.reload(); };

  const { data } = await supabase.auth.getSession();
  if (data.session) enter(data.session); else showAuth();

  supabase.auth.onAuthStateChange((event, session) => {
    if (event === 'SIGNED_IN' && session && $('app').hidden) enter(session);
    if (event === 'SIGNED_OUT') showAuth();
  });
}

boot();

if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => navigator.serviceWorker.register('/sw.js').catch(() => {}));
}
