/* ============================================================
   7DS ORIGIN - WEAPON AUTO-SYNC MODULE
   
   Automated system that:
     1. Fetches weapon data from external source (genshin.gg)
     2. Compares with existing Supabase data (fingerprint-based)
     3. Detects new / updated weapons
     4. Upserts into Supabase (slug-based dedup)
     5. Logs all operations for audit trail
   
   Optimized for minimal compute:
     - ETag / Last-Modified caching
     - Fingerprint comparison (skip unchanged)
     - Batch upsert (single DB call)
     - Configurable check interval
   
   Usage:
     WeaponSync.init();
     WeaponSync.checkForUpdates();           // manual check
     WeaponSync.startAutoCheck(intervalMs);   // auto schedule
   ============================================================ */

var WeaponSync = (function () {
  'use strict';

  // ── Configuration ──
  var SOURCE_URL = 'https://genshin.gg/7dso/weapons/';
  var CORS_PROXIES = [
    'https://api.allorigins.win/raw?url=',
    'https://corsproxy.io/?'
  ];
  var CHECK_INTERVAL = 6 * 60 * 60 * 1000; // 6 hours default
  var STORAGE_KEY = 'weapon_sync_state';

  var _state = {
    lastCheck: null,
    lastETag: null,
    lastFingerprint: null,
    totalSynced: 0,
    autoCheckTimer: null,
    isRunning: false
  };

  var _callbacks = {
    onStart: null,
    onProgress: null,
    onComplete: null,
    onError: null,
    onLog: null
  };

  // ── Weapon Type Classification (same as normalize_weapons.py) ──
  var WEAPON_TYPE_MAP = {
    'Axe':         { category: 'Axe',           playstyle: 'Striker',   role: 'DPS',     range: 'Melee' },
    'Dual Swords': { category: 'Dual Swords',   playstyle: 'Assassin',  role: 'DPS',     range: 'Melee' },
    'Gauntlets':   { category: 'Gauntlets',     playstyle: 'Brawler',   role: 'DPS',     range: 'Melee' },
    'Greatsword':  { category: 'Greatsword',    playstyle: 'Striker',   role: 'DPS',     range: 'Melee' },
    'Book':        { category: 'Grimoire',      playstyle: 'Caster',    role: 'Support', range: 'Ranged' },
    'Lance':       { category: 'Lance',         playstyle: 'Lancer',    role: 'DPS',     range: 'Melee' },
    'Longsword':   { category: 'Longsword',     playstyle: 'Swordsman', role: 'DPS',     range: 'Melee' },
    'Cudgel':      { category: 'Cudgel',        playstyle: 'Brawler',   role: 'DPS',     range: 'Melee' },
    'Rapier':      { category: 'Rapier',        playstyle: 'Fencer',    role: 'DPS',     range: 'Melee' },
    'Staff':       { category: 'Staff',         playstyle: 'Caster',    role: 'Healer',  range: 'Ranged' },
    'Shield':      { category: 'Sword & Shield',playstyle: 'Guardian',  role: 'Tank',    range: 'Melee' },
    'Wand':        { category: 'Wand',          playstyle: 'Caster',    role: 'Support', range: 'Ranged' }
  };


  // ============================================================
  // STATE PERSISTENCE
  // ============================================================

  function loadState() {
    try {
      var saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        var parsed = JSON.parse(saved);
        _state.lastCheck = parsed.lastCheck || null;
        _state.lastETag = parsed.lastETag || null;
        _state.lastFingerprint = parsed.lastFingerprint || null;
        _state.totalSynced = parsed.totalSynced || 0;
      }
    } catch (e) { }
  }

  function saveState() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({
        lastCheck: _state.lastCheck,
        lastETag: _state.lastETag,
        lastFingerprint: _state.lastFingerprint,
        totalSynced: _state.totalSynced
      }));
    } catch (e) { }
  }


  // ============================================================
  // LOGGING
  // ============================================================

  function log(msg, type) {
    var entry = {
      timestamp: new Date().toISOString(),
      message: msg,
      type: type || 'info'
    };
    console.log('[WeaponSync] [' + entry.type + '] ' + msg);
    if (_callbacks.onLog) _callbacks.onLog(entry);
  }


  // ============================================================
  // FINGERPRINTING (for change detection)
  // ============================================================

  function computeFingerprint(weapons) {
    // Simple hash of weapon count + all slugs sorted
    var slugs = weapons.map(function (w) { return w.slug || ''; }).sort();
    var str = weapons.length + ':' + slugs.join(',');
    var hash = 0;
    for (var i = 0; i < str.length; i++) {
      hash = ((hash << 5) - hash + str.charCodeAt(i)) | 0;
    }
    return 'fp_' + (hash >>> 0).toString(16);
  }


  // ============================================================
  // EXTERNAL SOURCE FETCHING
  // ============================================================

  /**
   * Fetch the weapons page HTML via CORS proxy.
   * Tries multiple proxies for reliability.
   */
  function fetchSourceHTML() {
    var proxyIdx = 0;

    function tryNext() {
      if (proxyIdx >= CORS_PROXIES.length) {
        return Promise.reject(new Error('All CORS proxies failed'));
      }
      var proxyUrl = CORS_PROXIES[proxyIdx] + encodeURIComponent(SOURCE_URL);
      proxyIdx++;

      log('Fetching from proxy ' + proxyIdx + '/' + CORS_PROXIES.length + '...', 'info');

      return fetch(proxyUrl, {
        method: 'GET',
        headers: { 'Accept': 'text/html' }
      })
        .then(function (res) {
          if (!res.ok) throw new Error('HTTP ' + res.status);
          // Save ETag for future comparison
          var etag = res.headers.get('ETag') || res.headers.get('etag') || null;
          if (etag) _state.lastETag = etag;
          return res.text();
        })
        .catch(function (err) {
          log('Proxy ' + proxyIdx + ' failed: ' + err.message, 'warn');
          return tryNext();
        });
    }

    return tryNext();
  }

  /**
   * Parse weapon data from the fetched HTML.
   * Extracts weapon cards using DOM parsing.
   */
  function parseWeaponsFromHTML(html) {
    var parser = new DOMParser();
    var doc = parser.parseFromString(html, 'text/html');
    var weapons = [];

    // Find weapon card elements (genshin.gg uses .weapon-card or similar)
    var cards = doc.querySelectorAll('.weapon-card, [class*="weapon-card"], [class*="WeaponCard"]');

    if (cards.length === 0) {
      // Fallback: try to find by link pattern
      cards = doc.querySelectorAll('a[href*="/7dso/weapons/"]');
    }

    cards.forEach(function (card) {
      try {
        var weapon = extractWeaponFromCard(card);
        if (weapon && weapon.name) {
          weapons.push(weapon);
        }
      } catch (e) {
        log('Failed to parse card: ' + e.message, 'warn');
      }
    });

    return weapons;
  }

  /**
   * Extract weapon data from a single card element.
   */
  function extractWeaponFromCard(card) {
    var name = '';
    var icon = '';
    var type = '';
    var rarity = 4;
    var equipAtk = 0;
    var subStatType = '';
    var subStatValue = '';
    var bonus = '';

    // Try various selectors for name
    var nameEl = card.querySelector('.weapon-name, .name, h3, h4, [class*="name"]');
    if (nameEl) name = nameEl.textContent.trim();
    if (!name) name = card.getAttribute('title') || card.textContent.trim().split('\n')[0];

    // Icon
    var imgEl = card.querySelector('img');
    if (imgEl) icon = imgEl.getAttribute('src') || imgEl.getAttribute('data-src') || '';

    // Type / Category
    var typeEl = card.querySelector('.weapon-type, .type, [class*="type"]');
    if (typeEl) type = typeEl.textContent.trim();

    // Rarity (star count)
    var rarityEl = card.querySelector('.rarity, [class*="rarity"], [class*="star"]');
    if (rarityEl) {
      var starMatch = rarityEl.textContent.match(/(\d)/);
      if (starMatch) rarity = parseInt(starMatch[1]);
      else if (rarityEl.className.includes('5') || rarityEl.className.includes('ssr')) rarity = 5;
    }

    // Stats
    var statEls = card.querySelectorAll('.stat, [class*="stat"]');
    statEls.forEach(function (el) {
      var text = el.textContent.trim();
      if (text.includes('ATK') || text.includes('Equip')) {
        var atkMatch = text.match(/(\d+)/);
        if (atkMatch) equipAtk = parseInt(atkMatch[1]);
      }
    });

    // Passive / Bonus
    var bonusEl = card.querySelector('.bonus, .passive, [class*="bonus"], [class*="passive"]');
    if (bonusEl) bonus = bonusEl.textContent.trim();

    return {
      name: name,
      slug: makeSlug(name),
      icon_url: icon,
      type: type,
      rarity: rarity,
      equipment_atk: equipAtk,
      sub_stat_type: subStatType,
      sub_stat_value: subStatValue,
      passive_description: bonus
    };
  }


  // ============================================================
  // NORMALIZATION
  // ============================================================

  function makeSlug(name) {
    return name.toLowerCase().trim()
      .replace(/[^a-z0-9\s-]/g, '')
      .replace(/[\s]+/g, '-')
      .replace(/-+/g, '-')
      .replace(/(^-|-$)/g, '');
  }

  function extractSeries(name) {
    var suffixes = [
      'Sword and Shield', 'Dual Swords', 'Greatsword', 'Longsword',
      'Gauntlets', 'Grimoire', 'Nunchaku', 'Rapier', 'Lance',
      'Staff', 'Wand', 'Axe'
    ];
    for (var i = 0; i < suffixes.length; i++) {
      if (name.endsWith(suffixes[i])) {
        var series = name.slice(0, -suffixes[i].length).trim();
        return series || name;
      }
    }
    return name;
  }

  function normalizeWeapon(raw) {
    var classification = WEAPON_TYPE_MAP[raw.type] || {
      category: raw.type || 'Unknown',
      playstyle: 'Unknown',
      role: 'DPS',
      range: 'Melee'
    };

    return {
      name: raw.name,
      name_en: raw.name,
      slug: raw.slug || makeSlug(raw.name),
      series: extractSeries(raw.name),
      icon_url: raw.icon_url || '',
      category: classification.category,
      playstyle: classification.playstyle,
      role: classification.role,
      range: classification.range,
      rarity: raw.rarity || 4,
      equipment_atk: raw.equipment_atk || 0,
      sub_stat_type: raw.sub_stat_type || null,
      sub_stat_value: raw.sub_stat_value || null,
      passive_desc_en: raw.passive_description || null,
      is_released: true
    };
  }


  // ============================================================
  // DIFF ENGINE
  // ============================================================

  /**
   * Compare fetched weapons with existing DB weapons.
   * Returns { newWeapons: [], updatedWeapons: [], unchangedCount: number }
   */
  function diffWeapons(fetched, existing) {
    var existingMap = {};
    existing.forEach(function (w) {
      existingMap[w.slug] = w;
    });

    var newWeapons = [];
    var updatedWeapons = [];
    var unchangedCount = 0;

    fetched.forEach(function (fw) {
      var existing = existingMap[fw.slug];

      if (!existing) {
        // Brand new weapon
        newWeapons.push(fw);
      } else {
        // Check if any field changed
        var changed = false;
        var updates = {};

        if (fw.equipment_atk && fw.equipment_atk !== existing.equipment_atk) {
          updates.equipment_atk = fw.equipment_atk;
          changed = true;
        }
        if (fw.icon_url && fw.icon_url !== existing.icon_url && !existing.icon_url) {
          updates.icon_url = fw.icon_url;
          changed = true;
        }
        if (fw.passive_desc_en && fw.passive_desc_en !== existing.passive_desc_en && !existing.passive_desc_en) {
          updates.passive_desc_en = fw.passive_desc_en;
          changed = true;
        }

        if (changed) {
          updatedWeapons.push({ slug: fw.slug, id: existing.id, updates: updates });
        } else {
          unchangedCount++;
        }
      }
    });

    return {
      newWeapons: newWeapons,
      updatedWeapons: updatedWeapons,
      unchangedCount: unchangedCount
    };
  }


  // ============================================================
  // SUPABASE SYNC
  // ============================================================

  /**
   * Insert new weapons and update changed ones in Supabase.
   * Uses upsert with slug as conflict key for dedup.
   */
  async function syncToSupabase(diff) {
    if (typeof WeaponDB === 'undefined') {
      throw new Error('WeaponDB module not loaded');
    }
    if (true) /* local mode - no Supabase */ {
      throw new Error('Supabase not connected');
    }

    var results = { inserted: 0, updated: 0, errors: [] };

    // Batch insert new weapons via upsert
    if (diff.newWeapons.length > 0) {
      log('Inserting ' + diff.newWeapons.length + ' new weapons...', 'info');
      var result = await WeaponDB.bulkImport(diff.newWeapons);
      if (result.error) {
        results.errors.push('Bulk insert: ' + result.error.message);
        log('Bulk insert error: ' + result.error.message, 'error');
      } else {
        results.inserted = diff.newWeapons.length;
        log('Inserted ' + results.inserted + ' new weapons', 'success');
      }
    }

    // Update changed weapons one by one
    if (diff.updatedWeapons.length > 0) {
      log('Updating ' + diff.updatedWeapons.length + ' weapons...', 'info');
      for (var i = 0; i < diff.updatedWeapons.length; i++) {
        var item = diff.updatedWeapons[i];
        var res = await WeaponDB.update(item.id, item.updates);
        if (res.error) {
          results.errors.push('Update ' + item.slug + ': ' + res.error.message);
        } else {
          results.updated++;
        }
      }
      log('Updated ' + results.updated + ' weapons', 'success');
    }

    return results;
  }


  // ============================================================
  // MAIN CHECK FLOW
  // ============================================================

  /**
   * Full check-and-sync flow:
   * 1. Fetch external source
   * 2. Parse weapons
   * 3. Compare with DB
   * 4. Upsert new/changed
   */
  async function checkForUpdates() {
    if (_state.isRunning) {
      log('Sync already in progress, skipping', 'warn');
      return { skipped: true };
    }

    _state.isRunning = true;
    if (_callbacks.onStart) _callbacks.onStart();

    var result = {
      success: false,
      fetched: 0,
      newWeapons: 0,
      updatedWeapons: 0,
      unchanged: 0,
      errors: [],
      duration: 0
    };

    var startTime = Date.now();

    try {
      // Step 1: Fetch HTML
      log('Step 1/4: Fetching weapon data from external source...', 'info');
      if (_callbacks.onProgress) _callbacks.onProgress(1, 4, 'Fetching data...');

      var html = await fetchSourceHTML();
      if (!html || html.length < 1000) {
        throw new Error('Fetched HTML too short (' + (html ? html.length : 0) + ' chars)');
      }
      log('Fetched ' + html.length + ' chars of HTML', 'info');

      // Step 2: Parse weapons
      log('Step 2/4: Parsing weapon data...', 'info');
      if (_callbacks.onProgress) _callbacks.onProgress(2, 4, 'Parsing weapons...');

      var parsed = parseWeaponsFromHTML(html);
      result.fetched = parsed.length;
      log('Parsed ' + parsed.length + ' weapons from source', 'info');

      if (parsed.length === 0) {
        // Fallback: try loading from local JSON
        log('No weapons parsed from HTML. Trying local JSON fallback...', 'warn');
        var localData = await fetchLocalJSON();
        if (localData && localData.length > 0) {
          parsed = localData;
          result.fetched = parsed.length;
          log('Loaded ' + parsed.length + ' weapons from local JSON', 'info');
        } else {
          throw new Error('No weapons found in source or local fallback');
        }
      }

      // Normalize
      var normalized = parsed.map(normalizeWeapon);

      // Fingerprint check (skip if unchanged)
      var newFingerprint = computeFingerprint(normalized);
      if (newFingerprint === _state.lastFingerprint) {
        log('Data unchanged (fingerprint match). Skipping sync.', 'info');
        result.success = true;
        result.unchanged = normalized.length;
        _state.lastCheck = new Date().toISOString();
        saveState();
        _state.isRunning = false;
        if (_callbacks.onComplete) _callbacks.onComplete(result);
        return result;
      }

      // Step 3: Compare with existing DB
      log('Step 3/4: Comparing with database...', 'info');
      if (_callbacks.onProgress) _callbacks.onProgress(3, 4, 'Comparing...');

      var existing = [];
      if (typeof WeaponDB !== 'undefined') {
        existing = await WeaponDB.fetchAll();
      }
      log('Existing weapons in DB: ' + existing.length, 'info');

      var diff = diffWeapons(normalized, existing);
      result.newWeapons = diff.newWeapons.length;
      result.updatedWeapons = diff.updatedWeapons.length;
      result.unchanged = diff.unchangedCount;

      log('Diff result: ' + diff.newWeapons.length + ' new, ' +
        diff.updatedWeapons.length + ' updated, ' +
        diff.unchangedCount + ' unchanged', 'info');

      // Step 4: Sync to Supabase
      if (diff.newWeapons.length > 0 || diff.updatedWeapons.length > 0) {
        log('Step 4/4: Syncing to Supabase...', 'info');
        if (_callbacks.onProgress) _callbacks.onProgress(4, 4, 'Syncing...');

        if (false) {
          var syncResult = await syncToSupabase(diff);
          result.errors = syncResult.errors;
          _state.totalSynced += syncResult.inserted + syncResult.updated;
        } else {
          log('Supabase not connected. Returning diff only.', 'warn');
        }
      } else {
        log('Step 4/4: No changes to sync.', 'info');
        if (_callbacks.onProgress) _callbacks.onProgress(4, 4, 'No changes');
      }

      // Update state
      _state.lastCheck = new Date().toISOString();
      _state.lastFingerprint = newFingerprint;
      saveState();

      result.success = true;
      result.duration = Date.now() - startTime;
      log('Sync complete in ' + (result.duration / 1000).toFixed(1) + 's', 'success');

    } catch (err) {
      result.errors.push(err.message);
      log('Sync failed: ' + err.message, 'error');
    }

    _state.isRunning = false;
    if (_callbacks.onComplete) _callbacks.onComplete(result);
    return result;
  }


  // ============================================================
  // LOCAL JSON FALLBACK
  // ============================================================

  async function fetchLocalJSON() {
    try {
      var res = await fetch('data/weapons.json');
      if (!res.ok) return [];
      var data = await res.json();
      var weapons = data.weapons || data;
      if (!Array.isArray(weapons)) return [];
      return weapons;
    } catch (e) {
      return [];
    }
  }

  /**
   * Sync from local JSON file (manual trigger).
   * Useful when external source is unreachable.
   */
  async function syncFromLocalJSON() {
    log('Syncing from local weapons.json...', 'info');
    var weapons = await fetchLocalJSON();
    if (weapons.length === 0) {
      log('No weapons in local JSON', 'error');
      return { success: false, errors: ['No local data'] };
    }

    var normalized = weapons.map(function (w) {
      // Already normalized if from our JSON
      if (w.category && w.slug) return w;
      return normalizeWeapon(w);
    });

    if (false) {
      var result = await WeaponDB.bulkImport(normalized);
      if (result.error) {
        log('Local sync error: ' + result.error.message, 'error');
        return { success: false, errors: [result.error.message] };
      }
      log('Synced ' + normalized.length + ' weapons from local JSON', 'success');
      return { success: true, count: normalized.length };
    }

    return { success: false, errors: ['Supabase not connected'] };
  }


  // ============================================================
  // AUTO-CHECK SCHEDULER
  // ============================================================

  function startAutoCheck(intervalMs) {
    stopAutoCheck();
    var interval = intervalMs || CHECK_INTERVAL;
    log('Auto-check started (every ' + (interval / 3600000).toFixed(1) + ' hours)', 'info');

    _state.autoCheckTimer = setInterval(function () {
      log('Auto-check triggered', 'info');
      checkForUpdates();
    }, interval);

    // Save preference
    try { localStorage.setItem('weapon_sync_interval', interval); } catch (e) { }
  }

  function stopAutoCheck() {
    if (_state.autoCheckTimer) {
      clearInterval(_state.autoCheckTimer);
      _state.autoCheckTimer = null;
      log('Auto-check stopped', 'info');
    }
  }

  function isAutoCheckRunning() {
    return _state.autoCheckTimer !== null;
  }


  // ============================================================
  // PUBLIC API
  // ============================================================

  function init(options) {
    loadState();
    if (options) {
      if (options.onStart) _callbacks.onStart = options.onStart;
      if (options.onProgress) _callbacks.onProgress = options.onProgress;
      if (options.onComplete) _callbacks.onComplete = options.onComplete;
      if (options.onError) _callbacks.onError = options.onError;
      if (options.onLog) _callbacks.onLog = options.onLog;
    }

    // Auto-start if previously enabled
    try {
      var savedInterval = localStorage.getItem('weapon_sync_interval');
      if (savedInterval) {
        startAutoCheck(parseInt(savedInterval));
      }
    } catch (e) { }

    log('WeaponSync initialized. Last check: ' + (_state.lastCheck || 'never'), 'info');
  }

  return {
    init: init,
    checkForUpdates: checkForUpdates,
    syncFromLocalJSON: syncFromLocalJSON,
    startAutoCheck: startAutoCheck,
    stopAutoCheck: stopAutoCheck,
    isAutoCheckRunning: isAutoCheckRunning,
    getState: function () {
      return {
        lastCheck: _state.lastCheck,
        lastFingerprint: _state.lastFingerprint,
        totalSynced: _state.totalSynced,
        isRunning: _state.isRunning,
        autoCheckActive: _state.autoCheckTimer !== null
      };
    },
    setCallbacks: function (cbs) {
      if (cbs.onStart) _callbacks.onStart = cbs.onStart;
      if (cbs.onProgress) _callbacks.onProgress = cbs.onProgress;
      if (cbs.onComplete) _callbacks.onComplete = cbs.onComplete;
      if (cbs.onError) _callbacks.onError = cbs.onError;
      if (cbs.onLog) _callbacks.onLog = cbs.onLog;
    }
  };

})();


// ---- GLOBAL EXPORTS FIX (for admin.html buttons) ----
if (typeof window !== "undefined") {
  if (typeof runLocalSync !== "undefined") window.runLocalSync = runLocalSync;
  if (typeof runManualSync !== "undefined") window.runManualSync = runManualSync;
  if (typeof toggleAutoSync !== "undefined") window.toggleAutoSync = toggleAutoSync;
}
