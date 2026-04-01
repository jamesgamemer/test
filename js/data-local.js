/* ============================================================
   7DS ORIGIN - LOCAL DATA MODULE
   Replaces Supabase with local JSON file storage.
   Works with both file:// and http:// protocols.
   ============================================================ */

var CharDB = (function () {
  var cachedData = null;

  /* ── Helper: resolve the JSON URL relative to current page ── */
  function getDataURL() {
    /* Detect if we are inside a subfolder (e.g. characters/Ban.html) */
    var path = window.location.pathname;
    if (path.indexOf('/characters/') !== -1) {
      return '../data/characters.json';
    }
    return 'data/characters.json';
  }

  /* ── Load all characters ── */
  async function loadAll(callback) {
    console.log("[CharDB] Loading characters...");

    /* 1. Try localStorage first (has user edits) */
    if (!cachedData) {
      var stored = loadFromLocalStorage();
      if (stored) {
        cachedData = stored;
        console.log("[CharDB] Loaded " + cachedData.length + " characters from localStorage");
      }
    }

    /* 2. Try fetch from JSON file */
    if (!cachedData) {
      try {
        var url = getDataURL();
        console.log("[CharDB] Fetching from: " + url);
        var response = await fetch(url);
        if (response.ok) {
          cachedData = await response.json();
          console.log("[CharDB] Loaded " + cachedData.length + " characters from JSON file");
        }
      } catch (err) {
        console.warn("[CharDB] Fetch failed:", err.message);
      }
    }

    /* 3. Fallback: if still no data, return empty array */
    if (!cachedData || !Array.isArray(cachedData)) {
      console.warn("[CharDB] No data available, using empty array");
      cachedData = [];
    }

    if (callback) callback(cachedData);
    return cachedData;
  }

  /* ── Get all characters ── */
  async function getAll() {
    return await loadAll();
  }

  /* ── Get character by slug ── */
  async function getBySlug(slug) {
    var data = await loadAll();
    if (!Array.isArray(data)) return null;
    slug = (slug || '').toLowerCase();
    return data.find(function(c) {
      return (c.slug || c.id || c.name || '').toLowerCase() === slug ||
             (c.name_en || c.name || '').toLowerCase() === slug;
    }) || null;
  }

  /* ── Add new character ── */
  async function add(character) {
    var data = await loadAll();
    if (!Array.isArray(data)) data = [];

    if (!character.id) {
      character.id = (character.name_en || character.name || 'char').toLowerCase().replace(/\s+/g, '-');
    }
    if (!character.slug) {
      character.slug = character.id;
    }

    data.push(character);
    cachedData = data;
    saveToLocalStorage();
    return character;
  }

  /* ── Update character ── */
  async function update(id, updates) {
    var data = await loadAll();
    if (!Array.isArray(data)) return null;

    var index = -1;
    for (var i = 0; i < data.length; i++) {
      if ((data[i].id || data[i].slug) === id) { index = i; break; }
    }
    if (index === -1) return null;

    for (var key in updates) {
      if (updates.hasOwnProperty(key)) {
        data[index][key] = updates[key];
      }
    }
    cachedData = data;
    saveToLocalStorage();
    return data[index];
  }

  /* ── Delete character ── */
  async function remove(id) {
    var data = await loadAll();
    if (!Array.isArray(data)) return false;

    var index = -1;
    for (var i = 0; i < data.length; i++) {
      if ((data[i].id || data[i].slug) === id) { index = i; break; }
    }
    if (index === -1) return false;

    data.splice(index, 1);
    cachedData = data;
    saveToLocalStorage();
    return true;
  }

  /* ── Save to localStorage ── */
  function saveToLocalStorage() {
    try {
      localStorage.setItem('7ds_characters_data', JSON.stringify(cachedData));
      console.log("[CharDB] Data saved to localStorage");
    } catch (e) {
      console.error("[CharDB] Error saving to localStorage:", e);
    }
  }

  /* ── Load from localStorage ── */
  function loadFromLocalStorage() {
    try {
      var stored = localStorage.getItem('7ds_characters_data');
      if (stored) {
        var parsed = JSON.parse(stored);
        if (Array.isArray(parsed) && parsed.length > 0) {
          return parsed;
        }
      }
    } catch (e) {
      console.error("[CharDB] Error loading from localStorage:", e);
    }
    return null;
  }

  /* ── Export data as JSON file ── */
  function exportJSON(data) {
    var blob = new Blob([JSON.stringify(data || cachedData, null, 2)], { type: 'application/json' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = 'characters_export.json';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  /* ── Reset to original JSON ── */
  async function reset() {
    cachedData = null;
    localStorage.removeItem('7ds_characters_data');
    return await loadAll();
  }

  /* ── Get cached data ── */
  function getCached() {
    return cachedData;
  }

  /* ── Check if connected (always true for local) ── */
  function isConnected() {
    return true;
  }

  return {
    loadAll: loadAll,
    getAll: getAll,
    getBySlug: getBySlug,
    add: add,
    update: update,
    remove: remove,
    exportJSON: exportJSON,
    reset: reset,
    getCached: getCached,
    loadFromLocalStorage: loadFromLocalStorage,
    isConnected: isConnected
  };
})();

/* ── SupaDB compatibility shim ── */
var SupaDB = {
  isConnected: function() { return false; },
  getClient: function() { return null; },
  init: function() { console.log("[SupaDB] Disabled - using local mode"); },
  fetchAll: function() { return CharDB.getAll(); },
  fetchBySlug: function(s) { return CharDB.getBySlug(s); },
  subscribeToChanges: function() { /* no-op */ },
  uploadImage: function() { return { error: null, url: null }; },
  uploadCostumeImage: function() { return { error: null, url: null }; },
  uploadMaterialImage: function() { return { error: null, url: null }; },
  getSession: function() { return null; }
};

/* ── Auth compatibility shim (for pages that still reference Auth) ── */
if (typeof Auth === 'undefined') {
  var Auth = {
    isLoggedIn: function() {
      if (typeof AdminAuth !== 'undefined') return AdminAuth.isLoggedIn();
      return false;
    },
    logout: function() {
      if (typeof AdminAuth !== 'undefined') AdminAuth.logout();
    }
  };
}

/* ── UserAuth compatibility shim ── */
if (typeof UserAuth === 'undefined') {
  var UserAuth = {
    isLoggedIn: function() {
      if (typeof AdminAuth !== 'undefined') return AdminAuth.isLoggedIn();
      return false;
    },
    logout: function() {
      if (typeof AdminAuth !== 'undefined') AdminAuth.logout();
    },
    getUser: function() { return null; },
    getUserId: function() { return 'local-admin'; }
  };
}
