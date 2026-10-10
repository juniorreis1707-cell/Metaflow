/* MetaFlow — ferramentas extras: calendário, modo foco, hábitos, estatísticas,
   conquistas, revisão da semana, lembretes, sugestões com IA e instalação (PWA).
   Depende de window.MetaFlowApp (script.js). Tudo fica no navegador. */
(function () {
    'use strict';

    var App = window.MetaFlowApp;
    if (!App) { return; }

    var $ = function (id) { return document.getElementById(id); };
    var esc = App.esc;
    var icon = App.icon;
    var plural = App.plural;
    var today = App.todayISO;

    /* ---------- Dados próprios (por conta) ---------- */

    var DEFAULT_SETTINGS = { notify: false, apiKey: '', model: 'claude-haiku-5-5' };
    var user = window.MetaAuth && MetaAuth.current();
    var KEY = 'metaflow_extra:' + (user ? user.email : 'local');
    var data = loadData();

    function loadData() {
        var d = {};
        try { d = JSON.parse(localStorage.getItem(KEY) || '{}') || {}; } catch (e) { d = {}; }
        return {
            habits: Array.isArray(d.habits) ? d.habits : [],
            focusLog: Array.isArray(d.focusLog) ? d.focusLog : [],
            unlocked: d.unlocked && typeof d.unlocked === 'object' ? d.unlocked : {},
            seeded: !!d.seeded,
            notified: d.notified && typeof d.notified === 'object' ? d.notified : {},
            summaryDay: d.summaryDay || '',
            lastReview: d.lastReview || '',
            reviews: d.reviews && typeof d.reviews === 'object' ? d.reviews : {},
            settings: Object.assign({}, DEFAULT_SETTINGS, d.settings || {})
        };
    }

    function saveData() {
        try { localStorage.setItem(KEY, JSON.stringify(data)); } catch (e) { /* armazenamento cheio */ }
    }

    /* ---------- Datas ---------- */

    function dayNum(s) {
        var p = s.split('-');
        return Math.round(Date.UTC(+p[0], +p[1] - 1, +p[2]) / 86400000);
    }
    function addDays(s, n) {
        var p = s.split('-');
        return App.isoOf(new Date(+p[0], +p[1] - 1, +p[2] + n, 12));
    }
    function dayOf(isoTime) { return App.isoOf(new Date(isoTime)); }
    function fmtMin(m) {
        m = Math.round(m);
        if (m < 60) { return m + ' min'; }
        var h = Math.floor(m / 60), r = m % 60;
        return h + ' h' + (r ? ' ' + r + ' min' : '');
    }
    var WD_SHORT = ['D', 'S', 'T', 'Q', 'Q', 'S', 'S'];
    var WD_NAME = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'];
    var MONTHS = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];

    /* ======================================================================
       Calendário
       ====================================================================== */

    var cal = (function () {
        var now = new Date();
        return { y: now.getFullYear(), m: now.getMonth() };
    })();

    function renderCalendar() {
        var box = $('calendarContainer');
        var goals = App.getVisible();
        var byDay = {};
        goals.forEach(function (g) { (byDay[g.deadline] = byDay[g.deadline] || []).push(g); });

        var first = new Date(cal.y, cal.m, 1);
        var offset = first.getDay();
        var t = today();
        var html = '<div class="cal-head">' +
            '<h2 class="cal-title">' + MONTHS[cal.m] + ' de ' + cal.y + '</h2>' +
            '<div class="cal-nav">' +
            '<button type="button" class="btn btn-ghost btn-sm" data-tools="cal-today">Hoje</button>' +
            '<button type="button" class="icon-btn" data-tools="cal-prev" aria-label="Mês anterior">' + icon('chevl') + '</button>' +
            '<button type="button" class="icon-btn" data-tools="cal-next" aria-label="Próximo mês">' + icon('chevr') + '</button>' +
            '</div></div>';

        html += '<div class="cal-grid" role="grid">';
        WD_NAME.forEach(function (n, i) { html += '<div class="cal-wd" role="columnheader">' + n.slice(0, 3) + '</div>'; });
        for (var i = 0; i < 42; i++) {
            var d = new Date(cal.y, cal.m, 1 - offset + i, 12);
            var key = App.isoOf(d);
            var other = d.getMonth() !== cal.m;
            var items = byDay[key] || [];
            var cls = 'cal-day' + (other ? ' is-other' : '') + (key === t ? ' is-today' : '');
            html += '<div class="' + cls + '" role="gridcell" data-tools="cal-day" data-date="' + key + '">' +
                '<div class="cal-daytop"><span class="cal-num">' + d.getDate() + '</span>' +
                '<button type="button" class="cal-add" data-tools="cal-day" data-date="' + key + '" aria-label="Nova meta em ' + d.getDate() + ' de ' + MONTHS[d.getMonth()] + '">' + icon('plus') + '</button></div>';
            items.slice(0, 3).forEach(function (g) {
                html += '<button type="button" class="cal-chip prio-' + g.priority + ' st-' + g.status + '" data-tools="cal-goal" data-id="' + esc(g.id) + '" title="' + esc(g.title) + '">' + esc(g.title) + '</button>';
            });
            if (items.length > 3) { html += '<span class="cal-more">+' + (items.length - 3) + ' mais</span>'; }
            html += '</div>';
            if (i === 34 && new Date(cal.y, cal.m, 1 - offset + 35, 12).getMonth() !== cal.m) { break; }
        }
        html += '</div>';
        box.innerHTML = html;
    }

    /* ======================================================================
       Modo foco (pomodoro)
       ====================================================================== */

    var timer = { mode: 'focus', focusMin: 25, breakMin: 5, running: false, endAt: 0, left: 25 * 60000, goalId: '' };

    function timerTotal() { return (timer.mode === 'focus' ? timer.focusMin : timer.breakMin) * 60000; }
    function timerLeft() { return timer.running ? Math.max(0, timer.endAt - Date.now()) : timer.left; }
    function fmtClock(ms) {
        var s = Math.ceil(ms / 1000);
        var m = Math.floor(s / 60);
        s = s % 60;
        return (m < 10 ? '0' : '') + m + ':' + (s < 10 ? '0' : '') + s;
    }
    function timerStart() {
        if (timer.running) { return; }
        if (timer.left <= 0) { timer.left = timerTotal(); }
        timer.endAt = Date.now() + timer.left;
        timer.running = true;
        askNotifyIfNeeded();
    }
    function timerPause() {
        if (!timer.running) { return; }
        timer.left = Math.max(0, timer.endAt - Date.now());
        timer.running = false;
    }
    function timerReset() { timer.running = false; timer.left = timerTotal(); }
    function timerSetMode(mode) { timer.mode = mode; timerReset(); }

    function beep() {
        try {
            var Ctx = window.AudioContext || window.webkitAudioContext;
            if (!Ctx) { return; }
            var ctx = new Ctx();
            [0, 0.22, 0.44].forEach(function (delay, i) {
                var osc = ctx.createOscillator();
                var gain = ctx.createGain();
                osc.type = 'sine';
                osc.frequency.value = i === 2 ? 988 : 784;
                gain.gain.setValueAtTime(0.0001, ctx.currentTime + delay);
                gain.gain.exponentialRampToValueAtTime(0.25, ctx.currentTime + delay + 0.02);
                gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + delay + 0.18);
                osc.connect(gain);
                gain.connect(ctx.destination);
                osc.start(ctx.currentTime + delay);
                osc.stop(ctx.currentTime + delay + 0.2);
            });
            setTimeout(function () { ctx.close(); }, 1200);
        } catch (e) { /* sem áudio */ }
    }

    function systemNotify(title, body) {
        try {
            if (data.settings.notify && 'Notification' in window && Notification.permission === 'granted') {
                new Notification(title, { body: body, icon: 'icons/icon-192.png' });
            }
        } catch (e) { /* ignora */ }
    }

    function timerFinish() {
        timer.running = false;
        if (timer.mode === 'focus') {
            var minutes = timer.focusMin;
            data.focusLog.push({ date: today(), goalId: timer.goalId, minutes: minutes, at: new Date().toISOString() });
            if (data.focusLog.length > 500) { data.focusLog = data.focusLog.slice(-500); }
            saveData();
            if (timer.goalId && App.findGoal(timer.goalId)) { App.addFocus(timer.goalId, minutes); }
            timer.mode = 'break';
            App.toast('Sessão de foco concluída: ' + minutes + ' min. Faça uma pausa.');
            systemNotify('Foco concluído', minutes + ' minutos. Hora da pausa.');
        } else {
            timer.mode = 'focus';
            App.toast('Pausa terminada. Pronto para outra sessão?');
            systemNotify('Pausa terminada', 'Volte ao foco quando quiser.');
        }
        timer.left = timerTotal();
        beep();
        refreshChip();
        if (toolsOpen() && currentTab === 'focus') { renderTab(); }
    }

    function refreshChip() {
        var chip = $('focusChip');
        var left = timerLeft();
        var active = timer.running || (left < timerTotal() && left > 0);
        var hide = !active || (toolsOpen() && currentTab === 'focus');
        chip.hidden = hide;
        if (!hide) {
            $('focusChipTime').textContent = fmtClock(left);
            $('focusChipLabel').textContent = timer.mode === 'focus' ? 'Foco' : 'Pausa';
        }
        document.title = timer.running ? '(' + fmtClock(left) + ') MetaFlow' : 'MetaFlow';
        var big = $('timerClock');
        if (big) {
            big.textContent = fmtClock(left);
            var ring = $('timerRingFill');
            if (ring) {
                var progress = 1 - left / timerTotal();
                ring.style.strokeDashoffset = String(597 * (1 - Math.min(1, Math.max(0, progress))));
            }
        }
    }

    setInterval(function () {
        if (timer.running && timer.endAt - Date.now() <= 0) { timerFinish(); }
        refreshChip();
    }, 500);

    function focusToday() {
        var t = today();
        return data.focusLog.filter(function (x) { return x.date === t; }).reduce(function (n, x) { return n + x.minutes; }, 0);
    }

    function renderFocusTab() {
        var open = App.getGoals().filter(function (g) { return g.status !== 'completed'; })
            .sort(function (a, b) { return a.deadline < b.deadline ? -1 : 1; });
        if (timer.goalId && !open.some(function (g) { return g.id === timer.goalId; })) { timer.goalId = ''; }
        var options = '<option value="">Sem meta específica</option>' + open.map(function (g) {
            return '<option value="' + esc(g.id) + '"' + (g.id === timer.goalId ? ' selected' : '') + '>' + esc(g.title) + '</option>';
        }).join('');
        var recent = data.focusLog.slice(-5).reverse().map(function (x) {
            var g = App.findGoal(x.goalId);
            return '<li><span>' + esc(g ? g.title : 'Sem meta') + '</span><span>' + x.minutes + ' min · ' + App.formatShort(x.date) + '</span></li>';
        }).join('');

        return '<div class="timer">' +
            '<div class="timer-modes" role="group" aria-label="Tipo de sessão">' +
            '<button type="button" class="seg-btn' + (timer.mode === 'focus' ? ' is-active' : '') + '" data-tools="timer-mode" data-mode="focus">Foco</button>' +
            '<button type="button" class="seg-btn' + (timer.mode === 'break' ? ' is-active' : '') + '" data-tools="timer-mode" data-mode="break">Pausa</button>' +
            '</div>' +
            '<div class="timer-face">' +
            '<svg viewBox="0 0 200 200" aria-hidden="true"><circle class="ring-track" cx="100" cy="100" r="95" fill="none" stroke-width="8"/>' +
            '<circle id="timerRingFill" class="timer-ring" cx="100" cy="100" r="95" fill="none" stroke-width="8" stroke-linecap="round" stroke-dasharray="597" stroke-dashoffset="597" transform="rotate(-90 100 100)"/></svg>' +
            '<div class="timer-clock" id="timerClock" aria-live="off">' + fmtClock(timerLeft()) + '</div></div>' +
            '<div class="timer-actions">' +
            (timer.running
                ? '<button type="button" class="btn btn-primary" data-tools="timer-pause">Pausar</button>'
                : '<button type="button" class="btn btn-primary" data-tools="timer-start">' + (timerLeft() < timerTotal() ? 'Continuar' : 'Começar') + '</button>') +
            '<button type="button" class="btn btn-ghost" data-tools="timer-reset">Zerar</button></div>' +
            '<div class="field-row timer-config">' +
            '<div class="field"><label for="timerGoal">Meta</label><select id="timerGoal">' + options + '</select></div>' +
            '<div class="field"><label for="timerLen">Duração do foco</label><select id="timerLen">' +
            [15, 25, 50].map(function (m) { return '<option value="' + m + '"' + (timer.focusMin === m ? ' selected' : '') + '>' + m + ' minutos</option>'; }).join('') +
            '</select></div></div>' +
            '<p class="tools-note">Hoje: <strong>' + fmtMin(focusToday()) + '</strong> de foco. O tempo concluído entra na meta escolhida.</p>' +
            (recent ? '<h3 class="tools-h">Últimas sessões</h3><ul class="plain-list">' + recent + '</ul>' : '') +
            '</div>';
    }

    /* ======================================================================
       Hábitos
       ====================================================================== */

    function habitStreak(h) {
        var d = today();
        if (!h.days[d]) { d = addDays(d, -1); }
        var n = 0;
        while (h.days[d]) { n++; d = addDays(d, -1); }
        return n;
    }

    function renderHabitsTab() {
        var days = [];
        for (var i = 6; i >= 0; i--) { days.push(addDays(today(), -i)); }
        var doneToday = data.habits.filter(function (h) { return h.days[today()]; }).length;

        var html = '<div class="habit-add"><label class="sr-only" for="habitName">Novo hábito</label>' +
            '<input type="text" id="habitName" maxlength="50" placeholder="Ex.: Beber 2 litros de água" autocomplete="off">' +
            '<button type="button" class="btn btn-primary" data-tools="habit-add">Adicionar</button></div>';

        if (!data.habits.length) {
            return html + '<p class="tools-empty">Hábitos são coisas que você repete todo dia, como ler ou treinar. Marque cada dia e acompanhe a sequência.</p>';
        }

        html += '<p class="tools-note">Hoje: <strong>' + doneToday + ' de ' + data.habits.length + '</strong> marcados.</p>';
        html += '<div class="habit-grid"><div class="habit-row habit-headrow"><span></span><span class="habit-days">' +
            days.map(function (d) {
                var wd = new Date(dayNum(d) * 86400000 + 43200000).getUTCDay();
                return '<span class="habit-wd' + (d === today() ? ' is-today' : '') + '">' + WD_SHORT[wd] + '</span>';
            }).join('') + '</span><span></span></div>';
        data.habits.forEach(function (h) {
            var streak = habitStreak(h);
            html += '<div class="habit-row"><div class="habit-name"><strong>' + esc(h.name) + '</strong><small>' +
                (streak ? plural(streak, 'dia seguido', 'dias seguidos') : 'sem sequência') + '</small></div>' +
                '<span class="habit-days">' + days.map(function (d) {
                    var on = !!h.days[d];
                    return '<button type="button" class="habit-dot' + (on ? ' is-on' : '') + '" data-tools="habit-day" data-id="' + esc(h.id) + '" data-date="' + d + '" aria-pressed="' + on + '" aria-label="' + esc(h.name) + ', ' + App.formatShort(d) + '"></button>';
                }).join('') + '</span>' +
                '<button type="button" class="icon-btn icon-btn-danger" data-tools="habit-del" data-id="' + esc(h.id) + '" aria-label="Excluir hábito ' + esc(h.name) + '">' + icon('trash') + '</button></div>';
        });
        return html + '</div>';
    }

    /* ======================================================================
       Estatísticas, conquistas e nível
       ====================================================================== */

    function completionStreak(goals) {
        var set = {};
        goals.forEach(function (g) { if (g.completedAt) { set[dayOf(g.completedAt)] = true; } });
        var d = today();
        if (!set[d]) { d = addDays(d, -1); }
        var n = 0;
        while (set[d]) { n++; d = addDays(d, -1); }
        return n;
    }

    function computeStats() {
        var goals = App.getGoals();
        var done = goals.filter(function (g) { return g.status === 'completed'; });
        var cats = {};
        goals.forEach(function (g) { if (g.category) { cats[g.category] = true; } });
        var habitChecks = 0, bestHabit = 0;
        data.habits.forEach(function (h) {
            habitChecks += Object.keys(h.days).length;
            bestHabit = Math.max(bestHabit, habitStreak(h));
        });
        var focusMin = data.focusLog.reduce(function (n, x) { return n + x.minutes; }, 0);
        var subtasksDone = goals.reduce(function (n, g) { return n + g.subtasks.filter(function (s) { return s.completed; }).length; }, 0);
        var xp = done.length * 20 + subtasksDone * 3 + Math.floor(focusMin / 5) + habitChecks * 2;
        var level = Math.floor(Math.sqrt(xp / 40)) + 1;
        return {
            goals: goals, done: done, total: goals.length, completed: done.length,
            overdue: goals.filter(App.isOverdue).length,
            categories: Object.keys(cats).length,
            subtasksDone: subtasksDone, focusMin: focusMin,
            habitChecks: habitChecks, bestHabit: bestHabit,
            streak: completionStreak(goals),
            xp: xp, level: level,
            levelStart: 40 * (level - 1) * (level - 1),
            levelEnd: 40 * level * level
        };
    }

    var BADGES = [
        { id: 'first', name: 'Primeiro passo', desc: 'Conclua 1 meta', val: function (s) { return [s.completed, 1]; } },
        { id: 'five', name: 'Pegando ritmo', desc: 'Conclua 5 metas', val: function (s) { return [s.completed, 5]; } },
        { id: 'ten', name: 'Imparável', desc: 'Conclua 10 metas', val: function (s) { return [s.completed, 10]; } },
        { id: 'twentyfive', name: 'Máquina de metas', desc: 'Conclua 25 metas', val: function (s) { return [s.completed, 25]; } },
        { id: 'streak3', name: 'Três dias seguidos', desc: 'Conclua metas por 3 dias seguidos', val: function (s) { return [s.streak, 3]; } },
        { id: 'streak7', name: 'Semana perfeita', desc: 'Conclua metas por 7 dias seguidos', val: function (s) { return [s.streak, 7]; } },
        { id: 'streak30', name: 'Mês de fluxo', desc: 'Conclua metas por 30 dias seguidos', val: function (s) { return [s.streak, 30]; } },
        { id: 'clean', name: 'Em dia', desc: '5 metas concluídas e nenhuma atrasada', val: function (s) { return [s.overdue === 0 ? s.completed : 0, 5]; } },
        { id: 'steps', name: 'Passo a passo', desc: 'Conclua 20 subtarefas', val: function (s) { return [s.subtasksDone, 20]; } },
        { id: 'focus60', name: 'Hora de foco', desc: 'Acumule 60 minutos de foco', val: function (s) { return [s.focusMin, 60]; } },
        { id: 'focus600', name: 'Mente de ferro', desc: 'Acumule 10 horas de foco', val: function (s) { return [s.focusMin, 600]; } },
        { id: 'habit7', name: 'Hábito firme', desc: '7 dias seguidos em um hábito', val: function (s) { return [s.bestHabit, 7]; } },
        { id: 'organized', name: 'Organizado', desc: 'Use 3 categorias diferentes', val: function (s) { return [s.categories, 3]; } }
    ];

    function badgeState(b, s) {
        var v = b.val(s);
        return { done: v[0] >= v[1], have: Math.min(v[0], v[1]), need: v[1] };
    }

    function checkAchievements() {
        var s = computeStats();
        var fresh = [];
        BADGES.forEach(function (b) {
            if (badgeState(b, s).done && !data.unlocked[b.id]) {
                data.unlocked[b.id] = new Date().toISOString();
                fresh.push(b);
            }
        });
        var pill = $('userLevel');
        if (pill) { pill.hidden = false; pill.textContent = 'Nível ' + s.level + ' · ' + s.xp + ' XP'; }
        if (!data.seeded) {
            // Primeira execução: marca o que já existia sem avisar de tudo de uma vez.
            data.seeded = true;
            saveData();
            return;
        }
        if (fresh.length) {
            saveData();
            fresh.forEach(function (b, i) {
                setTimeout(function () { App.toast('Conquista desbloqueada: ' + b.name); }, i * 600);
            });
        }
    }

    function renderAchievementsTab() {
        var s = computeStats();
        var span = s.levelEnd - s.levelStart;
        var pct = Math.min(100, Math.round(((s.xp - s.levelStart) / span) * 100));
        var html = '<div class="level-card"><div><span class="level-num">Nível ' + s.level + '</span>' +
            '<span class="level-xp">' + s.xp + ' XP · faltam ' + (s.levelEnd - s.xp) + ' para o nível ' + (s.level + 1) + '</span></div>' +
            '<div class="meter"><span style="width:' + pct + '%"></span></div>' +
            '<p class="tools-note">Ganhe XP concluindo metas (20), subtarefas (3), hábitos marcados (2) e foco (1 a cada 5 min).</p></div>';
        html += '<ul class="badges">';
        BADGES.forEach(function (b) {
            var st = badgeState(b, s);
            html += '<li class="badge' + (st.done ? ' is-done' : '') + '"><span class="badge-mark" aria-hidden="true">' + (st.done ? icon('check') : icon('lock')) + '</span>' +
                '<div><strong>' + esc(b.name) + '</strong><small>' + esc(b.desc) + '</small>' +
                (st.done ? '<small class="badge-status">Conquistada</small>' : '<small class="badge-status">' + st.have + ' de ' + st.need + '</small>') + '</div></li>';
        });
        return html + '</ul>';
    }

    function barRow(label, value, max, text) {
        var pct = max ? Math.round((value / max) * 100) : 0;
        return '<li class="bar-row"><span class="bar-label">' + esc(label) + '</span><span class="bar-track"><span style="width:' + pct + '%"></span></span><span class="bar-val">' + esc(text) + '</span></li>';
    }

    function renderStatsTab() {
        var s = computeStats();
        if (!s.total) { return '<p class="tools-empty">Crie e conclua algumas metas para ver suas estatísticas aqui.</p>'; }

        var days = s.done.filter(function (g) { return g.completedAt; }).map(function (g) {
            return Math.max(0, (new Date(g.completedAt) - new Date(g.createdAt)) / 86400000);
        });
        var avg = days.length ? days.reduce(function (a, b) { return a + b; }, 0) / days.length : null;

        var html = '<div class="stat-tiles">' +
            tile(s.completed, 'concluídas') + tile(s.total - s.completed, 'em aberto') + tile(s.overdue, 'atrasadas') +
            tile(avg === null ? '—' : (avg < 1 ? '< 1 dia' : avg.toFixed(1).replace('.', ',') + ' dias'), 'tempo médio até concluir') +
            tile(fmtMin(s.focusMin), 'de foco no total') + tile(s.streak + (s.streak === 1 ? ' dia' : ' dias'), 'de sequência') + '</div>';

        // últimas 8 semanas
        var weeks = [0, 0, 0, 0, 0, 0, 0, 0];
        var weekday = [0, 0, 0, 0, 0, 0, 0];
        var t = dayNum(today());
        s.done.forEach(function (g) {
            if (!g.completedAt) { return; }
            var d = dayOf(g.completedAt);
            var idx = Math.floor((t - dayNum(d)) / 7);
            if (idx >= 0 && idx < 8) { weeks[idx]++; }
            weekday[new Date(g.completedAt).getDay()]++;
        });
        var maxW = Math.max.apply(null, weeks.concat([1]));
        html += '<h3 class="tools-h">Metas concluídas por semana</h3><ul class="bars">';
        for (var i = 7; i >= 0; i--) {
            html += barRow(i === 0 ? 'Esta semana' : (i === 1 ? 'Semana passada' : 'Há ' + i + ' semanas'), weeks[i], maxW, String(weeks[i]));
        }
        html += '</ul>';

        // por categoria
        var cats = {};
        s.goals.forEach(function (g) {
            var c = g.category || 'Sem categoria';
            cats[c] = cats[c] || { all: 0, done: 0 };
            cats[c].all++;
            if (g.status === 'completed') { cats[c].done++; }
        });
        var names = Object.keys(cats).sort(function (a, b) { return cats[b].all - cats[a].all; }).slice(0, 8);
        html += '<h3 class="tools-h">Por categoria</h3><ul class="bars">';
        names.forEach(function (n) { html += barRow(n, cats[n].done, cats[n].all, cats[n].done + ' de ' + cats[n].all); });
        html += '</ul>';

        // melhor dia da semana
        var maxD = Math.max.apply(null, weekday);
        if (maxD > 0) {
            var best = weekday.indexOf(maxD);
            html += '<h3 class="tools-h">Seu dia mais produtivo</h3><p class="tools-note"><strong>' + WD_NAME[best] + '</strong> é quando você mais conclui metas (' + maxD + ').</p><ul class="bars">';
            weekday.forEach(function (n, d) { html += barRow(WD_NAME[d], n, maxD, String(n)); });
            html += '</ul>';
        }

        // foco por meta
        var top = s.goals.filter(function (g) { return g.focusMinutes > 0; })
            .sort(function (a, b) { return b.focusMinutes - a.focusMinutes; }).slice(0, 5);
        if (top.length) {
            html += '<h3 class="tools-h">Onde seu foco foi</h3><ul class="bars">';
            top.forEach(function (g) { html += barRow(g.title, g.focusMinutes, top[0].focusMinutes, fmtMin(g.focusMinutes)); });
            html += '</ul>';
        }
        return html;
    }

    function tile(value, label) {
        return '<div class="stat-tile"><strong>' + esc(String(value)) + '</strong><span>' + esc(label) + '</span></div>';
    }

    /* ======================================================================
       Revisão da semana
       ====================================================================== */

    function weekKey() {
        var d = new Date();
        d.setHours(12, 0, 0, 0);
        d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
        return App.isoOf(d);
    }

    function renderReviewTab() {
        var goals = App.getGoals();
        var t = today();
        var from = addDays(t, -6);
        var done = goals.filter(function (g) { return g.completedAt && dayOf(g.completedAt) >= from; })
            .sort(function (a, b) { return a.completedAt < b.completedAt ? 1 : -1; });
        var late = goals.filter(App.isOverdue);
        var upcoming = goals.filter(function (g) { return g.status !== 'completed' && g.deadline >= t && g.deadline <= addDays(t, 7); })
            .sort(function (a, b) { return a.deadline < b.deadline ? -1 : 1; });
        var focusWeek = data.focusLog.filter(function (x) { return x.date >= from; }).reduce(function (n, x) { return n + x.minutes; }, 0);
        var checks = 0;
        data.habits.forEach(function (h) { Object.keys(h.days).forEach(function (d) { if (d >= from && d <= t) { checks++; } }); });
        var rank = { high: 0, medium: 1, low: 2 };
        var next = goals.filter(function (g) { return g.status !== 'completed'; }).sort(function (a, b) {
            var la = App.isOverdue(a) ? 0 : 1, lb = App.isOverdue(b) ? 0 : 1;
            if (la !== lb) { return la - lb; }
            if (rank[a.priority] !== rank[b.priority]) { return rank[a.priority] - rank[b.priority]; }
            return a.deadline < b.deadline ? -1 : 1;
        }).slice(0, 3);

        function list(items, fmt, empty) {
            return items.length ? '<ul class="plain-list">' + items.map(fmt).join('') + '</ul>' : '<p class="tools-empty small">' + empty + '</p>';
        }

        return '<div class="stat-tiles">' + tile(done.length, 'concluídas nos últimos 7 dias') + tile(late.length, 'atrasadas agora') +
            tile(fmtMin(focusWeek), 'de foco') + tile(checks, 'hábitos marcados') + '</div>' +
            '<h3 class="tools-h">O que você concluiu</h3>' +
            list(done, function (g) { return '<li><span>' + esc(g.title) + '</span><span>' + App.formatShort(dayOf(g.completedAt)) + '</span></li>'; }, 'Nenhuma meta concluída nesta semana ainda.') +
            '<h3 class="tools-h">Pede atenção</h3>' +
            list(late, function (g) { return '<li><span>' + esc(g.title) + '</span><span class="due is-late">' + esc(App.dueInfo(g).text) + '</span></li>'; }, 'Nada atrasado. Ótimo.') +
            '<h3 class="tools-h">Próximos 7 dias</h3>' +
            list(upcoming, function (g) { return '<li><span>' + esc(g.title) + '</span><span>' + App.formatShort(g.deadline) + '</span></li>'; }, 'Nenhum prazo nos próximos 7 dias.') +
            '<h3 class="tools-h">Prioridades sugeridas para a próxima semana</h3>' +
            list(next, function (g, i) { return '<li><span>' + (i + 1) + '. ' + esc(g.title) + '</span><span>' + App.formatShort(g.deadline) + '</span></li>'; }, 'Sem metas abertas. Que tal criar a próxima?') +
            '<div class="field"><label for="reviewNote">O que funcionou nesta semana? O que mudar?</label>' +
            '<textarea id="reviewNote" rows="3" maxlength="800" placeholder="Anote em uma ou duas frases">' + esc(data.reviews[weekKey()] || '') + '</textarea></div>';
    }

    /* ======================================================================
       Lembretes, IA e instalação
       ====================================================================== */

    function notifyStatus() {
        if (!('Notification' in window)) { return 'Este navegador não oferece notificações.'; }
        if (Notification.permission === 'denied') { return 'Bloqueadas no navegador. Libere nas configurações do site para usar.'; }
        if (data.settings.notify && Notification.permission === 'granted') { return 'Ativadas. Você será avisado de prazos de hoje, amanhã e atrasados.'; }
        return 'Desativadas.';
    }

    function renderSettingsTab() {
        var hasKey = !!data.settings.apiKey;
        return '<h3 class="tools-h first">Lembretes de prazo</h3>' +
            '<p class="tools-note" id="notifyStatus">' + esc(notifyStatus()) + '</p>' +
            '<div class="tools-actions">' +
            (data.settings.notify
                ? '<button type="button" class="btn btn-ghost" data-tools="notif-off">Desativar</button>'
                : '<button type="button" class="btn btn-primary" data-tools="notif-on">Ativar notificações</button>') +
            '</div>' +
            '<p class="tools-note">Os avisos aparecem enquanto o MetaFlow estiver aberto em alguma aba. Ao abrir o app, um resumo dos prazos do dia aparece sempre.</p>' +
            '<h3 class="tools-h">Sugestões com IA (Anthropic)</h3>' +
            '<p class="tools-note">No cadastro de uma meta, o botão <strong>Sugerir com IA</strong> propõe descrição, subtarefas e etiquetas a partir do título. Cole abaixo uma chave de API da Anthropic. Ela fica salva só neste navegador e as chamadas vão direto dele para a Anthropic. Use uma chave com limite de gasto definido.</p>' +
            '<div class="field"><label for="apiKey">Chave de API</label>' +
            '<input type="password" id="apiKey" autocomplete="off" placeholder="' + (hasKey ? 'Chave salva (oculta). Cole outra para trocar.' : 'sk-ant-...') + '"></div>' +
            '<div class="field"><label for="apiModel">Modelo</label><select id="apiModel">' +
            [['claude-haiku-5-5', 'Claude Haiku 5.5 (rápido e barato)'], ['claude-sonnet-5-5', 'Claude Sonnet 5.5 (mais cuidadoso)']].map(function (m) {
                return '<option value="' + m[0] + '"' + (data.settings.model === m[0] ? ' selected' : '') + '>' + m[1] + '</option>';
            }).join('') + '</select></div>' +
            '<div class="tools-actions"><button type="button" class="btn btn-primary" data-tools="key-save">Salvar</button>' +
            (hasKey ? '<button type="button" class="btn btn-ghost" data-tools="key-clear">Remover chave</button>' : '') + '</div>' +
            '<h3 class="tools-h">Instalar como app</h3>' +
            '<p class="tools-note">' + (installEvent
                ? 'Seu navegador permite instalar o MetaFlow. Use o botão <strong>Instalar app</strong> no menu lateral.'
                : (/^https?:$/.test(location.protocol)
                    ? 'Se o navegador oferecer, aparece um botão <strong>Instalar app</strong> no menu lateral. Também funciona pelo menu do navegador.'
                    : 'Para instalar e usar offline, o MetaFlow precisa ser aberto por um endereço http (por exemplo, um servidor local ou uma hospedagem). Abrindo o arquivo direto do disco isso não fica disponível.')) +
            '</p>';
    }

    function askNotifyIfNeeded() { /* a permissão só é pedida em Lembretes e IA */ }

    function enableNotifications() {
        if (!('Notification' in window)) { App.toast('Este navegador não oferece notificações.', { error: true }); return; }
        var finished = false;
        var finish = function (perm) {
            if (finished) { return; }
            finished = true;
            data.settings.notify = perm === 'granted';
            saveData();
            if (perm !== 'granted') { App.toast('Permissão negada. Libere as notificações nas configurações do site.', { error: true }); }
            else { App.toast('Notificações ativadas'); checkReminders(false); }
            renderTab();
        };
        try {
            var r = Notification.requestPermission(finish);
            if (r && typeof r.then === 'function') { r.then(finish); }
        } catch (e) { App.toast('Não foi possível ativar as notificações.', { error: true }); }
    }

    function checkReminders(initial) {
        var t = today(), tomorrow = addDays(t, 1);
        var counts = { late: 0, today: 0, tomorrow: 0 };
        var pending = [];
        App.getGoals().forEach(function (g) {
            if (g.status === 'completed') { return; }
            var kind = g.deadline < t ? 'late' : (g.deadline === t ? 'today' : (g.deadline === tomorrow ? 'tomorrow' : null));
            if (!kind) { return; }
            counts[kind]++;
            var key = g.id + ':' + t + ':' + kind;
            if (!data.notified[key]) { pending.push({ g: g, kind: kind, key: key }); }
        });

        var canSystem = data.settings.notify && 'Notification' in window && Notification.permission === 'granted';
        if (canSystem && pending.length) {
            pending.forEach(function (p) {
                var title = p.kind === 'late' ? 'Atrasada: ' + p.g.title : (p.kind === 'today' ? 'Vence hoje: ' + p.g.title : 'Vence amanhã: ' + p.g.title);
                try { new Notification(title, { body: 'Prazo: ' + App.formatShort(p.g.deadline), icon: 'icons/icon-192.png' }); } catch (e) { /* ignora */ }
                data.notified[p.key] = 1;
            });
            Object.keys(data.notified).forEach(function (k) { if (k.indexOf(':' + t + ':') === -1) { delete data.notified[k]; } });
            saveData();
        }

        if (initial && data.summaryDay !== t && (counts.late || counts.today || counts.tomorrow)) {
            var parts = [];
            if (counts.today) { parts.push(plural(counts.today, 'vence hoje', 'vencem hoje')); }
            if (counts.late) { parts.push(plural(counts.late, 'atrasada', 'atrasadas')); }
            if (counts.tomorrow) { parts.push(plural(counts.tomorrow, 'vence amanhã', 'vencem amanhã')); }
            App.toast('Prazos: ' + parts.join(' · '));
            data.summaryDay = t;
            saveData();
        }
    }

    function saveKey() {
        var key = $('apiKey').value.trim();
        if (key) {
            if (!/^sk-ant-/.test(key)) { App.toast('Essa chave não parece ser da Anthropic (começa com sk-ant-).', { error: true }); return; }
            data.settings.apiKey = key;
        }
        data.settings.model = $('apiModel').value;
        saveData();
        App.toast(key ? 'Chave salva' : 'Modelo atualizado');
        renderTab();
    }

    function aiSuggest() {
        var button = $('aiBtn');
        var title = $('goalTitle').value.trim();
        if (!title) {
            App.toast('Escreva o título da meta primeiro.', { error: true });
            $('goalTitle').focus();
            return;
        }
        if (!data.settings.apiKey) {
            App.toast('Falta a chave da Anthropic.', { action: { label: 'Configurar', run: function () { openTools('settings'); } } });
            return;
        }
        var description = $('goalDescription').value.trim();
        var prompt = 'Você ajuda a planejar metas pessoais. Meta: "' + title + '"' + (description ? '. Detalhes: ' + description : '') +
            '. Responda SOMENTE com JSON válido, em português do Brasil, neste formato: ' +
            '{"descricao":"uma frase clara dizendo o que significa concluir a meta","subtarefas":["4 a 7 passos curtos e concretos, em ordem"],"etiquetas":["até 3 etiquetas curtas em minúsculas"]}';
        var original = button.textContent;
        button.disabled = true;
        button.textContent = 'Pensando...';

        fetch('https://api.anthropic.com/v1/messages', {
            method: 'POST',
            headers: {
                'content-type': 'application/json',
                'x-api-key': data.settings.apiKey,
                'anthropic-version': '2023-06-01',
                'anthropic-dangerous-direct-browser-access': 'true'
            },
            body: JSON.stringify({
                model: data.settings.model,
                max_tokens: 700,
                messages: [{ role: 'user', content: prompt }]
            })
        }).then(function (res) {
            return res.json().then(function (body) {
                if (!res.ok) {
                    var msg = body && body.error && body.error.message ? body.error.message : 'erro ' + res.status;
                    var e = new Error(res.status === 401 ? 'Chave inválida ou sem permissão.' : msg);
                    throw e;
                }
                return body;
            });
        }).then(function (body) {
            var text = (body.content || []).map(function (c) { return c.text || ''; }).join('');
            var a = text.indexOf('{'), b = text.lastIndexOf('}');
            if (a === -1 || b <= a) { throw new Error('A resposta veio em um formato inesperado. Tente de novo.'); }
            var out = JSON.parse(text.slice(a, b + 1));
            var added = 0;
            if (out.descricao && !$('goalDescription').value.trim()) { $('goalDescription').value = String(out.descricao).slice(0, 500); }
            if (Array.isArray(out.subtarefas)) {
                out.subtarefas.slice(0, 8).forEach(function (st) {
                    var text = String(st || '').trim();
                    if (text) { App.addSubtaskRow(text.slice(0, 160), false); added++; }
                });
            }
            if (Array.isArray(out.etiquetas) && !$('goalTags').value.trim()) { $('goalTags').value = out.etiquetas.slice(0, 3).join(', '); }
            App.toast(added ? 'Sugestões adicionadas. Revise antes de salvar.' : 'Nada novo para sugerir.');
        }).catch(function (err) {
            var msg = err && err.message ? err.message : 'falha de conexão';
            App.toast('Não consegui gerar sugestões: ' + msg, { error: true });
        }).then(function () {
            button.disabled = false;
            button.textContent = original;
        });
    }

    var installEvent = null;
    window.addEventListener('beforeinstallprompt', function (e) {
        e.preventDefault();
        installEvent = e;
        $('installBtn').hidden = false;
    });
    window.addEventListener('appinstalled', function () {
        installEvent = null;
        $('installBtn').hidden = true;
        App.toast('MetaFlow instalado');
    });

    /* ======================================================================
       Janela de ferramentas
       ====================================================================== */

    var TABS = [
        ['focus', 'Foco'], ['habits', 'Hábitos'], ['stats', 'Estatísticas'],
        ['achievements', 'Conquistas'], ['review', 'Semana'], ['settings', 'Lembretes e IA']
    ];
    var TITLES = {
        focus: 'Modo foco', habits: 'Hábitos', stats: 'Estatísticas',
        achievements: 'Conquistas e nível', review: 'Revisão da semana', settings: 'Lembretes e IA'
    };
    var currentTab = 'focus';

    function toolsOpen() { var d = $('toolsDialog'); return !!(d && d.open); }

    function renderTab() {
        var tabs = $('toolsTabs');
        tabs.innerHTML = TABS.map(function (t) {
            return '<button type="button" role="tab" class="tools-tab' + (t[0] === currentTab ? ' is-active' : '') + '" aria-selected="' + (t[0] === currentTab) + '" data-tools="tab" data-tab="' + t[0] + '">' + t[1] + '</button>';
        }).join('');
        $('toolsTitle').textContent = TITLES[currentTab];
        var renderers = { focus: renderFocusTab, habits: renderHabitsTab, stats: renderStatsTab, achievements: renderAchievementsTab, review: renderReviewTab, settings: renderSettingsTab };
        $('toolsBody').innerHTML = renderers[currentTab]();
        refreshChip();
    }

    function openTools(tab, goalId) {
        currentTab = tab || currentTab;
        if (currentTab === 'focus' && goalId && !timer.running) { timer.goalId = goalId; }
        var dialog = $('toolsDialog');
        renderTab();
        if (!dialog.open) {
            if (typeof dialog.showModal === 'function') { dialog.showModal(); } else { dialog.setAttribute('open', ''); }
        }
        refreshChip();
    }

    function closeTools() {
        var dialog = $('toolsDialog');
        if (typeof dialog.close === 'function') { dialog.close(); } else { dialog.removeAttribute('open'); }
        refreshChip();
    }

    window.MetaTools = { open: openTools, close: closeTools };

    /* ---------- Eventos ---------- */

    document.addEventListener('click', function (event) {
        var el = event.target.closest('[data-tools]');
        if (!el) {
            if (event.target === $('toolsDialog')) { closeTools(); }
            return;
        }
        var action = el.getAttribute('data-tools');
        var id = el.getAttribute('data-id');
        switch (action) {
            case 'close': closeTools(); break;
            case 'chip': openTools('focus'); break;
            case 'tab': currentTab = el.getAttribute('data-tab'); renderTab(); break;

            case 'cal-prev': cal.m--; if (cal.m < 0) { cal.m = 11; cal.y--; } renderCalendar(); break;
            case 'cal-next': cal.m++; if (cal.m > 11) { cal.m = 0; cal.y++; } renderCalendar(); break;
            case 'cal-today': var n = new Date(); cal.y = n.getFullYear(); cal.m = n.getMonth(); renderCalendar(); break;
            case 'cal-goal': App.openEdit(id); break;
            case 'cal-day': App.openNew(el.getAttribute('data-date')); break;

            case 'timer-start': timerStart(); renderTab(); break;
            case 'timer-pause': timerPause(); renderTab(); break;
            case 'timer-reset': timerReset(); renderTab(); break;
            case 'timer-mode': timerSetMode(el.getAttribute('data-mode')); renderTab(); break;

            case 'habit-add': addHabit(); break;
            case 'habit-day': toggleHabit(id, el.getAttribute('data-date')); break;
            case 'habit-del':
                data.habits = data.habits.filter(function (h) { return h.id !== id; });
                saveData();
                renderTab();
                App.render();
                break;

            case 'notif-on': enableNotifications(); break;
            case 'notif-off': data.settings.notify = false; saveData(); renderTab(); break;
            case 'key-save': saveKey(); break;
            case 'key-clear': data.settings.apiKey = ''; saveData(); App.toast('Chave removida'); renderTab(); break;
            case 'ai-suggest': aiSuggest(); break;
            case 'install':
                if (installEvent) {
                    installEvent.prompt();
                    installEvent = null;
                    $('installBtn').hidden = true;
                }
                break;
            default: break;
        }
    });

    document.addEventListener('change', function (event) {
        var t = event.target;
        if (t.id === 'timerGoal') { timer.goalId = t.value; }
        if (t.id === 'timerLen') {
            timer.focusMin = parseInt(t.value, 10) || 25;
            if (!timer.running && timer.mode === 'focus') { timer.left = timerTotal(); renderTab(); }
        }
    });

    document.addEventListener('input', function (event) {
        if (event.target.id === 'reviewNote') {
            data.reviews[weekKey()] = event.target.value;
            saveData();
        }
    });

    document.addEventListener('keydown', function (event) {
        if (event.key === 'Enter' && event.target.id === 'habitName') { event.preventDefault(); addHabit(); }
    });

    $('toolsDialog').addEventListener('close', refreshChip);

    function addHabit() {
        var input = $('habitName');
        var name = input.value.trim();
        if (!name) { input.focus(); return; }
        data.habits.push({ id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6), name: name.slice(0, 50), days: {}, createdAt: new Date().toISOString() });
        saveData();
        renderTab();
        $('habitName').focus();
    }

    function toggleHabit(id, date) {
        var h = data.habits.filter(function (x) { return x.id === id; })[0];
        if (!h) { return; }
        if (h.days[date]) { delete h.days[date]; } else { h.days[date] = 1; }
        saveData();
        renderTab();
        checkAchievements();
    }

    /* ---------- Integração com o app ---------- */

    App.onRender(function (view) {
        if (view === 'calendar') { renderCalendar(); }
        checkAchievements();
        if (toolsOpen() && currentTab !== 'focus' && currentTab !== 'settings' && currentTab !== 'review') { renderTab(); }
    });

    checkReminders(true);
    setInterval(function () { checkReminders(false); }, 60000);

    // Domingo: lembra da revisão semanal uma vez por dia.
    if (new Date().getDay() === 0 && data.lastReview !== today()) {
        data.lastReview = today();
        saveData();
        setTimeout(function () {
            App.toast('É domingo. Que tal revisar a semana?', { action: { label: 'Abrir', run: function () { openTools('review'); } } });
        }, 1500);
    }
})();
