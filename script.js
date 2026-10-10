/* MetaFlow — metas, subtarefas e prazos.
   Dados ficam no localStorage do navegador (chave "metaflow_goals"). */
(function () {
    'use strict';

    var STORE_KEY = window.MetaAuth ? MetaAuth.storeKey() : 'metaflow_goals';
    var THEME_KEY = 'metaflow_theme';
    var VIEW_KEY = 'metaflow_view';
    var SORT_KEY = 'metaflow_sort';
    var MAX_PINNED = 3;

    var STATUS_LABEL = { pending: 'Pendente', progress: 'Em progresso', completed: 'Concluída' };
    var PRIO_LABEL = { low: 'Baixa', medium: 'Média', high: 'Alta' };
    var PRIO_RANK = { high: 0, medium: 1, low: 2 };

    var ICONS = {
        plus: '<path d="M12 5v14M5 12h14"/>',
        moon: '<path d="M20 14.5A8 8 0 0 1 9.5 4 8 8 0 1 0 20 14.5z"/>',
        sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
        download: '<path d="M12 4v11M7 11l5 5 5-5M5 20h14"/>',
        upload: '<path d="M12 16V5M7 9l5-5 5 5M5 20h14"/>',
        search: '<circle cx="11" cy="11" r="6.5"/><path d="M16 16l4.5 4.5"/>',
        list: '<path d="M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01"/>',
        board: '<rect x="3" y="4" width="5" height="16" rx="1.5"/><rect x="10" y="4" width="5" height="10" rx="1.5"/><rect x="17" y="4" width="4" height="13" rx="1.5"/>',
        x: '<path d="M6 6l12 12M18 6L6 18"/>',
        star: '<path d="M12 3.5l2.6 5.4 5.9.8-4.3 4.1 1 5.9L12 16.9l-5.2 2.8 1-5.9L3.5 9.7l5.9-.8z"/>',
        edit: '<path d="M4 20h4L19 9l-4-4L4 16z"/><path d="M13.5 6.5l4 4"/>',
        trash: '<path d="M4 7h16M10 11v6M14 11v6M6 7l1 12h10l1-12M9 7V4h6v3"/>',
        chevl: '<path d="M15 5l-7 7 7 7"/>',
        chevr: '<path d="M9 5l7 7-7 7"/>',
        check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
        lock: '<rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>',
        circle: '<circle cx="12" cy="12" r="8"/>',
        half: '<circle cx="12" cy="12" r="8"/><path d="M12 4a8 8 0 0 1 0 16z" fill="currentColor"/>',
        clock: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>',
        flag: '<path d="M6 21V4M6 5h11l-2 4 2 4H6"/>',
        checkcircle: '<circle cx="12" cy="12" r="8.5"/><path d="M8.5 12.3l2.4 2.4 4.6-5"/>',
        timer: '<circle cx="12" cy="13.5" r="7"/><path d="M12 13.5V9.5M9.5 3.5h5"/>',
        repeat: '<path d="M4 12a6 6 0 0 1 6-6h8M15 3l3 3-3 3M20 12a6 6 0 0 1-6 6H6M9 21l-3-3 3-3"/>',
        chart: '<path d="M5 20V10M12 20V4M19 20v-7"/>',
        trophy: '<path d="M8 4h8v5a4 4 0 0 1-8 0zM8 6H5v1a3 3 0 0 0 3 3M16 6h3v1a3 3 0 0 1-3 3M12 13v4M8.5 20h7"/>',
        review: '<rect x="4" y="5" width="16" height="15" rx="2"/><path d="M4 10h16M9 15l2 2 4-4"/>',
        bell: '<path d="M6 17v-6a6 6 0 0 1 12 0v6l1.5 2h-15zM10 21h4"/>',
        play: '<path d="M7 4.5v15l12-7.5z"/>',
        logout: '<path d="M10 4H5v16h5M15 8l4 4-4 4M19 12H9"/>',
        calendar: '<rect x="4" y="5" width="16" height="15" rx="2"/><path d="M4 10h16M9 3v4M15 3v4"/>'
    };

    function icon(name) {
        return '<svg data-icon-svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
            (ICONS[name] || '') + '</svg>';
    }

    function hydrateIcons(root) {
        var nodes = (root || document).querySelectorAll('[data-icon]');
        for (var i = 0; i < nodes.length; i++) {
            nodes[i].innerHTML = icon(nodes[i].getAttribute('data-icon'));
            nodes[i].style.display = 'inline-flex';
        }
    }

    /* ---------- Estado ---------- */

    var goals = [];
    var state = {
        filter: 'all',
        category: '',
        query: '',
        sort: 'deadline',
        view: 'list',
        editingId: null
    };
    var openSubtasks = {};
    var snapshot = null;
    var lastSpawn = null;
    var renderHooks = [];

    var $ = function (id) { return document.getElementById(id); };

    /* ---------- Utilitários ---------- */

    function esc(value) {
        return String(value == null ? '' : value)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    function pad(n) { return n < 10 ? '0' + n : '' + n; }

    function isoOf(date) {
        return date.getFullYear() + '-' + pad(date.getMonth() + 1) + '-' + pad(date.getDate());
    }

    function todayISO() { return isoOf(new Date()); }

    function dayNumber(iso) {
        var p = String(iso).split('-');
        return Math.round(Date.UTC(+p[0], +p[1] - 1, +p[2]) / 86400000);
    }

    function daysFromToday(iso) { return dayNumber(iso) - dayNumber(todayISO()); }

    function formatShort(iso) {
        var p = String(iso).split('-');
        var months = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
        return +p[2] + ' ' + months[+p[1] - 1];
    }

    function newId() {
        return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
    }

    function hueOf(text) {
        var h = 0;
        for (var i = 0; i < text.length; i++) { h = (h * 31 + text.charCodeAt(i)) % 360; }
        return h;
    }

    function plural(n, one, many) { return n + ' ' + (n === 1 ? one : many); }

    /* ---------- Persistência ---------- */

    var RECURRENCE_LABEL = { daily: 'Todo dia', weekly: 'Toda semana', monthly: 'Todo mês' };

    function cleanLinks(value) {
        var list = Array.isArray(value) ? value : String(value || '').split(/\r?\n/);
        var out = [];
        list.forEach(function (item) {
            var url = String(item || '').trim();
            if (!url) { return; }
            if (!/^https?:\/\//i.test(url)) { url = 'https://' + url; }
            try { url = new URL(url).href; } catch (e) { return; }
            if (out.indexOf(url) === -1 && out.length < 10) { out.push(url); }
        });
        return out;
    }

    function cleanTags(value) {
        var list = Array.isArray(value) ? value : String(value || '').split(/[,;]/);
        var out = [];
        list.forEach(function (item) {
            var tag = String(item || '').trim().replace(/^#/, '').toLowerCase().slice(0, 24);
            if (tag && out.indexOf(tag) === -1 && out.length < 8) { out.push(tag); }
        });
        return out;
    }

    function normalize(raw) {
        if (!raw || typeof raw !== 'object') { return null; }
        var title = String(raw.title || '').trim();
        if (!title) { return null; }
        var now = new Date().toISOString();
        var deadline = /^\d{4}-\d{2}-\d{2}$/.test(raw.deadline) ? raw.deadline : todayISO();
        var status = STATUS_LABEL[raw.status] ? raw.status : 'pending';
        var subtasks = [];
        if (Array.isArray(raw.subtasks)) {
            raw.subtasks.forEach(function (s) {
                var text = String(s && s.text != null ? s.text : '').trim();
                if (text) { subtasks.push({ text: text.slice(0, 160), completed: !!(s && s.completed) }); }
            });
        }
        return {
            id: String(raw.id || newId()),
            title: title.slice(0, 120),
            description: String(raw.description || '').slice(0, 500),
            deadline: deadline,
            priority: PRIO_LABEL[raw.priority] ? raw.priority : 'medium',
            status: status,
            category: String(raw.category || '').trim().slice(0, 30),
            pinned: !!raw.pinned,
            recurrence: RECURRENCE_LABEL[raw.recurrence] ? raw.recurrence : '',
            notes: String(raw.notes || '').slice(0, 2000),
            links: cleanLinks(raw.links),
            tags: cleanTags(raw.tags),
            parentId: String(raw.parentId || ''),
            focusMinutes: Math.max(0, Math.round(+raw.focusMinutes || 0)),
            subtasks: subtasks,
            createdAt: raw.createdAt || now,
            updatedAt: raw.updatedAt || raw.createdAt || now,
            completedAt: status === 'completed' ? (raw.completedAt || raw.updatedAt || now) : null
        };
    }

    function load() {
        try {
            var text = localStorage.getItem(STORE_KEY);
            var parsed = text ? JSON.parse(text) : [];
            if (!Array.isArray(parsed)) { parsed = []; }
            goals = parsed.map(normalize).filter(Boolean);
        } catch (e) {
            goals = [];
            toast('Não consegui ler suas metas salvas. Restaure um backup se tiver um.', { error: true });
        }
    }

    function save() {
        try {
            localStorage.setItem(STORE_KEY, JSON.stringify(goals));
        } catch (e) {
            toast('Não foi possível salvar. O armazenamento do navegador está cheio ou bloqueado.', { error: true });
        }
    }

    function takeSnapshot() { snapshot = JSON.stringify(goals); }

    function restoreSnapshot() {
        if (!snapshot) { return; }
        try { goals = JSON.parse(snapshot).map(normalize).filter(Boolean); } catch (e) { return; }
        snapshot = null;
        save();
        render();
    }

    /* ---------- Regras ---------- */

    function findGoal(id) {
        for (var i = 0; i < goals.length; i++) { if (goals[i].id === id) { return goals[i]; } }
        return null;
    }

    function isOverdue(g) { return g.status !== 'completed' && g.deadline < todayISO(); }

    function childrenOf(g) {
        return goals.filter(function (x) { return x.parentId === g.id; });
    }

    function goalProgress(g, depth) {
        if (g.status === 'completed') { return 100; }
        var kids = (depth || 0) < 3 ? childrenOf(g) : [];
        if (g.subtasks.length || kids.length) {
            var sum = 0;
            g.subtasks.forEach(function (s) { sum += s.completed ? 1 : 0; });
            kids.forEach(function (k) { sum += goalProgress(k, (depth || 0) + 1) / 100; });
            return Math.round((sum / (g.subtasks.length + kids.length)) * 100);
        }
        return g.status === 'progress' ? 50 : 0;
    }

    function addPeriod(iso, recurrence) {
        var p = iso.split('-');
        var d = new Date(+p[0], +p[1] - 1, +p[2], 12);
        if (recurrence === 'daily') { d.setDate(d.getDate() + 1); }
        else if (recurrence === 'weekly') { d.setDate(d.getDate() + 7); }
        else {
            var day = d.getDate();
            d.setDate(1);
            d.setMonth(d.getMonth() + 1);
            var last = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
            d.setDate(Math.min(day, last));
        }
        return isoOf(d);
    }

    // Ao concluir uma meta recorrente, cria a próxima ocorrência (sempre no futuro).
    function spawnNext(g) {
        if (!g.recurrence) { return null; }
        var next = addPeriod(g.deadline, g.recurrence);
        var guard = 0;
        while (next <= todayISO() && guard++ < 400) { next = addPeriod(next, g.recurrence); }
        var now = new Date().toISOString();
        var copy = normalize({
            id: newId(), title: g.title, description: g.description, deadline: next,
            priority: g.priority, status: 'pending', category: g.category, pinned: false,
            recurrence: g.recurrence, notes: g.notes, links: g.links, tags: g.tags,
            parentId: g.parentId, createdAt: now, updatedAt: now,
            subtasks: g.subtasks.map(function (s) { return { text: s.text, completed: false }; })
        });
        goals.push(copy);
        g.recurrence = '';
        return copy;
    }

    function setStatus(g, status) {
        if (g.status === status) { return false; }
        var wasDone = g.status === 'completed';
        g.status = status;
        g.updatedAt = new Date().toISOString();
        if (status === 'completed') {
            g.completedAt = g.updatedAt;
            g.subtasks.forEach(function (s) { s.completed = true; });
            g.pinned = false;
            lastSpawn = spawnNext(g);
        } else {
            g.completedAt = null;
            if (wasDone && g.subtasks.length) {
                g.subtasks[g.subtasks.length - 1].completed = false;
            }
        }
        return status === 'completed';
    }

    function matchesFilter(g) {
        switch (state.filter) {
            case 'pending': return g.status === 'pending';
            case 'progress': return g.status === 'progress';
            case 'completed': return g.status === 'completed';
            case 'overdue': return isOverdue(g);
            case 'high': return g.priority === 'high' && g.status !== 'completed';
            default: return true;
        }
    }

    function matchesQuery(g) {
        if (!state.query) { return true; }
        var hay = (g.title + ' ' + g.description + ' ' + g.category + ' ' +
            g.subtasks.map(function (s) { return s.text; }).join(' ') + ' ' + g.tags.join(' ') + ' ' + g.notes).toLowerCase();
        return hay.indexOf(state.query) !== -1;
    }

    function visibleGoals() {
        var list = goals.filter(function (g) {
            return matchesFilter(g) && matchesQuery(g) && (!state.category || g.category === state.category);
        });
        list.sort(function (a, b) {
            if (state.sort === 'recent') { return a.createdAt < b.createdAt ? 1 : -1; }
            var doneA = a.status === 'completed' ? 1 : 0;
            var doneB = b.status === 'completed' ? 1 : 0;
            if (doneA !== doneB) { return doneA - doneB; }
            if (state.sort === 'priority') {
                if (PRIO_RANK[a.priority] !== PRIO_RANK[b.priority]) { return PRIO_RANK[a.priority] - PRIO_RANK[b.priority]; }
            }
            if (a.deadline !== b.deadline) { return a.deadline < b.deadline ? -1 : 1; }
            return PRIO_RANK[a.priority] - PRIO_RANK[b.priority];
        });
        return list;
    }

    /* ---------- Renderização ---------- */

    function dueInfo(g) {
        var d = daysFromToday(g.deadline);
        var text, cls = '';
        if (g.status === 'completed') {
            text = 'Concluída';
            cls = 'is-done';
        } else if (d < 0) {
            text = 'Atrasada há ' + plural(-d, 'dia', 'dias');
            cls = 'is-late';
        } else if (d === 0) {
            text = 'Vence hoje';
            cls = 'is-soon';
        } else if (d === 1) {
            text = 'Vence amanhã';
            cls = 'is-soon';
        } else if (d <= 3) {
            text = 'Vence em ' + d + ' dias';
            cls = 'is-soon';
        } else {
            text = formatShort(g.deadline);
        }
        return { text: text, cls: cls };
    }

    function categoryChip(g) {
        if (!g.category) { return '<span></span>'; }
        return '<span class="chip chip-cat" style="--h:' + hueOf(g.category) + '">' + esc(g.category) + '</span>';
    }

    function cardTools(g) {
        var pinOn = g.pinned ? ' is-on' : '';
        return '<div class="card-tools">' +
            (g.status !== 'completed'
                ? '<button type="button" class="icon-btn' + pinOn + '" data-action="pin" data-id="' + esc(g.id) + '" aria-pressed="' + g.pinned + '" aria-label="' + (g.pinned ? 'Tirar do foco do dia' : 'Fixar no foco do dia') + '">' + icon('star') + '</button>'
                : '') +
            '<button type="button" class="icon-btn" data-action="edit" data-id="' + esc(g.id) + '" aria-label="Editar meta">' + icon('edit') + '</button>' +
            '<button type="button" class="icon-btn icon-btn-danger" data-action="delete" data-id="' + esc(g.id) + '" aria-label="Excluir meta">' + icon('trash') + '</button>' +
            '</div>';
    }

    function cardClasses(g, extra) {
        return 'card prio-' + g.priority + ' st-' + g.status + (extra ? ' ' + extra : '');
    }

    function meterHtml(g) {
        var p = goalProgress(g);
        var label = g.subtasks.length
            ? g.subtasks.filter(function (s) { return s.completed; }).length + ' de ' + g.subtasks.length + ' subtarefas'
            : STATUS_LABEL[g.status];
        return '<div class="meter" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="' + p + '" aria-label="Progresso da meta"><span style="width:' + p + '%"></span></div>' +
            '<div class="meter-label"><span>' + esc(label) + '</span><strong>' + p + '%</strong></div>';
    }

    function compactCard(g, draggable) {
        var due = dueInfo(g);
        return '<article class="' + cardClasses(g, 'is-compact') + '" data-id="' + esc(g.id) + '"' + (draggable ? ' draggable="true"' : '') + '>' +
            '<div class="card-top">' + categoryChip(g) + cardTools(g) + '</div>' +
            '<h3 class="card-title">' + esc(g.title) + '</h3>' +
            '<div class="card-meta"><span class="due ' + due.cls + '">' + icon('calendar') + esc(due.text) + '</span></div>' +
            meterHtml(g) +
            '</article>';
    }

    function fullCard(g) {
        var due = dueInfo(g);
        var id = esc(g.id);
        var subs = '';
        if (g.subtasks.length) {
            var done = g.subtasks.filter(function (s) { return s.completed; }).length;
            subs = '<details class="subtasks" data-id="' + id + '"' + (openSubtasks[g.id] ? ' open' : '') + '>' +
                '<summary>Subtarefas<span>' + done + '/' + g.subtasks.length + '</span></summary><ul>' +
                g.subtasks.map(function (s, i) {
                    return '<li><label class="check"><input type="checkbox" data-action="toggle-sub" data-id="' + id + '" data-index="' + i + '"' + (s.completed ? ' checked' : '') + '>' +
                        '<span class="check-box"></span><span class="check-text">' + esc(s.text) + '</span></label></li>';
                }).join('') +
                '</ul><div class="subtask-add" data-id="' + id + '"><input type="text" maxlength="160" placeholder="Nova subtarefa" aria-label="Nova subtarefa" data-sub-input="' + id + '">' +
                '<button type="button" class="btn btn-ghost btn-sm" data-action="add-sub" data-id="' + id + '">Adicionar</button></div></details>';
        } else if (g.status !== 'completed') {
            subs = '<details class="subtasks" data-id="' + id + '"' + (openSubtasks[g.id] ? ' open' : '') + '>' +
                '<summary>Subtarefas<span>nenhuma</span></summary>' +
                '<div class="subtask-add" data-id="' + id + '"><input type="text" maxlength="160" placeholder="Quebre a meta em passos" aria-label="Nova subtarefa" data-sub-input="' + id + '">' +
                '<button type="button" class="btn btn-ghost btn-sm" data-action="add-sub" data-id="' + id + '">Adicionar</button></div></details>';
        }

        var foot = '';
        if (g.status === 'pending') {
            foot += '<button type="button" class="btn btn-ghost btn-sm" data-action="start" data-id="' + id + '">Iniciar</button>';
        }
        if (g.status !== 'completed') {
            foot += '<button type="button" class="btn btn-done btn-sm" data-action="complete" data-id="' + id + '">Concluir</button>';
        } else {
            foot += '<button type="button" class="btn btn-ghost btn-sm" data-action="reopen" data-id="' + id + '">Reabrir</button>';
        }

        var parent = g.parentId ? findGoal(g.parentId) : null;
        var kids = childrenOf(g);
        var extraMeta = '';
        if (g.recurrence) { extraMeta += '<span class="prio-tag">Repete: ' + RECURRENCE_LABEL[g.recurrence].toLowerCase() + '</span>'; }
        if (kids.length) { extraMeta += '<span class="prio-tag">' + plural(kids.length, 'sub-meta', 'sub-metas') + '</span>'; }
        if (g.focusMinutes) { extraMeta += '<span class="prio-tag">' + g.focusMinutes + ' min de foco</span>'; }

        var tagsHtml = g.tags.length
            ? '<div class="tags">' + g.tags.map(function (t) {
                return '<button type="button" class="tag" data-action="tag" data-tag="' + esc(t) + '">#' + esc(t) + '</button>';
            }).join('') + '</div>'
            : '';

        var notesHtml = '';
        if (g.notes || g.links.length) {
            notesHtml = '<details class="notes-box"><summary>Notas e links</summary>' +
                (g.notes ? '<p class="notes-text">' + esc(g.notes) + '</p>' : '') +
                (g.links.length ? '<ul class="links">' + g.links.map(function (u) {
                    return '<li><a href="' + esc(u) + '" target="_blank" rel="noopener noreferrer">' + esc(u.replace(/^https?:\/\/(www\.)?/, '')) + '</a></li>';
                }).join('') + '</ul>' : '') +
                '</details>';
        }

        if (g.status !== 'completed') {
            foot += '<button type="button" class="btn btn-ghost btn-sm" data-action="focus" data-id="' + id + '">' + icon('play') + 'Focar</button>';
        }

        return '<article class="' + cardClasses(g) + '" data-id="' + id + '">' +
            '<div class="card-top">' + categoryChip(g) + cardTools(g) + '</div>' +
            (parent ? '<p class="card-parent">Dentro de <strong>' + esc(parent.title) + '</strong></p>' : '') +
            '<h3 class="card-title">' + esc(g.title) + '</h3>' +
            (g.description ? '<p class="card-desc">' + esc(g.description) + '</p>' : '') +
            tagsHtml +
            '<div class="card-meta"><span class="due ' + due.cls + '">' + icon('calendar') + esc(due.text) + '</span>' +
            '<span class="prio-tag prio-label">Prioridade ' + PRIO_LABEL[g.priority].toLowerCase() + '</span>' + extraMeta + '</div>' +
            meterHtml(g) + subs + notesHtml +
            '<div class="card-foot">' + foot + '</div>' +
            '</article>';
    }

    function renderCounts() {
        var counts = {
            all: goals.length,
            pending: 0, progress: 0, completed: 0, overdue: 0, high: 0
        };
        goals.forEach(function (g) {
            counts[g.status]++;
            if (isOverdue(g)) { counts.overdue++; }
            if (g.priority === 'high' && g.status !== 'completed') { counts.high++; }
        });
        var nodes = document.querySelectorAll('[data-count]');
        for (var i = 0; i < nodes.length; i++) {
            var key = nodes[i].getAttribute('data-count');
            nodes[i].textContent = counts[key] || 0;
            if (key === 'overdue') { nodes[i].classList.toggle('has-items', counts.overdue > 0); }
        }
        var items = document.querySelectorAll('#statusNav .nav-item');
        for (var j = 0; j < items.length; j++) {
            items[j].classList.toggle('is-active', items[j].getAttribute('data-filter') === state.filter);
        }
    }

    function renderCategories() {
        var map = {};
        goals.forEach(function (g) { if (g.category) { map[g.category] = (map[g.category] || 0) + 1; } });
        var names = Object.keys(map).sort(function (a, b) { return a.localeCompare(b, 'pt-BR'); });
        if (state.category && !map[state.category]) { state.category = ''; }
        $('categoryBlock').hidden = names.length === 0;
        $('categoryList').innerHTML = names.map(function (name) {
            return '<button type="button" class="nav-item' + (state.category === name ? ' is-active' : '') + '" data-action="category" data-category="' + esc(name) + '">' +
                '<span class="cat-name"><span class="cat-dot" style="--h:' + hueOf(name) + '"></span>' + esc(name) + '</span>' +
                '<span class="count">' + map[name] + '</span></button>';
        }).join('');
        $('categoryOptions').innerHTML = names.map(function (name) {
            return '<option value="' + esc(name) + '"></option>';
        }).join('');
    }

    function lastSevenDays() {
        var days = [];
        var base = new Date();
        base.setHours(12, 0, 0, 0);
        for (var i = 6; i >= 0; i--) {
            var d = new Date(base.getTime() - i * 86400000);
            days.push({ iso: isoOf(d), label: ['D', 'S', 'T', 'Q', 'Q', 'S', 'S'][d.getDay()], count: 0 });
        }
        goals.forEach(function (g) {
            if (g.completedAt) {
                var iso = isoOf(new Date(g.completedAt));
                days.forEach(function (day) { if (day.iso === iso) { day.count++; } });
            }
        });
        return days;
    }

    function streak() {
        var set = {};
        goals.forEach(function (g) { if (g.completedAt) { set[isoOf(new Date(g.completedAt))] = true; } });
        var d = new Date();
        d.setHours(12, 0, 0, 0);
        if (!set[isoOf(d)]) { d = new Date(d.getTime() - 86400000); }
        var n = 0;
        while (set[isoOf(d)]) { n++; d = new Date(d.getTime() - 86400000); }
        return n;
    }

    function renderFlow() {
        var days = lastSevenDays();
        var max = Math.max.apply(null, days.map(function (d) { return d.count; }).concat([1]));
        var w = 300, left = 12, step = (w - left * 2) / 6, base = 62, top = 14;
        var pts = days.map(function (d, i) {
            return { x: left + i * step, y: base - (d.count / max) * (base - top), d: d };
        });
        var line = pts.map(function (p, i) {
            if (i === 0) { return 'M' + p.x.toFixed(1) + ' ' + p.y.toFixed(1); }
            var prev = pts[i - 1];
            var mx = ((prev.x + p.x) / 2).toFixed(1);
            return 'C' + mx + ' ' + prev.y.toFixed(1) + ' ' + mx + ' ' + p.y.toFixed(1) + ' ' + p.x.toFixed(1) + ' ' + p.y.toFixed(1);
        }).join(' ');
        var area = line + ' L' + pts[6].x.toFixed(1) + ' ' + base + ' L' + pts[0].x.toFixed(1) + ' ' + base + ' Z';
        var total = days.reduce(function (s, d) { return s + d.count; }, 0);

        $('flowChart').innerHTML =
            '<svg viewBox="0 0 ' + w + ' 90" role="img" aria-label="Metas concluídas nos últimos 7 dias: ' + total + '">' +
            '<path class="flow-area" d="' + area + '"/>' +
            '<path class="flow-line" pathLength="1" d="' + line + '"/>' +
            pts.map(function (p, i) {
                return '<circle class="flow-dot' + (i === 6 ? ' is-today' : '') + '" cx="' + p.x.toFixed(1) + '" cy="' + p.y.toFixed(1) + '" r="' + (i === 6 ? 5 : 3.5) + '"><title>' + p.d.count + ' concluída(s)</title></circle>' +
                    '<text class="flow-day" x="' + p.x.toFixed(1) + '" y="84">' + p.d.label + '</text>';
            }).join('') +
            '</svg>';

        var s = streak();
        var text = total === 0
            ? 'Nenhuma meta concluída nesta semana ainda.'
            : plural(total, 'meta concluída', 'metas concluídas') + ' nos últimos 7 dias';
        if (s >= 2) { text += ' · sequência de ' + s + ' dias'; }
        $('streakText').textContent = text;
    }

    function renderHero() {
        var now = new Date();
        $('heroDate').textContent = now.toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' });

        var open = goals.filter(function (g) { return g.status !== 'completed'; });
        var overdue = goals.filter(isOverdue).length;
        var today = open.filter(function (g) { return g.deadline === todayISO(); }).length;
        var title, sub;

        if (!goals.length) {
            title = 'Comece pela primeira meta';
            sub = 'Defina um objetivo, um prazo e os passos para chegar lá.';
        } else if (!open.length) {
            title = 'Tudo concluído. Que tal a próxima meta?';
            sub = 'Você fechou ' + plural(goals.length, 'meta', 'metas') + '.';
        } else if (overdue) {
            title = plural(overdue, 'meta atrasada pede', 'metas atrasadas pedem') + ' atenção';
            sub = 'Reveja os prazos ou conclua o que já está pronto.';
        } else if (today) {
            title = plural(today, 'meta vence', 'metas vencem') + ' hoje';
            sub = 'Depois dela, ainda restam ' + plural(open.length - today, 'meta aberta', 'metas abertas') + '.';
        } else {
            title = plural(open.length, 'meta em andamento', 'metas em andamento');
            sub = 'Nada atrasado. Continue no ritmo.';
        }
        $('heroTitle').textContent = title;
        $('heroSub').textContent = sub;

        var overall = goals.length
            ? Math.round(goals.reduce(function (s, g) { return s + goalProgress(g); }, 0) / goals.length)
            : 0;
        $('ringValue').textContent = overall + '%';
        $('ring').setAttribute('aria-label', 'Progresso geral: ' + overall + '%');
        $('ringFill').style.strokeDashoffset = String(314.16 * (1 - overall / 100));
    }

    function renderFocus() {
        var pinned = goals.filter(function (g) { return g.pinned && g.status !== 'completed'; }).slice(0, MAX_PINNED);
        $('focusList').innerHTML = pinned.length
            ? pinned.map(function (g) { return compactCard(g, false); }).join('')
            : '<div class="focus-empty">Nenhuma meta fixada. Toque na estrela de uma meta para trazê-la para cá.</div>';
    }

    function renderEmpty(list) {
        var el = $('emptyState');
        if (list.length) { el.hidden = true; return; }
        el.hidden = false;
        if (!goals.length) {
            el.innerHTML = '<h2>Sua lista está vazia</h2><p>Crie uma meta com prazo e subtarefas. O resumo no topo se atualiza sozinho.</p>' +
                '<button type="button" class="btn btn-primary" data-action="new">' + icon('plus') + 'Criar primeira meta</button>';
        } else {
            el.innerHTML = '<h2>Nada por aqui</h2><p>Nenhuma meta corresponde aos filtros atuais.</p>' +
                '<button type="button" class="btn btn-ghost" data-action="clear-filters">Limpar filtros</button>';
        }
    }

    function renderGoals() {
        var list = visibleGoals();
        var isBoard = state.view === 'board';
        var isCal = state.view === 'calendar';
        $('goalsContainer').hidden = isBoard || isCal;
        $('boardContainer').hidden = !isBoard;
        $('calendarContainer').hidden = !isCal;

        if (isBoard) {
            var groups = { pending: [], progress: [], completed: [] };
            list.forEach(function (g) { groups[g.status].push(g); });
            var map = { pending: ['boardPending', 'boardCountPending'], progress: ['boardProgress', 'boardCountProgress'], completed: ['boardCompleted', 'boardCountCompleted'] };
            Object.keys(map).forEach(function (key) {
                $(map[key][0]).innerHTML = groups[key].length
                    ? groups[key].map(function (g) { return compactCard(g, true); }).join('')
                    : '<div class="board-empty">Arraste uma meta para cá</div>';
                $(map[key][1]).textContent = groups[key].length;
            });
        } else if (!isCal) {
            $('goalsContainer').innerHTML = list.map(fullCard).join('');
        }
        renderEmpty(isCal ? [1] : list);

        var segs = document.querySelectorAll('.seg-btn');
        for (var i = 0; i < segs.length; i++) {
            var on = segs[i].getAttribute('data-view') === state.view;
            segs[i].classList.toggle('is-active', on);
            segs[i].setAttribute('aria-pressed', String(on));
        }
        renderHooks.forEach(function (fn) { try { fn(state.view); } catch (e) { /* módulo extra não deve derrubar o app */ } });
    }

    function render() {
        renderCounts();
        renderCategories();
        renderHero();
        renderFlow();
        renderFocus();
        renderGoals();
    }

    /* ---------- Avisos e confete ---------- */

    function toast(message, options) {
        options = options || {};
        var box = $('toasts');
        var el = document.createElement('div');
        el.className = 'toast' + (options.error ? ' is-error' : '');
        var span = document.createElement('span');
        span.textContent = message;
        el.appendChild(span);
        var timer;
        function remove() { clearTimeout(timer); if (el.parentNode) { el.parentNode.removeChild(el); } }
        if (options.action) {
            var btn = document.createElement('button');
            btn.type = 'button';
            btn.textContent = options.action.label;
            btn.addEventListener('click', function () { options.action.run(); remove(); });
            el.appendChild(btn);
        }
        box.appendChild(el);
        // Mantém os avisos acima de janelas abertas (diálogos ficam na camada superior).
        try {
            if (box.showPopover) {
                if (box.matches(':popover-open')) { box.hidePopover(); }
                box.showPopover();
            }
        } catch (e) { /* sem suporte */ }
        timer = setTimeout(remove, options.action ? 7000 : 4000);
    }

    function confetti() {
        if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) { return; }
        var canvas = $('confetti');
        var ctx = canvas.getContext('2d');
        if (!ctx) { return; }
        canvas.width = window.innerWidth;
        canvas.height = window.innerHeight;
        var colors = ['#3150ff', '#c8f169', '#ff6b57', '#f2b45a', '#7c90ff'];
        var pieces = [];
        for (var i = 0; i < 110; i++) {
            pieces.push({
                x: canvas.width / 2 + (Math.random() - 0.5) * 160,
                y: canvas.height * 0.4,
                vx: (Math.random() - 0.5) * 14,
                vy: -Math.random() * 13 - 3,
                size: 5 + Math.random() * 6,
                rot: Math.random() * 6,
                vr: (Math.random() - 0.5) * 0.4,
                color: colors[i % colors.length]
            });
        }
        var frames = 0;
        (function tick() {
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            pieces.forEach(function (p) {
                p.vy += 0.35;
                p.x += p.vx;
                p.y += p.vy;
                p.rot += p.vr;
                ctx.save();
                ctx.translate(p.x, p.y);
                ctx.rotate(p.rot);
                ctx.fillStyle = p.color;
                ctx.globalAlpha = Math.max(0, 1 - frames / 110);
                ctx.fillRect(-p.size / 2, -p.size / 4, p.size, p.size / 2);
                ctx.restore();
            });
            frames++;
            if (frames < 110) { requestAnimationFrame(tick); } else { ctx.clearRect(0, 0, canvas.width, canvas.height); }
        })();
    }

    /* ---------- Janela de cadastro ---------- */

    function addSubtaskRow(text, completed) {
        var row = document.createElement('div');
        row.className = 'subtask-row';
        row.setAttribute('data-completed', completed ? '1' : '0');
        var input = document.createElement('input');
        input.type = 'text';
        input.maxLength = 160;
        input.placeholder = 'Descreva o passo';
        input.setAttribute('aria-label', 'Subtarefa');
        input.value = text || '';
        var remove = document.createElement('button');
        remove.type = 'button';
        remove.className = 'icon-btn icon-btn-danger';
        remove.setAttribute('data-action', 'remove-subtask-row');
        remove.setAttribute('aria-label', 'Remover subtarefa');
        remove.innerHTML = icon('x');
        row.appendChild(input);
        row.appendChild(remove);
        $('subtaskRows').appendChild(row);
        return input;
    }

    function clearErrors() {
        ['titleError', 'deadlineError'].forEach(function (id) { $(id).hidden = true; });
        ['goalTitle', 'goalDeadline'].forEach(function (id) { $(id).classList.remove('is-invalid'); });
    }

    function openDialog(id, preset) {
        var g = id ? findGoal(id) : null;
        state.editingId = g ? g.id : null;
        clearErrors();
        $('dialogTitle').textContent = g ? 'Editar meta' : 'Nova meta';
        $('saveBtn').textContent = g ? 'Salvar alterações' : 'Salvar meta';
        $('goalTitle').value = g ? g.title : '';
        $('goalDescription').value = g ? g.description : '';
        $('goalDeadline').value = g ? g.deadline : ((preset && preset.deadline) || isoOf(new Date(Date.now() + 7 * 86400000)));
        $('goalRecurrence').value = g ? g.recurrence : '';
        $('goalTags').value = g ? g.tags.join(', ') : '';
        $('goalNotes').value = g ? g.notes : '';
        $('goalLinks').value = g ? g.links.join('\n') : '';
        fillParentOptions(g);
        $('goalCategory').value = g ? g.category : '';
        $('goalStatus').value = g ? g.status : 'pending';
        var prio = g ? g.priority : 'medium';
        var radios = document.querySelectorAll('input[name="priority"]');
        for (var i = 0; i < radios.length; i++) { radios[i].checked = radios[i].value === prio; }
        $('subtaskRows').innerHTML = '';
        if (g) { g.subtasks.forEach(function (s) { addSubtaskRow(s.text, s.completed); }); }
        var dialog = $('goalDialog');
        if (typeof dialog.showModal === 'function') { dialog.showModal(); } else { dialog.setAttribute('open', ''); }
        $('goalTitle').focus();
    }

    function fillParentOptions(g) {
        var select = $('goalParent');
        var hasKids = g && childrenOf(g).length > 0;
        var options = ['<option value="">Nenhuma (meta principal)</option>'];
        goals.forEach(function (x) {
            if (x.parentId || (g && x.id === g.id)) { return; }
            options.push('<option value="' + esc(x.id) + '">' + esc(x.title) + '</option>');
        });
        select.innerHTML = options.join('');
        select.value = g && g.parentId && findGoal(g.parentId) ? g.parentId : '';
        select.disabled = !!hasKids;
        select.title = hasKids ? 'Esta meta tem sub-metas, então não pode ficar dentro de outra.' : '';
    }

    function closeDialog() {
        var dialog = $('goalDialog');
        if (typeof dialog.close === 'function') { dialog.close(); } else { dialog.removeAttribute('open'); }
    }

    function submitForm(event) {
        event.preventDefault();
        clearErrors();
        var title = $('goalTitle').value.trim();
        var deadline = $('goalDeadline').value;
        var bad = false;

        if (!title) {
            $('titleError').hidden = false;
            $('goalTitle').classList.add('is-invalid');
            $('goalTitle').focus();
            bad = true;
        }
        if (!deadline) {
            $('deadlineError').textContent = 'Escolha um prazo.';
            $('deadlineError').hidden = false;
            $('goalDeadline').classList.add('is-invalid');
            if (!bad) { $('goalDeadline').focus(); }
            bad = true;
        }
        if (bad) { return; }

        var subtasks = [];
        var rows = $('subtaskRows').querySelectorAll('.subtask-row');
        for (var i = 0; i < rows.length; i++) {
            var text = rows[i].querySelector('input').value.trim();
            if (text) { subtasks.push({ text: text, completed: rows[i].getAttribute('data-completed') === '1' }); }
        }

        var prio = document.querySelector('input[name="priority"]:checked');
        var status = $('goalStatus').value;
        var now = new Date().toISOString();
        var existing = state.editingId ? findGoal(state.editingId) : null;
        var justCompleted = false;

        takeSnapshot();
        if (existing) {
            existing.title = title;
            existing.description = $('goalDescription').value.trim();
            existing.deadline = deadline;
            existing.category = $('goalCategory').value.trim();
            existing.priority = prio ? prio.value : 'medium';
            existing.recurrence = $('goalRecurrence').value;
            existing.tags = cleanTags($('goalTags').value);
            existing.notes = $('goalNotes').value.trim().slice(0, 2000);
            existing.links = cleanLinks($('goalLinks').value);
            if (!$('goalParent').disabled) { existing.parentId = $('goalParent').value; }
            existing.subtasks = subtasks;
            justCompleted = setStatus(existing, status);
            existing.updatedAt = now;
        } else {
            var g = normalize({
                id: newId(),
                title: title,
                description: $('goalDescription').value.trim(),
                deadline: deadline,
                category: $('goalCategory').value.trim(),
                priority: prio ? prio.value : 'medium',
                status: 'pending',
                recurrence: $('goalRecurrence').value,
                tags: $('goalTags').value,
                notes: $('goalNotes').value.trim(),
                links: $('goalLinks').value,
                parentId: $('goalParent').value,
                subtasks: subtasks,
                createdAt: now,
                updatedAt: now
            });
            goals.push(g);
            justCompleted = setStatus(g, status);
        }

        save();
        closeDialog();
        render();
        toast(existing ? 'Meta atualizada' : 'Meta criada');
        if (justCompleted) { confetti(); announceSpawn(); }
    }

    /* ---------- Ações ---------- */

    function deleteGoal(id) {
        var g = findGoal(id);
        if (!g) { return; }
        takeSnapshot();
        goals = goals.filter(function (x) { return x.id !== id; });
        goals.forEach(function (x) { if (x.parentId === id) { x.parentId = ''; } });
        save();
        render();
        toast('Meta excluída', { action: { label: 'Desfazer', run: restoreSnapshot } });
    }

    function announceSpawn() {
        if (lastSpawn) {
            toast('Próxima "' + lastSpawn.title + '" criada para ' + formatShort(lastSpawn.deadline));
            lastSpawn = null;
        }
    }

    function changeStatus(id, status) {
        var g = findGoal(id);
        if (!g) { return; }
        takeSnapshot();
        var done = setStatus(g, status);
        save();
        render();
        if (done) {
            confetti();
            toast('Meta concluída. Bom trabalho!', { action: { label: 'Desfazer', run: restoreSnapshot } });
            announceSpawn();
        }
    }

    function togglePin(id) {
        var g = findGoal(id);
        if (!g) { return; }
        if (!g.pinned) {
            var count = goals.filter(function (x) { return x.pinned && x.status !== 'completed'; }).length;
            if (count >= MAX_PINNED) {
                toast('O foco do dia aceita até ' + MAX_PINNED + ' metas. Tire uma para fixar outra.', { error: true });
                return;
            }
        }
        g.pinned = !g.pinned;
        save();
        render();
    }

    function toggleSubtask(id, index, checked) {
        var g = findGoal(id);
        if (!g || !g.subtasks[index]) { return; }
        var done = false;
        g.subtasks[index].completed = checked;
        g.updatedAt = new Date().toISOString();
        var all = g.subtasks.every(function (s) { return s.completed; });
        if (all && g.status !== 'completed') {
            done = setStatus(g, 'completed');
        } else if (!all && g.status === 'completed') {
            g.status = 'progress';
            g.completedAt = null;
        } else if (checked && g.status === 'pending') {
            g.status = 'progress';
        }
        save();
        render();
        if (done) { confetti(); toast('Todas as subtarefas feitas: meta concluída!'); announceSpawn(); }
    }

    function addSubtask(id) {
        var input = document.querySelector('[data-sub-input="' + id + '"]');
        var g = findGoal(id);
        if (!input || !g) { return; }
        var text = input.value.trim();
        if (!text) { input.focus(); return; }
        g.subtasks.push({ text: text.slice(0, 160), completed: false });
        if (g.status === 'completed') { g.status = 'progress'; g.completedAt = null; }
        g.updatedAt = new Date().toISOString();
        openSubtasks[id] = true;
        save();
        render();
        var again = document.querySelector('[data-sub-input="' + id + '"]');
        if (again) { again.focus(); }
    }

    function exportData() {
        var payload = JSON.stringify({ app: 'MetaFlow', version: 2, exportedAt: new Date().toISOString(), goals: goals }, null, 2);
        var blob = new Blob([payload], { type: 'application/json' });
        var url = URL.createObjectURL(blob);
        var a = document.createElement('a');
        a.href = url;
        a.download = 'metaflow-backup-' + todayISO() + '.json';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
        toast('Backup salvo');
    }

    function importData(file) {
        if (!file) { return; }
        var reader = new FileReader();
        reader.onload = function () {
            try {
                var data = JSON.parse(String(reader.result));
                var list = Array.isArray(data) ? data : data && data.goals;
                if (!Array.isArray(list)) { throw new Error('formato'); }
                var imported = list.map(normalize).filter(Boolean);
                takeSnapshot();
                goals = imported;
                save();
                render();
                toast(plural(imported.length, 'meta restaurada', 'metas restauradas'), { action: { label: 'Desfazer', run: restoreSnapshot } });
            } catch (e) {
                toast('Esse arquivo não é um backup válido do MetaFlow.', { error: true });
            }
        };
        reader.onerror = function () { toast('Não consegui ler o arquivo.', { error: true }); };
        reader.readAsText(file);
    }

    function applyTheme(theme) {
        document.documentElement.setAttribute('data-theme', theme);
        try { localStorage.setItem(THEME_KEY, theme); } catch (e) { /* sem armazenamento */ }
        $('themeIcon').innerHTML = icon(theme === 'dark' ? 'sun' : 'moon');
        $('themeLabel').textContent = theme === 'dark' ? 'Tema claro' : 'Tema escuro';
    }

    function clearFilters() {
        state.filter = 'all';
        state.category = '';
        state.query = '';
        $('searchInput').value = '';
        render();
    }

    /* ---------- Eventos ---------- */

    document.addEventListener('click', function (event) {
        var el = event.target.closest('[data-action]');
        if (el) {
            var action = el.getAttribute('data-action');
            var id = el.getAttribute('data-id');
            switch (action) {
                case 'new': openDialog(null); break;
                case 'edit': openDialog(id); break;
                case 'delete': deleteGoal(id); break;
                case 'pin': togglePin(id); break;
                case 'start': changeStatus(id, 'progress'); break;
                case 'complete': changeStatus(id, 'completed'); break;
                case 'reopen': changeStatus(id, 'progress'); break;
                case 'add-sub': addSubtask(id); break;
                case 'filter':
                    state.filter = el.getAttribute('data-filter');
                    render();
                    break;
                case 'category':
                    state.category = state.category === el.getAttribute('data-category') ? '' : el.getAttribute('data-category');
                    render();
                    break;
                case 'view':
                    state.view = el.getAttribute('data-view');
                    try { localStorage.setItem(VIEW_KEY, state.view); } catch (e) { /* ok */ }
                    renderGoals();
                    break;
                case 'theme':
                    applyTheme(document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark');
                    break;
                case 'logout': MetaAuth.logout(); break;
                case 'tag':
                    state.query = el.getAttribute('data-tag');
                    $('searchInput').value = state.query;
                    renderGoals();
                    window.scrollTo({ top: $('searchInput').getBoundingClientRect().top + window.scrollY - 80, behavior: 'smooth' });
                    break;
                case 'focus':
                    if (window.MetaTools) { MetaTools.open('focus', id); }
                    break;
                case 'tool':
                    if (window.MetaTools) { MetaTools.open(el.getAttribute('data-tool')); }
                    break;
                case 'export': exportData(); break;
                case 'import': $('importInput').click(); break;
                case 'close-dialog': closeDialog(); break;
                case 'add-subtask-row': addSubtaskRow('', false).focus(); break;
                case 'remove-subtask-row':
                    var row = el.closest('.subtask-row');
                    if (row) { row.parentNode.removeChild(row); }
                    break;
                case 'clear-filters': clearFilters(); break;
                default: break;
            }
            return;
        }
        // Clique no fundo escuro fecha a janela.
        if (event.target === $('goalDialog')) { closeDialog(); }
    });

    document.addEventListener('change', function (event) {
        var t = event.target;
        if (t.matches && t.matches('[data-action="toggle-sub"]')) {
            toggleSubtask(t.getAttribute('data-id'), parseInt(t.getAttribute('data-index'), 10), t.checked);
        }
    });

    document.addEventListener('toggle', function (event) {
        var t = event.target;
        if (t && t.matches && t.matches('details.subtasks')) {
            openSubtasks[t.getAttribute('data-id')] = t.open;
        }
    }, true);

    document.addEventListener('keydown', function (event) {
        var t = event.target;
        if (event.key === 'Enter' && t.hasAttribute && t.hasAttribute('data-sub-input')) {
            event.preventDefault();
            addSubtask(t.getAttribute('data-sub-input'));
            return;
        }
        if (event.key === 'Enter' && t.closest && t.closest('.subtask-row')) {
            event.preventDefault();
            addSubtaskRow('', false).focus();
            return;
        }
        var typing = /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName) || t.isContentEditable;
        if (typing || event.ctrlKey || event.metaKey || event.altKey || $('goalDialog').open) { return; }
        if (event.key === 'n' || event.key === 'N') {
            event.preventDefault();
            openDialog(null);
        } else if (event.key === '/') {
            event.preventDefault();
            $('searchInput').focus();
        }
    });

    // Arrastar entre colunas do quadro.
    document.addEventListener('dragstart', function (event) {
        var card = event.target.closest && event.target.closest('.card[draggable="true"]');
        if (!card) { return; }
        event.dataTransfer.setData('text/plain', card.getAttribute('data-id'));
        event.dataTransfer.effectAllowed = 'move';
        card.classList.add('is-dragging');
    });
    document.addEventListener('dragend', function (event) {
        var card = event.target.closest && event.target.closest('.card');
        if (card) { card.classList.remove('is-dragging'); }
        var zones = document.querySelectorAll('.board-drop.is-over');
        for (var i = 0; i < zones.length; i++) { zones[i].classList.remove('is-over'); }
    });
    document.addEventListener('dragover', function (event) {
        var zone = event.target.closest && event.target.closest('.board-col');
        if (!zone) { return; }
        event.preventDefault();
        zone.querySelector('.board-drop').classList.add('is-over');
    });
    document.addEventListener('dragleave', function (event) {
        var zone = event.target.closest && event.target.closest('.board-col');
        if (zone && !zone.contains(event.relatedTarget)) { zone.querySelector('.board-drop').classList.remove('is-over'); }
    });
    document.addEventListener('drop', function (event) {
        var col = event.target.closest && event.target.closest('.board-col');
        if (!col) { return; }
        event.preventDefault();
        var id = event.dataTransfer.getData('text/plain');
        var status = col.getAttribute('data-status');
        var g = findGoal(id);
        if (g && g.status !== status) { changeStatus(id, status); } else { render(); }
    });

    /* ---------- Início ---------- */

    function init() {
        hydrateIcons(document);
        var user = window.MetaAuth && MetaAuth.current();
        if (user) {
            $('userName').textContent = user.name;
            $('userEmail').textContent = user.email;
        }
        load();

        try {
            var savedView = localStorage.getItem(VIEW_KEY);
            state.view = savedView === 'board' || savedView === 'calendar' ? savedView : 'list';
            var savedSort = localStorage.getItem(SORT_KEY);
            if (savedSort === 'priority' || savedSort === 'recent' || savedSort === 'deadline') { state.sort = savedSort; }
        } catch (e) { /* ok */ }
        $('sortSelect').value = state.sort;

        applyTheme(document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light');

        $('goalForm').addEventListener('submit', submitForm);
        $('searchInput').addEventListener('input', function (e) {
            state.query = e.target.value.trim().toLowerCase();
            renderGoals();
        });
        $('sortSelect').addEventListener('change', function (e) {
            state.sort = e.target.value;
            try { localStorage.setItem(SORT_KEY, state.sort); } catch (err) { /* ok */ }
            renderGoals();
        });
        $('importInput').addEventListener('change', function (e) {
            importData(e.target.files && e.target.files[0]);
            e.target.value = '';
        });
        window.addEventListener('storage', function (e) {
            if (e.key === STORE_KEY) { load(); render(); }
        });

        // Interface para os módulos extras (extras.js).
        window.MetaFlowApp = {
            getGoals: function () { return goals; },
            getVisible: visibleGoals,
            getView: function () { return state.view; },
            setView: function (v) {
                state.view = v;
                try { localStorage.setItem(VIEW_KEY, v); } catch (e) { /* ok */ }
                renderGoals();
            },
            findGoal: findGoal,
            childrenOf: childrenOf,
            goalProgress: goalProgress,
            isOverdue: isOverdue,
            dueInfo: dueInfo,
            save: save,
            render: render,
            openNew: function (deadline) { openDialog(null, { deadline: deadline }); },
            openEdit: function (id) { openDialog(id); },
            addFocus: function (id, minutes) {
                var g = findGoal(id);
                if (!g) { return; }
                g.focusMinutes = (g.focusMinutes || 0) + minutes;
                g.updatedAt = new Date().toISOString();
                save();
                render();
            },
            onRender: function (fn) { renderHooks.push(fn); try { fn(state.view); } catch (e) { /* ok */ } },
            toast: toast,
            confetti: confetti,
            icon: icon,
            esc: esc,
            plural: plural,
            hueOf: hueOf,
            todayISO: todayISO,
            isoOf: isoOf,
            formatShort: formatShort,
            storeKey: function () { return STORE_KEY; },
            hydrateIcons: hydrateIcons,
            addSubtaskRow: addSubtaskRow
        };

        render();
        window.dispatchEvent(new Event('metaflow:ready'));
        // Atualiza prazos ("vence hoje") quando a aba volta a ficar visível.
        document.addEventListener('visibilitychange', function () {
            if (!document.hidden) { render(); }
        });
    }

    init();
})();
