/* MetaFlow — contas locais.
   Não há servidor: contas e metas ficam no navegador deste computador.
   A senha nunca é guardada em texto; guardamos um hash PBKDF2 com sal. */
(function () {
    'use strict';

    var USERS_KEY = 'metaflow_users';
    var SESSION_KEY = 'metaflow_session';
    var LEGACY_GOALS = 'metaflow_goals';
    var ITERATIONS = 150000;

    function readUsers() {
        try {
            var data = JSON.parse(localStorage.getItem(USERS_KEY) || '{}');
            return data && typeof data === 'object' && !Array.isArray(data) ? data : {};
        } catch (e) { return {}; }
    }

    function writeUsers(users) {
        localStorage.setItem(USERS_KEY, JSON.stringify(users));
    }

    function normEmail(email) { return String(email || '').trim().toLowerCase(); }

    function validEmail(email) { return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email); }

    function toB64(bytes) {
        var s = '';
        for (var i = 0; i < bytes.length; i++) { s += String.fromCharCode(bytes[i]); }
        return btoa(s);
    }

    function fromB64(text) {
        var s = atob(text), out = new Uint8Array(s.length);
        for (var i = 0; i < s.length; i++) { out[i] = s.charCodeAt(i); }
        return out;
    }

    function randomSalt() {
        var salt = new Uint8Array(16);
        crypto.getRandomValues(salt);
        return toB64(salt);
    }

    function hashPassword(password, saltB64) {
        if (!window.crypto || !crypto.subtle) {
            return Promise.reject(new Error('Este navegador não suporta criptografia segura. Abra o MetaFlow em um navegador atual.'));
        }
        var enc = new TextEncoder();
        return crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveBits'])
            .then(function (key) {
                return crypto.subtle.deriveBits(
                    { name: 'PBKDF2', salt: fromB64(saltB64), iterations: ITERATIONS, hash: 'SHA-256' },
                    key, 256);
            })
            .then(function (bits) { return toB64(new Uint8Array(bits)); });
    }

    function setSession(email, remember) {
        try {
            sessionStorage.removeItem(SESSION_KEY);
            localStorage.removeItem(SESSION_KEY);
            (remember ? localStorage : sessionStorage).setItem(SESSION_KEY, email);
        } catch (e) { /* sem armazenamento */ }
    }

    var MetaAuth = {
        current: function () {
            try {
                var email = sessionStorage.getItem(SESSION_KEY) || localStorage.getItem(SESSION_KEY);
                if (!email) { return null; }
                var user = readUsers()[email];
                return user ? { email: email, name: user.name } : null;
            } catch (e) { return null; }
        },

        storeKey: function () {
            var u = MetaAuth.current();
            return u ? 'metaflow_goals:' + u.email : LEGACY_GOALS;
        },

        requireLogin: function () {
            if (!MetaAuth.current()) { location.replace('login.html'); return false; }
            return true;
        },

        register: function (name, email, password, remember) {
            email = normEmail(email);
            name = String(name || '').trim();
            if (!name) { return Promise.reject(new Error('Informe seu nome.')); }
            if (!validEmail(email)) { return Promise.reject(new Error('Digite um e-mail válido.')); }
            if (String(password).length < 6) { return Promise.reject(new Error('A senha precisa ter pelo menos 6 caracteres.')); }
            var users = readUsers();
            if (users[email]) { return Promise.reject(new Error('Já existe uma conta com esse e-mail. Entre com ela.')); }
            var salt = randomSalt();
            return hashPassword(password, salt).then(function (hash) {
                var firstAccount = Object.keys(users).length === 0;
                users[email] = { name: name, salt: salt, hash: hash, createdAt: new Date().toISOString() };
                writeUsers(users);
                // A primeira conta herda as metas que já existiam neste navegador.
                if (firstAccount) {
                    try {
                        var legacy = localStorage.getItem(LEGACY_GOALS);
                        if (legacy && !localStorage.getItem('metaflow_goals:' + email)) {
                            localStorage.setItem('metaflow_goals:' + email, legacy);
                        }
                    } catch (e) { /* ok */ }
                }
                setSession(email, remember);
                return { email: email, name: name };
            });
        },

        login: function (email, password, remember) {
            email = normEmail(email);
            var user = readUsers()[email];
            var fail = new Error('E-mail ou senha incorretos.');
            if (!user) { return Promise.reject(fail); }
            return hashPassword(password, user.salt).then(function (hash) {
                if (hash !== user.hash) { throw fail; }
                setSession(email, remember);
                return { email: email, name: user.name };
            });
        },

        logout: function () {
            try {
                sessionStorage.removeItem(SESSION_KEY);
                localStorage.removeItem(SESSION_KEY);
            } catch (e) { /* ok */ }
            location.replace('login.html');
        },

        hasAccounts: function () { return Object.keys(readUsers()).length > 0; }
    };

    window.MetaAuth = MetaAuth;
})();
