/* ============================================================
   7DS ORIGIN - WEAPON API MODULE (LOCAL MODE)
   Replaces Supabase with data/weapons.json + localStorage
   ============================================================ */

var WeaponDB = (function () {

  var STORAGE_KEY = '7dso-weapons';
  var LINKS_KEY   = '7dso-weapon-characters';
  var _cachedWeapons = null;

  /* ── Load weapons: localStorage first, then fetch JSON, then fallback ── */
  async function _loadWeapons() {
    if (_cachedWeapons) return _cachedWeapons;

    /* 1. Try localStorage (user edits) */
    try {
      var stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        var parsed = JSON.parse(stored);
        if (Array.isArray(parsed) && parsed.length > 0) {
          _cachedWeapons = parsed;
          console.log('[WeaponDB] Loaded ' + _cachedWeapons.length + ' weapons from localStorage');
          return _cachedWeapons;
        }
      }
    } catch(e) {}

    /* 2. Try fetch from JSON file */
    try {
      var path = window.location.pathname;
      var url = (path.indexOf('/characters/') !== -1) ? '../data/weapons.json' : 'data/weapons.json';
      var resp = await fetch(url);
      if (resp.ok) {
        var data = await resp.json();
        var weapons = Array.isArray(data) ? data : (data.weapons || []);
        /* Normalize fields */
        _cachedWeapons = weapons.map(function(w) {
          return {
            id: w.id || w.slug || (w.name || w.name_en || '').toLowerCase().replace(/[^a-z0-9]+/g, '-'),
            name_en: w.name_en || w.name || '',
            slug: w.slug || (w.name || w.name_en || '').toLowerCase().replace(/[^a-z0-9]+/g, '-'),
            series: w.series || '',
            category: w.category || '',
            playstyle: w.playstyle || '',
            role: w.role || '',
            range: w.range || '',
            rarity: w.rarity || 5,
            equipment_atk: w.equipment_atk || 0,
            sub_stat_type: w.sub_stat_type || '',
            sub_stat_value: w.sub_stat_value || '',
            passive_description: w.passive_description || w.passive_desc_en || '',
            passive_desc_en: w.passive_desc_en || w.passive_description || '',
            icon_url: w.icon_url || '',
            lore_en: w.lore_en || w.lore || ''
          };
        });
        console.log('[WeaponDB] Loaded ' + _cachedWeapons.length + ' weapons from JSON file');
        return _cachedWeapons;
      }
    } catch(e) {
      console.warn('[WeaponDB] Fetch failed:', e.message);
    }

    /* 3. Fallback empty */
    _cachedWeapons = [];
    return _cachedWeapons;
  }

  function _saveWeapons() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(_cachedWeapons || []));
    } catch(e) { console.error('[WeaponDB] Save error:', e); }
  }

  // ============================================================
  // WEAPONS - CRUD Operations
  // ============================================================

  async function fetchAll() {
    return await _loadWeapons();
  }

  async function fetchBySlug(slug) {
    var weapons = await _loadWeapons();
    return weapons.find(function(w) { return w.slug === slug; }) || null;
  }

  async function fetchByCategory(category) {
    var weapons = await _loadWeapons();
    return weapons.filter(function(w) { return w.category === category; });
  }

  async function insert(weaponData) {
    var weapons = await _loadWeapons();

    weaponData.name_en = weaponData.name_en || weaponData.name || '';
    delete weaponData.name;

    if (!weaponData.name_en) {
      return { error: { message: 'Weapon Name (EN) is required' } };
    }

    if (!weaponData.slug) {
      weaponData.slug = weaponData.name_en.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
    }
    if (!weaponData.id) {
      weaponData.id = weaponData.slug;
    }

    weapons.push(weaponData);
    _cachedWeapons = weapons;
    _saveWeapons();
    return { data: weaponData, error: null };
  }

  async function update(id, updates) {
    var weapons = await _loadWeapons();
    var idx = -1;
    for (var i = 0; i < weapons.length; i++) {
      if (String(weapons[i].id) === String(id) || weapons[i].slug === id) { idx = i; break; }
    }
    if (idx === -1) return { data: null, error: { message: 'Weapon not found' } };

    for (var key in updates) {
      if (updates.hasOwnProperty(key)) {
        weapons[idx][key] = updates[key];
      }
    }
    _cachedWeapons = weapons;
    _saveWeapons();
    return { data: weapons[idx], error: null };
  }

  async function remove(id) {
    var weapons = await _loadWeapons();
    weapons = weapons.filter(function(w) { return String(w.id) !== String(id) && w.slug !== id; });
    _cachedWeapons = weapons;
    _saveWeapons();
    /* Also remove character links */
    await unlinkAllCharacters(id);
    return { error: null };
  }

  // ============================================================
  // STORAGE - Weapon Icon (local: use data URL)
  // ============================================================

  async function uploadIcon(file, weaponSlug) {
    return new Promise(function(resolve) {
      var reader = new FileReader();
      reader.onload = function(e) {
        resolve({ error: null, url: e.target.result });
      };
      reader.onerror = function() {
        resolve({ error: { message: 'Failed to read file' }, url: null });
      };
      reader.readAsDataURL(file);
    });
  }

  // ============================================================
  // CHARACTER LINKING (localStorage)
  // ============================================================

  function _loadLinks() {
    try {
      var stored = localStorage.getItem(LINKS_KEY);
      if (stored) return JSON.parse(stored);
    } catch(e) {}
    return [];
  }

  function _saveLinks(links) {
    try {
      localStorage.setItem(LINKS_KEY, JSON.stringify(links));
    } catch(e) {}
  }

  async function fetchLinkedCharacters(weaponId) {
    var links = _loadLinks();
    return links.filter(function(l) { return String(l.weapon_id) === String(weaponId); });
  }

  async function fetchWeaponsForCharacter(characterId) {
    var links = _loadLinks();
    var weaponLinks = links.filter(function(l) { return String(l.character_id) === String(characterId); });
    var weapons = await _loadWeapons();
    return weaponLinks.map(function(l) {
      var weapon = weapons.find(function(w) { return String(w.id) === String(l.weapon_id); });
      return Object.assign({}, l, { weapons: weapon || null });
    });
  }

  async function linkCharacter(weaponId, characterId, opts) {
    var links = _loadLinks();
    /* Remove existing link if any */
    links = links.filter(function(l) {
      return !(String(l.weapon_id) === String(weaponId) && String(l.character_id) === String(characterId));
    });
    var linkData = {
      id: 'wc-' + Date.now(),
      weapon_id: weaponId,
      character_id: characterId,
      is_signature: (opts && opts.is_signature) || false,
      priority: (opts && opts.priority) || 0,
      notes_en: (opts && opts.notes_en) || null,
      notes_th: (opts && opts.notes_th) || null
    };
    links.push(linkData);
    _saveLinks(links);
    return { data: linkData, error: null };
  }

  async function unlinkCharacter(weaponId, characterId) {
    var links = _loadLinks();
    links = links.filter(function(l) {
      return !(String(l.weapon_id) === String(weaponId) && String(l.character_id) === String(characterId));
    });
    _saveLinks(links);
    return { error: null };
  }

  async function unlinkAllCharacters(weaponId) {
    var links = _loadLinks();
    links = links.filter(function(l) { return String(l.weapon_id) !== String(weaponId); });
    _saveLinks(links);
  }

  // ============================================================
  // BULK IMPORT / EXPORT
  // ============================================================

  async function bulkImport(weapons) {
    var sanitized = weapons.map(function(w) {
      var copy = Object.assign({}, w);
      copy.name_en = copy.name_en || copy.name || '';
      delete copy.name;
      if (!copy.slug && copy.name_en) {
        copy.slug = copy.name_en.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
      }
      if (!copy.id) copy.id = copy.slug;
      return copy;
    });

    var existing = await _loadWeapons();
    var existingSlugs = {};
    existing.forEach(function(w) { existingSlugs[w.slug] = true; });

    var added = 0;
    sanitized.forEach(function(w) {
      if (!existingSlugs[w.slug]) {
        existing.push(w);
        added++;
      }
    });

    _cachedWeapons = existing;
    _saveWeapons();
    return { data: sanitized, error: null, added: added };
  }

  async function exportJSON(weapons) {
    var data = weapons || _cachedWeapons || [];
    var blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = 'weapons-export-' + new Date().toISOString().slice(0, 10) + '.json';
    a.click();
    URL.revokeObjectURL(url);
  }

  // ============================================================
  // REALTIME (no-op in local mode)
  // ============================================================

  function subscribeToChanges(callback) {
    /* No-op in local mode */
    console.log('[WeaponDB] Realtime subscriptions not available in local mode');
  }

  // ============================================================
  // PUBLIC API
  // ============================================================

  return {
    fetchAll: fetchAll,
    fetchBySlug: fetchBySlug,
    fetchByCategory: fetchByCategory,
    insert: insert,
    update: update,
    remove: remove,
    uploadIcon: uploadIcon,
    fetchLinkedCharacters: fetchLinkedCharacters,
    fetchWeaponsForCharacter: fetchWeaponsForCharacter,
    linkCharacter: linkCharacter,
    unlinkCharacter: unlinkCharacter,
    unlinkAllCharacters: unlinkAllCharacters,
    bulkImport: bulkImport,
    exportJSON: exportJSON,
    subscribeToChanges: subscribeToChanges
  };

})();
