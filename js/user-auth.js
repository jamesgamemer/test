/* ============================================================
   7DS ORIGIN - USER AUTH MODULE
   Handles user authentication (Google OAuth, Discord OAuth, Email/Password)
   Separate from Admin Auth (auth.js)
   ============================================================ */

var UserAuth = (function () {
  'use strict';

  var _currentUser = null;
  var _profile = null;
  var _listeners = [];

  /* ── Helper: Get proper redirect URL ── */
  function _getRedirectUrl() {
    // Use SITE_URL from config if available (prevents file:// and wrong domain issues)
    if (typeof SITE_URL !== 'undefined' && SITE_URL && !SITE_URL.includes('YOUR_SITE')) {
      // Build redirect URL based on current page name
      var pageName = window.location.pathname.split('/').pop() || 'index.html';
      // If opened from file://, use the page name from the file path
      if (window.location.protocol === 'file:') {
        var parts = window.location.href.split('/');
        pageName = parts[parts.length - 1].split('?')[0].split('#')[0] || 'index.html';
      }
      return SITE_URL.replace(/\/$/, '') + '/' + pageName;
    }
    // Fallback: use current URL (works when hosted on correct domain)
    return window.location.href.split('?')[0].split('#')[0];
  }

  /* ── Initialize: check existing session ── */
  async function init() {
    if (typeof SupaDB === 'undefined' || !SupaDB.isConnected()) return;

    var client = SupaDB.getClient();
    if (!client) return;

    /* Get current session */
    try {
      var { data } = await client.auth.getSession();
      if (data && data.session && data.session.user) {
        _currentUser = data.session.user;
        await _loadProfile();
        _notifyListeners();
      }
    } catch (e) {
      console.warn('[UserAuth] Session check error:', e);
    }

    /* Listen for auth state changes */
    client.auth.onAuthStateChange(function (event, session) {
      if (event === 'SIGNED_IN' && session && session.user) {
        _currentUser = session.user;
        _loadProfile().then(function () { _notifyListeners(); });
      } else if (event === 'SIGNED_OUT') {
        _currentUser = null;
        _profile = null;
        _notifyListeners();
      }
    });
  }

  /* ── Load user profile from user_profiles table ── */
  async function _loadProfile() {
    if (!_currentUser) return;
    try {
      var client = SupaDB.getClient();
      var { data, error } = await client
        .from('user_profiles')
        .select('*')
        .eq('id', _currentUser.id)
        .single();

      if (!error && data) {
        _profile = data;
      } else {
        /* Profile might not exist yet (trigger delay), create fallback */
        _profile = {
          id: _currentUser.id,
          display_name: _currentUser.user_metadata
            ? (_currentUser.user_metadata.full_name || _currentUser.user_metadata.name || _currentUser.email.split('@')[0])
            : _currentUser.email.split('@')[0],
          avatar_url: _currentUser.user_metadata
            ? (_currentUser.user_metadata.avatar_url || _currentUser.user_metadata.picture || '')
            : '',
          provider: _currentUser.app_metadata
            ? (_currentUser.app_metadata.provider || 'email')
            : 'email'
        };
      }
    } catch (e) {
      console.warn('[UserAuth] Profile load error:', e);
    }
  }

  /* ── Google OAuth Login ── */
  async function loginWithGoogle() {
    if (typeof SupaDB === 'undefined' || !SupaDB.isConnected()) {
      return { error: { message: 'Supabase not connected' } };
    }
    var client = SupaDB.getClient();
    try {
      var redirectUrl = _getRedirectUrl();
      console.log('[UserAuth] Google OAuth redirectTo:', redirectUrl);
      var { data, error } = await client.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: redirectUrl
        }
      });
      if (error) return { error: error };
      return { data: data };
    } catch (e) {
      return { error: { message: e.message } };
    }
  }

  /* ── Discord OAuth Login ── */
  async function loginWithDiscord() {
    if (typeof SupaDB === 'undefined' || !SupaDB.isConnected()) {
      return { error: { message: 'Supabase not connected' } };
    }
    var client = SupaDB.getClient();
    try {
      var redirectUrl = _getRedirectUrl();
      console.log('[UserAuth] Discord OAuth redirectTo:', redirectUrl);
      var { data, error } = await client.auth.signInWithOAuth({
        provider: 'discord',
        options: {
          redirectTo: redirectUrl
        }
      });
      if (error) return { error: error };
      return { data: data };
    } catch (e) {
      return { error: { message: e.message } };
    }
  }

  /* ── Email/Password Sign Up ── */
  async function signUpWithEmail(email, password, displayName) {
    if (typeof SupaDB === 'undefined' || !SupaDB.isConnected()) {
      return { error: { message: 'Supabase not connected' } };
    }
    var client = SupaDB.getClient();
    try {
      var { data, error } = await client.auth.signUp({
        email: email,
        password: password,
        options: {
          data: { full_name: displayName || email.split('@')[0] }
        }
      });
      if (error) return { error: error };
      return { data: data };
    } catch (e) {
      return { error: { message: e.message } };
    }
  }

  /* ── Email/Password Login ── */
  async function loginWithEmail(email, password) {
    if (typeof SupaDB === 'undefined' || !SupaDB.isConnected()) {
      return { error: { message: 'Supabase not connected' } };
    }
    var client = SupaDB.getClient();
    try {
      var { data, error } = await client.auth.signInWithPassword({
        email: email,
        password: password
      });
      if (error) return { error: error };
      if (data && data.user) {
        _currentUser = data.user;
        await _loadProfile();
        _notifyListeners();
      }
      return { data: data };
    } catch (e) {
      return { error: { message: e.message } };
    }
  }

  /* ── Logout ── */
  async function logout() {
    if (typeof SupaDB === 'undefined' || !SupaDB.isConnected()) return;
    var client = SupaDB.getClient();
    await client.auth.signOut();
    _currentUser = null;
    _profile = null;
    _notifyListeners();
  }

  /* ── State getters ── */
  function isLoggedIn() {
    return _currentUser !== null;
  }

  function getUser() {
    return _currentUser;
  }

  function getUserId() {
    return _currentUser ? _currentUser.id : null;
  }

  function getProfile() {
    return _profile;
  }

  function getDisplayName() {
    if (_profile && _profile.display_name) return _profile.display_name;
    if (_currentUser && _currentUser.user_metadata) {
      return _currentUser.user_metadata.full_name
        || _currentUser.user_metadata.name
        || (_currentUser.email ? _currentUser.email.split('@')[0] : 'User');
    }
    return _currentUser ? (_currentUser.email ? _currentUser.email.split('@')[0] : 'User') : '';
  }

  function getAvatarUrl() {
    if (_profile && _profile.avatar_url) return _profile.avatar_url;
    if (_currentUser && _currentUser.user_metadata) {
      return _currentUser.user_metadata.avatar_url
        || _currentUser.user_metadata.picture
        || '';
    }
    return '';
  }

  /* ── Event listeners ── */
  function onChange(callback) {
    if (typeof callback === 'function') {
      _listeners.push(callback);
    }
  }

  function _notifyListeners() {
    var state = {
      loggedIn: isLoggedIn(),
      user: _currentUser,
      profile: _profile
    };
    _listeners.forEach(function (fn) {
      try { fn(state); } catch (e) { console.warn('[UserAuth] Listener error:', e); }
    });
  }

  return {
    init: init,
    loginWithGoogle: loginWithGoogle,
    loginWithDiscord: loginWithDiscord,
    signUpWithEmail: signUpWithEmail,
    loginWithEmail: loginWithEmail,
    logout: logout,
    isLoggedIn: isLoggedIn,
    getUser: getUser,
    getUserId: getUserId,
    getProfile: getProfile,
    getDisplayName: getDisplayName,
    getAvatarUrl: getAvatarUrl,
    onChange: onChange
  };
})();
