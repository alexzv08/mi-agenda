// Capa de datos: sincroniza el estado en memoria (S) con las tablas de Supabase.
// La app llama a save('habits' | 'todos' | 'log-YYYY-MM' | 'notes-YYYY-MM') tras cada cambio;
// aquí se compara con lo último guardado y se envían solo las diferencias.
import { supabase } from './supabase.js';

const PAGE = 1000;
async function fetchAll(table, columns) {
  const out = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase.from(table).select(columns).range(from, from + PAGE - 1);
    if (error) throw error;
    out.push(...data);
    if (data.length < PAGE) return out;
  }
}

const today = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
const habitRow = h => ((h.created ||= today()), { id: h.id, name: h.name, when_slot: h.when || null, days: h.days || null, start_day: h.created });
const todoRow = t => ((t.created ||= new Date().toISOString()), { id: t.id, text: t.text, day: t.date || null, done: !!t.done, done_day: t.doneDay || null, created_at: t.created });

export function createStore(S, { onChange, setSync }) {
  const synced = { habits: new Map(), todos: new Map(), logs: new Set(), notes: new Map(), planLoaded: false };
  const timers = {};
  const pending = new Set();
  let queue = Promise.resolve();

  async function load() {
    const [habits, logs, todos, notes, settings] = await Promise.all([
      fetchAll('habits', 'id,name,when_slot,days,start_day,created_at'),
      fetchAll('habit_logs', 'habit_id,day'),
      fetchAll('todos', 'id,text,day,done,done_day,created_at'),
      fetchAll('notes', 'day,text'),
      supabase.from('settings').select('plan_loaded').maybeSingle(),
    ]);
    if (settings.error) throw settings.error;

    habits.sort((a, b) => (a.created_at < b.created_at ? -1 : 1));
    S.habits = habits.map(r => ({ id: r.id, name: r.name, when: r.when_slot || undefined, ...(r.days ? { days: r.days } : {}), created: r.start_day }));
    S.todos = todos.map(r => ({ id: r.id, text: r.text, date: r.day, done: r.done, doneDay: r.done_day, created: r.created_at }));
    S.logs = {};
    for (const r of logs) {
      const m = r.day.slice(0, 7);
      ((S.logs[m] ||= {})[r.day] ||= {})[r.habit_id] = true;
    }
    S.notes = {};
    for (const r of notes) (S.notes[r.day.slice(0, 7)] ||= {})[r.day] = r.text;
    S.planLoaded = !!settings.data?.plan_loaded;

    synced.habits = new Map(S.habits.map(h => [h.id, JSON.stringify(habitRow(h))]));
    synced.todos = new Map(S.todos.map(t => [t.id, JSON.stringify(todoRow(t))]));
    synced.logs = new Set(logs.map(r => r.habit_id + '|' + r.day));
    synced.notes = new Map(notes.map(r => [r.day, r.text]));
    synced.planLoaded = S.planLoaded;
  }

  async function syncList(table, items, toRow, map) {
    const rows = items.map(toRow);
    const changed = rows.filter(r => map.get(r.id) !== JSON.stringify(r));
    const ids = new Set(rows.map(r => r.id));
    const removed = [...map.keys()].filter(id => !ids.has(id));
    if (changed.length) {
      const { error } = await supabase.from(table).upsert(changed);
      if (error) throw error;
      for (const r of changed) map.set(r.id, JSON.stringify(r));
    }
    if (removed.length) {
      const { error } = await supabase.from(table).delete().in('id', removed);
      if (error) throw error;
      for (const id of removed) map.delete(id);
    }
  }

  async function flush(name) {
    if (name === 'habits') {
      await syncList('habits', S.habits, habitRow, synced.habits);
      if (S.planLoaded !== synced.planLoaded) {
        const { error } = await supabase.from('settings').upsert({ plan_loaded: S.planLoaded });
        if (error) throw error;
        synced.planLoaded = S.planLoaded;
      }
    } else if (name === 'todos') {
      await syncList('todos', S.todos, todoRow, synced.todos);
    } else if (name.startsWith('log-')) {
      const month = name.slice(4);
      const live = new Set(S.habits.map(h => h.id));
      const now = new Set();
      for (const [day, hs] of Object.entries(S.logs[month] || {})) for (const hid of Object.keys(hs)) if (live.has(hid)) now.add(hid + '|' + day);
      const before = [...synced.logs].filter(k => k.slice(-10, -3) === month);
      const add = [...now].filter(k => !synced.logs.has(k));
      const del = before.filter(k => !now.has(k));
      if (add.length) {
        const { error } = await supabase.from('habit_logs').upsert(add.map(k => ({ habit_id: k.slice(0, -11), day: k.slice(-10) })));
        if (error) throw error;
        add.forEach(k => synced.logs.add(k));
      }
      for (const k of del) {
        const { error } = await supabase.from('habit_logs').delete().eq('habit_id', k.slice(0, -11)).eq('day', k.slice(-10));
        if (error) throw error;
        synced.logs.delete(k);
      }
    } else if (name.startsWith('notes-')) {
      const month = name.slice(6);
      const days = S.notes[month] || {};
      const upserts = Object.entries(days).filter(([d, t]) => synced.notes.get(d) !== t).map(([day, text]) => ({ day, text, updated_at: new Date().toISOString() }));
      const removed = [...synced.notes.keys()].filter(d => d.startsWith(month) && !(d in days));
      if (upserts.length) {
        const { error } = await supabase.from('notes').upsert(upserts);
        if (error) throw error;
        upserts.forEach(r => synced.notes.set(r.day, r.text));
      }
      if (removed.length) {
        const { error } = await supabase.from('notes').delete().in('day', removed);
        if (error) throw error;
        removed.forEach(d => synced.notes.delete(d));
      }
    }
  }

  // Todas las escrituras van en una sola cola: así un registro nunca llega antes que su hábito.
  function save(name, delay = 0) {
    pending.add(name);
    clearTimeout(timers[name]);
    timers[name] = setTimeout(() => {
      delete timers[name];
      queue = queue.then(async () => {
        pending.delete(name);
        setSync('warn', 'Guardando…');
        try {
          await flush(name);
          if (!pending.size) setSync('ok', 'Guardado');
        } catch (e) {
          console.error(e);
          setSync('err', 'No se pudo guardar. Revisa tu conexión; recargando tus datos…');
          try { await load(); onChange(); } catch (_) {}
        }
      });
    }, delay);
  }

  const busy = () => pending.size > 0 || Object.keys(timers).length > 0;

  // Al volver a la app (otra pestaña, otro dispositivo) recarga los datos si no hay cambios por guardar
  let lastRefresh = Date.now();
  async function refresh() {
    if (busy() || Date.now() - lastRefresh < 5000) return;
    lastRefresh = Date.now();
    try { await queue; if (!busy()) { await load(); onChange(); setSync('ok', 'Sincronizado'); } } catch (e) { setSync('err', 'Sin conexión. Tus datos pueden no estar al día.'); }
  }
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') refresh(); });
  window.addEventListener('focus', refresh);

  return { load, save, busy };
}
