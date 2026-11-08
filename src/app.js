import { createStore } from './store.js';

export function startApp() {

  const $ = id => document.getElementById(id);
  const CHECK = '<svg viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="M3 8.5l3.2 3L13 4.5" stroke="white" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  const pad = n => String(n).padStart(2, '0');
  const key = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const parse = k => { const [y, m, d] = k.split('-').map(Number); return new Date(y, m - 1, d); };
  const addDays = (k, n) => { const d = parse(k); d.setDate(d.getDate() + n); return key(d); };
  const todayKey = () => key(new Date());
  const uid = () => crypto.randomUUID();
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const fmtLong = new Intl.DateTimeFormat('es-ES', { weekday: 'long', day: 'numeric', month: 'long' });
  const fmtMonth = new Intl.DateTimeFormat('es-ES', { month: 'long', year: 'numeric' });
  const fmtShort = new Intl.DateTimeFormat('es-ES', { day: 'numeric', month: 'short' });

  // ---------- State ----------
  const S = { habits: [], todos: [], logs: {}, notes: {} }; // logs[YYYY-MM][date][habitId]=true ; notes[YYYY-MM][date]=text
  const ui = { sel: todayKey(), view: todayKey().slice(0, 7) };

  // ---------- Storage (Supabase) ----------
  function setSync(s, t) {
    $('sync').dataset.s = s; $('sync-t').textContent = t;
    if (s === 'ok' && $('note-s').textContent === 'Escribiendo…') $('note-s').textContent = 'Guardado';
  }
  const store = createStore(S, { onChange: () => render(), setSync });
  const save = store.save;

  // ---------- Domain ----------
  const isDone = (k, hid) => !!(S.logs[k.slice(0, 7)] && S.logs[k.slice(0, 7)][k] && S.logs[k.slice(0, 7)][k][hid]);
  const dowOf = k => (parse(k).getDay() + 6) % 7; // 0 = lunes
  const scheduled = (h, k) => !h.days || h.days.includes(dowOf(k));
  const WHEN = { m: 'Mañana', d: 'Durante el día', t: 'Tarde', n: 'Noche' };
  const WORDER = { m: 0, d: 1, t: 2, n: 3 };
  const byWhen = (a, b) => (WORDER[a.when] ?? 4) - (WORDER[b.when] ?? 4);
  const DSHORT = ['L', 'M', 'X', 'J', 'V', 'S', 'D'];
  const DNAME = ['lun', 'mar', 'mié', 'jue', 'vie', 'sáb', 'dom'];
  function daysText(days) {
    if (!days || days.length === 7) return 'Todos los días';
    const s = [...days].sort();
    const consecutive = s.length > 2 && s.every((d, i) => !i || d === s[i - 1] + 1);
    if (consecutive) return `De ${DNAME[s[0]]} a ${DNAME[s[s.length - 1]]}`;
    return s.map(d => DNAME[d]).join(', ');
  }
  const habitsFor = k => S.habits.filter(h => (!h.created || h.created <= k) && scheduled(h, k));
  function dayRatio(k) {
    const hs = habitsFor(k); if (!hs.length) return null;
    return hs.filter(h => isDone(k, h.id)).length / hs.length;
  }
  // Racha = días programados seguidos cumplidos (los días de descanso no la rompen)
  function streak(hid, ref) {
    const h = S.habits.find(x => x.id === hid); if (!h || (h.days && !h.days.length)) return 0;
    let g = 0;
    const prev = k => { do { k = addDays(k, -1); } while (!scheduled(h, k) && g++ < 400); return k; };
    let k = ref, n = 0;
    if (!scheduled(h, k)) k = prev(k);
    else if (!isDone(k, hid) && k === todayKey()) k = prev(k);
    while (isDone(k, hid) && n < 1000 && g < 2000) { n++; g++; k = prev(k); }
    return n;
  }
  function toggleHabit(k, hid) {
    const m = k.slice(0, 7);
    const month = S.logs[m] || (S.logs[m] = {});
    const day = month[k] || (month[k] = {});
    if (day[hid]) delete day[hid]; else day[hid] = true;
    if (!Object.keys(day).length) delete month[k];
    save('log-' + m); render();
  }

  // ---------- Render ----------
  function render() {
    const t = todayKey();
    $('hello').innerHTML = '<span class="hl">' + esc(cap(fmtLong.format(parse(t)))) + '</span>';
    // stats
    const ht = habitsFor(t);
    $('st-hab').textContent = `${ht.filter(h => isDone(t, h.id)).length}/${ht.length}`;
    $('st-todo').textContent = S.todos.filter(x => !x.done).length;
    const best = S.habits.reduce((m, h) => Math.max(m, streak(h.id, t)), 0);
    $('st-streak').textContent = best + ' d';
    renderCal(); renderDay(); renderInbox();
    if (!$('v-metricas').hidden) renderMetrics();
    if (!$('v-semana').hidden) renderWeek();
  }

  // ---------- Plan semanal propuesto ----------
  const PLAN = {
    habits: [
      { name: 'Hacer la cama', when: 'm' },
      { name: 'Ir al gym', when: 'm', days: [0, 1, 3, 4, 5] },
      { name: 'Estudiar la oposición TAI (bloque de 2 h)', when: 'm', days: [0, 1, 2, 3, 4, 5] },
      { name: 'Caminar 10.000–20.000 pasos', when: 'd' },
      { name: 'Gestionar el canal de YouTube (1 h)', when: 't', days: [0, 3] },
      { name: 'Proyecto SaaS / ecommerce (bloque de 2 h)', when: 't', days: [1, 2, 5] },
      { name: 'Limpiar la habitación', when: 'm', days: [6] },
      { name: 'Leer 20 páginas antes de dormir', when: 'n' },
    ],
    todos: [
      { text: 'Elegir el libro que vas a leer esta semana', dow: null },
      { text: 'Hacer un plan de estudio del temario TAI por bloques', dow: 0 },
      { text: 'Terminar la configuración del canal de YouTube (banner, descripción, enlaces)', dow: 0 },
      { text: 'Elegir idea y stack del proyecto SaaS / ecommerce', dow: 1 },
      { text: 'Preparar las rutinas del gym (5 días)', dow: null },
    ],
  };
  function nextDow(d) { let k = todayKey(); if (d === null) return k; for (let i = 0; i < 7 && dowOf(k) !== d; i++) k = addDays(k, 1); return k; }
  function loadPlan() {
    const c = todayKey(), names = new Set(S.habits.map(h => h.name.toLowerCase())), texts = new Set(S.todos.map(x => x.text.toLowerCase()));
    for (const p of PLAN.habits) if (!names.has(p.name.toLowerCase())) S.habits.push({ id: uid(), name: p.name, when: p.when, ...(p.days ? { days: p.days } : {}), created: c });
    for (const p of PLAN.todos) if (!texts.has(p.text.toLowerCase())) S.todos.push({ id: uid(), text: p.text, date: nextDow(p.dow), done: false, created: new Date().toISOString() });
    S.planLoaded = true; save('habits'); save('todos');
    if (dowOf(c) === 6) ui.week = addDays(c, 1); // en domingo, mostrar la semana que empieza
    render();
  }

  // ---------- Semana ----------
  function renderWeek() {
    const t = todayKey();
    ui.week = ui.week || mondayOf(t);
    const ds = range(addDays(ui.week, 6), 7);
    $('wk-title').textContent = `Semana del ${fmtShort.format(parse(ds[0]))} al ${fmtShort.format(parse(ds[6]))}`;

    $('plan-card').innerHTML = S.planLoaded ? '' : `<section class="panel plan">
      <div class="panel-h"><h2>Tu plan semanal propuesto</h2><span class="row"><button class="btn" data-act="loadplan">Añadir a mi agenda</button><button class="ghost" data-act="dismissplan">Descartar</button></span></div>
      <div class="chart-sub" style="margin-top:0">Gym y estudio por la mañana, proyecto y YouTube por la tarde, lectura por la noche. Los miércoles y domingos descansas del gym. Puedes cambiar los días después.</div>
      <ul>${PLAN.habits.map(h => `<li><b>${esc(h.name)}</b><span>${WHEN[h.when]} · ${daysText(h.days)}</span></li>`).join('')}</ul>
      <h3>Tareas puntuales</h3>
      <ul>${PLAN.todos.map(x => `<li><b>${esc(x.text)}</b><span>${x.dow === null ? 'Hoy' : cap(fmtLong.format(parse(nextDow(x.dow))))}</span></li>`).join('')}</ul>
    </section>`;

    $('wk-edit').setAttribute('aria-pressed', String(!!ui.editDays));
    $('wk-edit').textContent = ui.editDays ? 'Listo' : 'Editar días';
    $('wk-head').innerHTML = `<tr><th>Hábito</th>${ds.map((k, i) => `<th class="${k === t ? 'is-today' : ''}">${DNAME[i]}<span>${parse(k).getDate()}</span></th>`).join('')}</tr>`;
    let tot = 0, dn = 0;
    const hs = [...S.habits].sort(byWhen);
    $('wk-body').innerHTML = !hs.length ? `<tr><td colspan="8" style="color:var(--muted)">Aún no tienes hábitos. Carga el plan propuesto o añádelos desde la Agenda.</td></tr>` :
      hs.map(h => `<tr><td>${esc(h.name)}${ui.editDays ? `<select id="when-${h.id}" data-whenfor="${h.id}" aria-label="Momento del día para ${esc(h.name)}" style="display:block;margin-top:4px;padding:4px 6px;font-size:12px">${Object.entries(WHEN).map(([v, l]) => `<option value="${v}"${h.when === v ? ' selected' : ''}>${l}</option>`).join('')}</select>` : `<span class="meta-line">${h.when ? WHEN[h.when] : ''}</span>`}</td>${ds.map((k, i) => {
        if (ui.editDays) return `<td><button class="dchip" aria-pressed="${!h.days || h.days.includes(i)}" data-act="hday" data-id="${h.id}" data-dow="${i}" aria-label="${esc(h.name)}: ${DNAME[i]}">${DSHORT[i]}</button></td>`;
        if (!scheduled(h, k)) return '<td class="off" aria-label="Descanso">·</td>';
        const on = isDone(k, h.id); tot++; if (on) dn++;
        return `<td><button class="chk" role="checkbox" aria-checked="${on}" data-act="habk" data-id="${h.id}" data-date="${k}" aria-label="${esc(h.name)}, ${DNAME[i]} ${parse(k).getDate()}">${CHECK}</button></td>`;
      }).join('')}</tr>`).join('');
    $('wk-n').textContent = tot ? `${dn} de ${tot} hechos` : '';

    $('wk-days').innerHTML = ds.map((k, i) => {
      const items = S.todos.filter(x => x.date === k).sort((a, b) => a.done - b.done);
      return `<div class="wk-day${k === t ? ' is-today' : ''}"><h4><span>${DNAME[i]} ${parse(k).getDate()}</span><span>${items.filter(x => !x.done).length || ''}</span></h4>
        <ul class="list">${items.map(x => `<li class="item${x.done ? ' done' : ''}"><button class="chk round" role="checkbox" aria-checked="${!!x.done}" data-act="todo" data-id="${x.id}" aria-label="${esc(x.text)}">${CHECK}</button><span class="txt">${esc(x.text)}</span></li>`).join('')}</ul>
        <form data-addday="${k}"><input type="text" id="wk-in-${k}" placeholder="+ Añadir" autocomplete="off" aria-label="Nueva tarea para el ${DNAME[i]} ${parse(k).getDate()}"></form></div>`;
    }).join('');
  }
  $('prev-w').onclick = () => { ui.week = addDays(ui.week, -7); renderWeek(); };
  $('next-w').onclick = () => { ui.week = addDays(ui.week, 7); renderWeek(); };
  $('this-w').onclick = () => { ui.week = null; renderWeek(); };
  $('wk-edit').onclick = () => { ui.editDays = !ui.editDays; renderWeek(); };
  document.addEventListener('change', e => {
    const id = e.target.dataset && e.target.dataset.whenfor; if (!id) return;
    const h = S.habits.find(x => x.id === id); if (!h) return;
    h.when = e.target.value; save('habits'); render();
  });
  document.addEventListener('submit', e => {
    const k = e.target.dataset && e.target.dataset.addday; if (!k) return;
    e.preventDefault(); const inp = e.target.querySelector('input'); const v = inp.value.trim(); if (!v) return;
    S.todos.push({ id: uid(), text: v, date: k, done: false, created: new Date().toISOString() });
    save('todos'); render(); const again = $('wk-in-' + k); if (again) again.focus();
  });

  // Selector de días al crear un hábito
  ui.newDays = [0, 1, 2, 3, 4, 5, 6];
  function renderChips() { $('in-days').innerHTML = DSHORT.map((d, i) => `<button type="button" data-dchip="${i}" aria-pressed="${ui.newDays.includes(i)}" aria-label="${DNAME[i]}">${d}</button>`).join(''); }
  $('in-days').addEventListener('click', e => {
    const b = e.target.closest('[data-dchip]'); if (!b) return;
    const i = +b.dataset.dchip;
    const next = ui.newDays.includes(i) ? ui.newDays.filter(x => x !== i) : [...ui.newDays, i].sort();
    if (next.length) ui.newDays = next; renderChips();
  });
  renderChips();

  // ---------- Metrics ----------
  ui.range = 30;
  const pct = v => Math.round(v * 100);
  const range = (end, n) => { const a = []; for (let i = n - 1; i >= 0; i--) a.push(addDays(end, -i)); return a; };
  const doneDayOf = x => x.doneDay || x.date || (x.created || '').slice(0, 10);
  const mondayOf = k => { const d = parse(k); return addDays(k, -((d.getDay() + 6) % 7)); };
  const DOW = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];

  function periodStats(days) {
    let poss = 0, done = 0, perfect = 0, active = 0;
    for (const k of days) {
      const hs = habitsFor(k); if (!hs.length) continue;
      const d = hs.filter(h => isDone(k, h.id)).length;
      poss += hs.length; done += d; active++; if (d === hs.length) perfect++;
    }
    const tasks = S.todos.filter(x => x.done && days.includes(doneDayOf(x))).length;
    return { rate: poss ? done / poss : null, perfect, active, tasks };
  }
  function bestStreak(hid) {
    const h = S.habits.find(x => x.id === hid); if (!h) return 0;
    const keys = Object.values(S.logs).flatMap(m => Object.keys(m).filter(k => m[k][hid])).sort();
    if (!keys.length) return 0;
    const t = todayKey(); let best = 0, cur = 0;
    for (let k = keys[0], g = 0; k <= t && g < 3000; k = addDays(k, 1), g++) {
      if (!scheduled(h, k)) continue;
      if (isDone(k, hid)) { cur++; best = Math.max(best, cur); } else if (k !== t) cur = 0;
    }
    return best;
  }
  function deltaHTML(now, before, unit) {
    if (now === null || before === null) return '';
    const d = unit === '%' ? pct(now) - pct(before) : now - before;
    if (!d) return '<span class="delta">= que el periodo anterior</span>';
    return `<span class="delta ${d > 0 ? 'up' : 'down'}">${d > 0 ? '▲' : '▼'} ${Math.abs(d)}${unit === '%' ? ' pts' : ''} vs. periodo anterior</span>`;
  }

  function renderMetrics() {
    const t = todayKey(), n = ui.range;
    const days = range(t, n), prevDays = range(addDays(t, -n), n);
    const cur = periodStats(days), prev = periodStats(prevDays);
    document.querySelectorAll('[data-range]').forEach(b => b.setAttribute('aria-pressed', String(+b.dataset.range === n)));

    const dated = S.todos.filter(x => x.date && days.includes(x.date) && x.date <= t);
    const datedDone = dated.filter(x => x.done).length;
    const overdue = S.todos.filter(x => x.date && x.date < t && !x.done).length;
    const pending = S.todos.filter(x => !x.done).length;
    const bestNow = S.habits.reduce((m, h) => Math.max(m, streak(h.id, t)), 0);
    $('m-tiles').innerHTML = [
      ['Hábitos cumplidos', cur.rate === null ? '–' : pct(cur.rate) + '<small>%</small>', deltaHTML(cur.rate, prev.rate, '%') || 'Aún sin datos'],
      ['Días perfectos', `${cur.perfect}<small>/${cur.active}</small>`, 'Todos los hábitos hechos'],
      ['Tareas completadas', cur.tasks, deltaHTML(cur.tasks, prev.tasks, '')],
      ['Tareas a tiempo', dated.length ? pct(datedDone / dated.length) + '<small>%</small>' : '–', dated.length ? `${datedDone} de ${dated.length} con fecha en el periodo` : 'Sin tareas con fecha'],
      ['Pendientes', pending, overdue ? `<span class="delta down">${overdue} atrasadas</span>` : 'Ninguna atrasada'],
      ['Mejor racha activa', bestNow + '<small> d</small>', 'Días seguidos de un hábito'],
    ].map(([l, v, h]) => `<div class="tile"><span class="lbl">${l}</span><span class="val">${v}</span><span class="hint">${h}</span></div>`).join('');

    // Daily bars
    const daily = days.map(k => ({ k, r: dayRatio(k) }));
    const tickEvery = n <= 7 ? 1 : n <= 30 ? 7 : 30;
    $('m-daily').innerHTML = !S.habits.length ? '<div class="empty">Añade hábitos en la Agenda y márcalos para ver esta gráfica.</div>' :
      `<div class="cols">${[100, 50, 0].map(v => `<div class="gl" style="bottom:${v}%"><span>${v}%</span></div>`).join('')}
      ${daily.map(({ k, r }) => `<div class="c${r === null ? ' none' : r === 1 ? ' full' : ''}${k === t ? ' today' : ''}" data-tip="${esc(cap(fmtLong.format(parse(k))))}\n${r === null ? 'Sin hábitos ese día' : pct(r) + '% de hábitos hechos'}"><b style="height:${r === null ? 0 : Math.max(pct(r), r > 0 ? 2 : 0)}%"></b></div>`).join('')}</div>
      <div class="xax"><span>${esc(fmtShort.format(parse(days[0])))}</span>${n > 7 ? `<span>${esc(fmtShort.format(parse(days[Math.floor(n / 2)])))}</span>` : ''}<span>Hoy</span></div>`;

    // Day of week
    const acc = DOW.map(() => ({ s: 0, c: 0 }));
    for (const { k, r } of daily) if (r !== null) { const i = (parse(k).getDay() + 6) % 7; acc[i].s += r; acc[i].c++; }
    const avgs = acc.map(a => a.c ? a.s / a.c : null);
    const top = Math.max(...avgs.filter(v => v !== null), 0);
    $('m-dow').innerHTML = avgs.every(v => v === null) ? '<div class="empty">Sin datos todavía en este periodo.</div>' :
      avgs.map((v, i) => `<div class="hb${v !== null && v === top && top > 0 ? ' best' : ''}" data-tip="${DOW[i]}: ${v === null ? 'sin datos' : pct(v) + '% de media en ' + acc[i].c + ' días'}"><span>${DOW[i]}</span><span class="t"><b style="width:${v === null ? 0 : pct(v)}%"></b></span><span class="v">${v === null ? '–' : pct(v) + '%'}</span></div>`).join('');

    // Heatmap: 20 weeks, Monday-first columns
    const start = addDays(mondayOf(t), -7 * 19);
    let cells = '';
    for (let i = 0; i < 140; i++) {
      const k = addDays(start, i);
      if (k > t) { cells += '<i class="fut"></i>'; continue; }
      const r = dayRatio(k);
      const lvl = r === null || r === 0 ? 0 : r < .34 ? 1 : r < .67 ? 2 : r < 1 ? 3 : 4;
      cells += `<i class="l${lvl}" data-tip="${esc(cap(fmtLong.format(parse(k))))}\n${r === null ? 'Sin hábitos' : pct(r) + '% de hábitos hechos'}"></i>`;
    }
    $('m-heat').innerHTML = cells;

    // Per habit table
    $('m-habits').innerHTML = !S.habits.length ? '<tr><td colspan="5" style="color:var(--muted)">Aún no tienes hábitos.</td></tr>' :
      S.habits.map(h => {
        const ds = days.filter(k => (!h.created || h.created <= k) && scheduled(h, k));
        const d = ds.filter(k => isDone(k, h.id)).length;
        const r = ds.length ? d / ds.length : 0;
        return `<tr><td>${esc(h.name)}</td><td><div class="mini"><span class="t"><b style="width:${pct(r)}%"></b></span><span>${pct(r)}%</span></div></td><td class="num">${d}/${ds.length}</td><td class="num">${streak(h.id, t)} d</td><td class="num">${bestStreak(h.id)} d</td></tr>`;
      }).join('');

    // Tasks per week
    const w0 = addDays(mondayOf(t), -7 * 11);
    const weeks = Array.from({ length: 12 }, (_, i) => ({ k: addDays(w0, 7 * i), c: 0 }));
    for (const x of S.todos) if (x.done) { const m = mondayOf(doneDayOf(x)); const w = weeks.find(w => w.k === m); if (w) w.c++; }
    const maxW = Math.max(...weeks.map(w => w.c), 0);
    const top4 = Math.max(4, Math.ceil(maxW / 4) * 4);
    $('m-weeks').innerHTML = !maxW ? '<div class="empty">Cuando completes tareas, aquí verás cuántas terminas cada semana.</div>' :
      `<div class="cols" style="height:150px">${[top4, top4 / 2, 0].map(v => `<div class="gl" style="bottom:${v / top4 * 100}%"><span>${v}</span></div>`).join('')}
      ${weeks.map((w, i) => `<div class="c${i === 11 ? ' today' : ''}" data-tip="Semana del ${esc(fmtShort.format(parse(w.k)))}\n${w.c} tareas completadas"><b style="height:${w.c / top4 * 100}%"></b></div>`).join('')}</div>
      <div class="xax"><span>${esc(fmtShort.format(parse(weeks[0].k)))}</span><span>Esta semana</span></div>`;
  }

  // Tabs (hash routing)
  function route() {
    const v = location.hash === '#metricas' ? 'metricas' : location.hash === '#semana' ? 'semana' : 'agenda';
    for (const n of ['agenda', 'semana', 'metricas']) {
      $('v-' + n).hidden = n !== v;
      if (n === v) $('tab-' + n).setAttribute('aria-current', 'page'); else $('tab-' + n).removeAttribute('aria-current');
    }
    if (v === 'metricas') renderMetrics();
    if (v === 'semana') renderWeek();
  }
  window.addEventListener('hashchange', route);
  document.addEventListener('click', e => { const b = e.target.closest('[data-range]'); if (b) { ui.range = +b.dataset.range; renderMetrics(); } });

  // Tooltip
  const tip = document.createElement('div'); tip.id = 'tip'; tip.hidden = true; document.body.appendChild(tip);
  function showTip(e) {
    const el = e.target.closest('[data-tip]'); if (!el) { tip.hidden = true; return; }
    tip.textContent = el.dataset.tip; tip.hidden = false;
    const w = tip.offsetWidth, h = tip.offsetHeight;
    tip.style.left = Math.min(window.innerWidth - w - 8, Math.max(8, e.clientX - w / 2)) + 'px';
    tip.style.top = Math.max(8, e.clientY - h - 14) + 'px';
  }
  document.addEventListener('pointermove', showTip);
  document.addEventListener('pointerdown', showTip);
  document.addEventListener('pointerleave', () => { tip.hidden = true; });
  document.addEventListener('scroll', () => { tip.hidden = true; }, { passive: true });
  const cap = s => s.charAt(0).toUpperCase() + s.slice(1);

  function renderCal() {
    const [y, m] = ui.view.split('-').map(Number);
    $('cal-title').textContent = cap(fmtMonth.format(new Date(y, m - 1, 1)));
    const first = new Date(y, m - 1, 1);
    const offset = (first.getDay() + 6) % 7;
    const start = new Date(y, m - 1, 1 - offset);
    const t = todayKey();
    const byDate = {};
    for (const x of S.todos) if (x.date) (byDate[x.date] || (byDate[x.date] = [])).push(x);
    let html = '';
    const cells = Math.ceil((offset + new Date(y, m, 0).getDate()) / 7) * 7;
    for (let i = 0; i < cells; i++) {
      const d = new Date(start); d.setDate(start.getDate() + i);
      const k = key(d);
      const cls = ['day'];
      if (k.slice(0, 7) !== ui.view) cls.push('out');
      if (k === t) cls.push('today');
      if (k === ui.sel) cls.push('sel');
      const todos = byDate[k] || [];
      const dots = todos.slice(0, 4).map(x => `<i class="${x.done ? 'done' : ''}"></i>`).join('');
      const r = k <= t ? dayRatio(k) : null;
      const bar = r === null ? '' : `<div class="bar"><b style="width:${Math.round(r * 100)}%"></b></div>`;
      const label = `${fmtLong.format(d)}${todos.length ? `, ${todos.length} tareas` : ''}${r !== null ? `, hábitos ${Math.round(r * 100)}%` : ''}`;
      html += `<button class="${cls.join(' ')}" data-date="${k}" aria-label="${esc(label)}"${k === ui.sel ? ' aria-current="date"' : ''}><span class="num">${d.getDate()}</span><span class="meta"><span class="dots">${dots}</span>${bar}</span></button>`;
    }
    $('days').innerHTML = html;
  }

  function renderDay() {
    const k = ui.sel, t = todayKey();
    const d = parse(k);
    let title = fmtLong.format(d);
    if (k === t) title = 'Hoy · ' + title;
    else if (k === addDays(t, -1)) title = 'Ayer · ' + title;
    else if (k === addDays(t, 1)) title = 'Mañana · ' + title;
    $('day-title').textContent = title;

    // habits (solo los que tocan este día)
    const hs = S.habits.filter(h => scheduled(h, k)).sort(byWhen);
    const rest = S.habits.filter(h => !scheduled(h, k));
    const done = hs.filter(h => isDone(k, h.id)).length;
    $('hab-n').textContent = hs.length ? `${done} de ${hs.length}` : '';
    $('hab-bar').style.width = hs.length ? (done / hs.length * 100) + '%' : '0%';
    if (!S.habits.length) {
      $('habits').innerHTML = `<li class="empty">Aún no tienes hábitos. Son las cosas que quieres hacer cada día y marcar al terminarlas.<span class="row">${S.planLoaded ? '' : '<button class="btn" data-act="loadplan">Cargar mi plan semanal</button>'}<button class="btn sec" data-act="sample">Hábitos de ejemplo</button></span></li>`;
    } else {
      $('habits').innerHTML = (hs.length ? '' : '<li class="empty">Este día no tienes hábitos programados.</li>') + hs.map(h => {
        const on = isDone(k, h.id), s = streak(h.id, k);
        return `<li class="item${on ? ' done' : ''}">
          <button class="chk" role="checkbox" aria-checked="${on}" data-act="hab" data-id="${h.id}" aria-label="${esc(h.name)}">${CHECK}</button>
          <span class="txt">${esc(h.name)}<span class="meta-line">${h.when ? WHEN[h.when] + ' · ' : ''}${daysText(h.days)}</span></span>
          <span class="streak${s >= 3 ? ' hot' : ''}" title="Días seguidos">${s ? 'racha ' + s + ' d' : ''}</span>
          <button class="ghost danger" data-act="delhab" data-id="${h.id}">Quitar</button>
        </li>`;
      }).join('') + (rest.length ? `<li class="item rest"><span class="txt">Hoy descansas de: ${rest.map(h => esc(h.name)).join(', ')}</span></li>` : '');
    }

    // todos for the day (+ overdue when viewing today)
    const list = S.todos.filter(x => x.date === k).sort((a, b) => (a.done - b.done) || (a.created > b.created ? 1 : -1));
    const overdue = k === t ? S.todos.filter(x => x.date && x.date < t && !x.done).sort((a, b) => a.date < b.date ? -1 : 1) : [];
    const pend = list.filter(x => !x.done).length;
    $('todo-n').textContent = list.length ? `${list.length - pend} de ${list.length} hechas` : '';
    let html = overdue.map(x => todoRow(x, true)).join('') + list.map(x => todoRow(x, false)).join('');
    if (!html) html = `<li class="empty">Nada apuntado para este día. Escribe abajo lo que tienes que hacer.</li>`;
    $('todos').innerHTML = html;

    // note
    const note = (S.notes[k.slice(0, 7)] || {})[k] || '';
    const ta = $('note');
    if (document.activeElement !== ta || ta.dataset.date !== k) { ta.value = note; ta.dataset.date = k; }
    $('note-c').textContent = ta.value.length ? ta.value.length + ' caracteres' : '';
  }

  function todoRow(x, late) {
    return `<li class="item${x.done ? ' done' : ''}">
      <button class="chk round" role="checkbox" aria-checked="${!!x.done}" data-act="todo" data-id="${x.id}" aria-label="${esc(x.text)}">${CHECK}</button>
      <span class="txt">${esc(x.text)}${late ? `<br><span class="sub">del ${esc(fmtShort.format(parse(x.date)))}</span>` : ''}</span>
      ${late ? `<span class="pill">Atrasada</span><button class="ghost" data-act="today" data-id="${x.id}">Pasar a hoy</button>` : `<button class="ghost" data-act="unsched" data-id="${x.id}" title="Quitar la fecha">Sin fecha</button>`}
      <button class="ghost danger" data-act="deltodo" data-id="${x.id}">Borrar</button>
    </li>`;
  }

  function renderInbox() {
    const items = S.todos.filter(x => !x.date).sort((a, b) => (a.done - b.done) || (a.created > b.created ? 1 : -1));
    const pend = items.filter(x => !x.done).length;
    $('inbox-n').textContent = items.length ? `${pend} pendientes` : '';
    const selLabel = ui.sel === todayKey() ? 'Para hoy' : 'Al ' + fmtShort.format(parse(ui.sel));
    $('inbox').innerHTML = items.length ? items.map(x => `<li class="item${x.done ? ' done' : ''}">
      <button class="chk round" role="checkbox" aria-checked="${!!x.done}" data-act="todo" data-id="${x.id}" aria-label="${esc(x.text)}">${CHECK}</button>
      <span class="txt">${esc(x.text)}</span>
      ${x.done ? '' : `<button class="ghost" data-act="sched" data-id="${x.id}" title="Programar en el día seleccionado">${esc(selLabel)}</button>`}
      <button class="ghost danger" data-act="deltodo" data-id="${x.id}">Borrar</button>
    </li>`).join('') : `<li class="empty">Tu lista está vacía. Apunta aquí lo que tengas que hacer algún día; luego puedes pasarlo a una fecha.</li>`;
  }

  // ---------- Events ----------
  const confirmDel = {};
  document.addEventListener('click', e => {
    const dayBtn = e.target.closest('.day[data-date]');
    if (dayBtn) { select(dayBtn.dataset.date); return; }
    const b = e.target.closest('[data-act]'); if (!b) return;
    const id = b.dataset.id, act = b.dataset.act;
    const todo = S.todos.find(x => x.id === id);
    if (act === 'hab') toggleHabit(ui.sel, id);
    else if (act === 'habk') toggleHabit(b.dataset.date, id);
    else if (act === 'loadplan') loadPlan();
    else if (act === 'dismissplan') { S.planLoaded = true; save('habits'); render(); }
    else if (act === 'hday') {
      const h = S.habits.find(x => x.id === id); if (!h) return;
      const i = +b.dataset.dow, cur = h.days ? [...h.days] : [0, 1, 2, 3, 4, 5, 6];
      const next = cur.includes(i) ? cur.filter(x => x !== i) : [...cur, i].sort();
      if (!next.length) return;
      if (next.length === 7) delete h.days; else h.days = next;
      save('habits'); render();
    }
    else if (act === 'todo' && todo) { todo.done = !todo.done; todo.doneDay = todo.done ? todayKey() : null; save('todos'); render(); }
    else if (act === 'today' && todo) { todo.date = todayKey(); save('todos'); render(); }
    else if (act === 'sched' && todo) { todo.date = ui.sel; save('todos'); render(); }
    else if (act === 'unsched' && todo) { todo.date = null; save('todos'); render(); }
    else if (act === 'deltodo' || act === 'delhab') {
      if (confirmDel[id]) {
        clearTimeout(confirmDel[id]); delete confirmDel[id];
        if (act === 'deltodo') { S.todos = S.todos.filter(x => x.id !== id); save('todos'); }
        else { S.habits = S.habits.filter(x => x.id !== id); save('habits'); }
        render();
      } else {
        b.textContent = '¿Seguro?';
        confirmDel[id] = setTimeout(() => { delete confirmDel[id]; render(); }, 3000);
      }
    }
    else if (act === 'sample') {
      const c = todayKey();
      S.habits = ['Beber 2 litros de agua', 'Hacer ejercicio 30 min', 'Leer 20 minutos', 'Revisar la agenda de mañana']
        .map(name => ({ id: uid(), name, created: c }));
      save('habits'); render();
    }
  });

  function select(k) { ui.sel = k; ui.view = k.slice(0, 7); render(); }
  $('prev-m').onclick = () => { const [y, m] = ui.view.split('-').map(Number); ui.view = key(new Date(y, m - 2, 1)).slice(0, 7); renderCal(); };
  $('next-m').onclick = () => { const [y, m] = ui.view.split('-').map(Number); ui.view = key(new Date(y, m, 1)).slice(0, 7); renderCal(); };
  $('go-today').onclick = () => select(todayKey());
  $('prev-d').onclick = () => select(addDays(ui.sel, -1));
  $('next-d').onclick = () => select(addDays(ui.sel, 1));

  $('f-habit').onsubmit = e => {
    e.preventDefault(); const v = $('in-habit').value.trim(); if (!v) return;
    const h = { id: uid(), name: v, when: $('in-when').value, created: todayKey() };
    if (ui.newDays.length < 7) h.days = [...ui.newDays];
    S.habits.push(h); $('in-habit').value = '';
    save('habits'); render();
  };
  $('f-todo').onsubmit = e => {
    e.preventDefault(); const v = $('in-todo').value.trim(); if (!v) return;
    S.todos.push({ id: uid(), text: v, date: ui.sel, done: false, created: new Date().toISOString() }); $('in-todo').value = '';
    save('todos'); render();
  };
  $('f-inbox').onsubmit = e => {
    e.preventDefault(); const v = $('in-inbox').value.trim(); if (!v) return;
    S.todos.push({ id: uid(), text: v, date: null, done: false, created: new Date().toISOString() }); $('in-inbox').value = '';
    save('todos'); render();
  };
  $('note').addEventListener('input', e => {
    const ta = e.target, k = ta.dataset.date || ui.sel, m = k.slice(0, 7);
    const month = S.notes[m] || (S.notes[m] = {});
    if (ta.value.trim()) month[k] = ta.value; else delete month[k];
    $('note-s').textContent = 'Escribiendo…';
    $('note-c').textContent = ta.value.length ? ta.value.length + ' caracteres' : '';
    save('notes-' + m, 800);
  });

  // Keep "today" correct if the page stays open past midnight
  let lastToday = todayKey();
  setInterval(() => { const t = todayKey(); if (t !== lastToday) { if (ui.sel === lastToday) ui.sel = t; lastToday = t; render(); } }, 60000);

  return { route, render, load: store.load, setSync };
}
