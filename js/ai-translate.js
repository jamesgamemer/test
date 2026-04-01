/* ============================================================
   7DS ORIGIN - AI AUTO-TRANSLATION MODULE
   
   Translates English content → Thai using OpenAI API (gpt-4.1-mini).
   Features:
     - IndexedDB local cache (30-day TTL)
     - Supabase shared cache (cross-device)
     - Skip-if-exists: never overwrite existing Thai text
     - Batch processing: groups short texts into single API calls
     - Rate limiting: max 5 concurrent, 500ms between batches
     - Game-aware system prompt for consistent terminology
   
   Usage:
     AITranslate.init({ apiKey: '...' });
     AITranslate.translateText('Hello world');
     AITranslate.translateWeapons(weaponsArray, onProgress);
     AITranslate.translateCharacters(charsArray, onProgress);
   ============================================================ */

var AITranslate = (function () {
  'use strict';

  // ── Configuration ──
  var _config = {
    apiKey: '',
    model: 'gpt-4.1-mini',
    baseUrl: 'https://api.openai.com/v1',
    maxConcurrent: 5,
    batchDelay: 500,
    cacheTTL: 30 * 24 * 60 * 60 * 1000, // 30 days in ms
    shortTextLimit: 50,
    mediumTextLimit: 500,
    shortBatchSize: 20,
    mediumBatchSize: 5
  };

  var _dbName = '7ds_translation_cache';
  var _storeName = 'translations';
  var _db = null;
  var _activeRequests = 0;
  var _initialized = false;

  // ── Game-Specific System Prompt ──
  var SYSTEM_PROMPT = [
    'You are a professional game localization translator for "The Seven Deadly Sins: Origin" (7DS Origin), a mobile RPG by Netmarble.',
    'Translate the following English text into Thai.',
    '',
    'Rules:',
    '- Maintain the original tone and style (fantasy RPG)',
    '- Keep proper nouns, character names, skill names, and game-specific terms in English',
    '- Keep numbers, percentages, and stat values unchanged',
    '- Keep HTML tags unchanged if present',
    '- Use formal Thai (ราชาศัพท์ is NOT needed, use standard polite Thai)',
    '- For weapon/item descriptions, use concise and impactful Thai phrasing',
    '- Common game terms to keep in English: ATK, DEF, HP, Crit Rate, Crit DMG, DPS, Burst, Skill, Ultimate',
    '- Weapon categories keep English: Longsword, Greatsword, Staff, Wand, etc.',
    '',
    'If given multiple texts in numbered format (1. text\\n2. text), translate each one and return in the same numbered format.'
  ].join('\n');


  // ============================================================
  // INDEXEDDB CACHE LAYER
  // ============================================================

  function openDB() {
    return new Promise(function (resolve, reject) {
      if (_db) { resolve(_db); return; }
      var req = indexedDB.open(_dbName, 1);
      req.onupgradeneeded = function (e) {
        var db = e.target.result;
        if (!db.objectStoreNames.contains(_storeName)) {
          var store = db.createObjectStore(_storeName, { keyPath: 'hash' });
          store.createIndex('timestamp', 'timestamp', { unique: false });
        }
      };
      req.onsuccess = function (e) { _db = e.target.result; resolve(_db); };
      req.onerror = function (e) { reject(e.target.error); };
    });
  }

  function hashText(text) {
    // Simple FNV-1a hash for fast cache key generation
    var hash = 0x811c9dc5;
    for (var i = 0; i < text.length; i++) {
      hash ^= text.charCodeAt(i);
      hash = (hash * 0x01000193) >>> 0;
    }
    return 'en_th_' + hash.toString(16);
  }

  function getCached(text) {
    return openDB().then(function (db) {
      return new Promise(function (resolve, reject) {
        var tx = db.transaction(_storeName, 'readonly');
        var store = tx.objectStore(_storeName);
        var key = hashText(text);
        var req = store.get(key);
        req.onsuccess = function () {
          var result = req.result;
          if (result && (Date.now() - result.timestamp < _config.cacheTTL)) {
            resolve(result.translated);
          } else {
            resolve(null);
          }
        };
        req.onerror = function () { resolve(null); };
      });
    }).catch(function () { return null; });
  }

  function setCache(text, translated) {
    return openDB().then(function (db) {
      return new Promise(function (resolve) {
        var tx = db.transaction(_storeName, 'readwrite');
        var store = tx.objectStore(_storeName);
        store.put({
          hash: hashText(text),
          source: text,
          translated: translated,
          timestamp: Date.now()
        });
        tx.oncomplete = function () { resolve(); };
        tx.onerror = function () { resolve(); };
      });
    }).catch(function () { });
  }

  function clearExpiredCache() {
    return openDB().then(function (db) {
      return new Promise(function (resolve) {
        var tx = db.transaction(_storeName, 'readwrite');
        var store = tx.objectStore(_storeName);
        var cutoff = Date.now() - _config.cacheTTL;
        var idx = store.index('timestamp');
        var range = IDBKeyRange.upperBound(cutoff);
        var req = idx.openCursor(range);
        var count = 0;
        req.onsuccess = function (e) {
          var cursor = e.target.result;
          if (cursor) {
            cursor.delete();
            count++;
            cursor.continue();
          } else {
            console.log('[AITranslate] Cleared ' + count + ' expired cache entries');
            resolve(count);
          }
        };
        req.onerror = function () { resolve(0); };
      });
    }).catch(function () { return 0; });
  }

  function getCacheStats() {
    return openDB().then(function (db) {
      return new Promise(function (resolve) {
        var tx = db.transaction(_storeName, 'readonly');
        var store = tx.objectStore(_storeName);
        var countReq = store.count();
        countReq.onsuccess = function () {
          resolve({ entries: countReq.result });
        };
        countReq.onerror = function () { resolve({ entries: 0 }); };
      });
    }).catch(function () { return { entries: 0 }; });
  }


  // ============================================================
  // SUPABASE CACHE LAYER (shared across admin devices)
  // ============================================================

  function getSupabaseCached(text) {
    if (typeof SupaDB === 'undefined' || !false /* local mode */) return Promise.resolve(null);
    var key = hashText(text);
    return null /* local mode */
      .from('translation_cache')
      .select('translated_text')
      .eq('source_hash', key)
      .single()
      .then(function (res) {
        if (res.data && res.data.translated_text) {
          // Also store in local IndexedDB for faster future lookups
          setCache(text, res.data.translated_text);
          return res.data.translated_text;
        }
        return null;
      })
      .catch(function () { return null; });
  }

  function setSupabaseCache(text, translated) {
    if (typeof SupaDB === 'undefined' || !false /* local mode */) return Promise.resolve();
    var key = hashText(text);
    return null /* local mode */
      .from('translation_cache')
      .upsert({
        source_hash: key,
        source_text: text.substring(0, 5000),
        source_lang: 'en',
        target_lang: 'th',
        translated_text: translated,
        model: _config.model
      }, { onConflict: 'source_hash' })
      .then(function () { })
      .catch(function () { });
  }


  // ============================================================
  // OPENAI API LAYER
  // ============================================================

  function waitForSlot() {
    return new Promise(function (resolve) {
      function check() {
        if (_activeRequests < _config.maxConcurrent) {
          _activeRequests++;
          resolve();
        } else {
          setTimeout(check, 100);
        }
      }
      check();
    });
  }

  function releaseSlot() {
    _activeRequests = Math.max(0, _activeRequests - 1);
  }

  function callOpenAI(userMessage) {
    if (!_config.apiKey) {
      return Promise.reject(new Error('OpenAI API key not configured. Set it in Admin > Settings.'));
    }

    return waitForSlot().then(function () {
      return fetch(_config.baseUrl + '/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer ' + _config.apiKey
        },
        body: JSON.stringify({
          model: _config.model,
          messages: [
            { role: 'system', content: SYSTEM_PROMPT },
            { role: 'user', content: userMessage }
          ],
          temperature: 0.3,
          max_tokens: 4096
        })
      })
        .then(function (res) {
          if (!res.ok) {
            return res.json().then(function (err) {
              throw new Error('OpenAI API error: ' + (err.error ? err.error.message : res.status));
            });
          }
          return res.json();
        })
        .then(function (data) {
          releaseSlot();
          if (data.choices && data.choices[0] && data.choices[0].message) {
            return data.choices[0].message.content.trim();
          }
          throw new Error('Unexpected API response format');
        })
        .catch(function (err) {
          releaseSlot();
          throw err;
        });
    });
  }


  // ============================================================
  // TRANSLATION CORE
  // ============================================================

  /**
   * Translate a single text string EN → TH.
   * Checks IndexedDB cache → Supabase cache → API call.
   * @param {string} text - English source text
   * @returns {Promise<string>} Thai translated text
   */
  function translateText(text) {
    if (!text || !text.trim()) return Promise.resolve('');

    var trimmed = text.trim();

    // Layer 1: IndexedDB cache
    return getCached(trimmed).then(function (cached) {
      if (cached) {
        console.log('[AITranslate] Cache hit (local): ' + trimmed.substring(0, 40) + '...');
        return cached;
      }

      // Layer 2: Supabase cache
      return getSupabaseCached(trimmed).then(function (sbCached) {
        if (sbCached) {
          console.log('[AITranslate] Cache hit (supabase): ' + trimmed.substring(0, 40) + '...');
          return sbCached;
        }

        // Layer 3: API call
        console.log('[AITranslate] API call: ' + trimmed.substring(0, 40) + '...');
        return callOpenAI('Translate to Thai:\n\n' + trimmed).then(function (translated) {
          // Store in both caches
          setCache(trimmed, translated);
          setSupabaseCache(trimmed, translated);
          return translated;
        });
      });
    });
  }

  /**
   * Translate multiple texts in a batch (single API call).
   * Returns array of translations in same order.
   * @param {string[]} texts - Array of English texts
   * @returns {Promise<string[]>} Array of Thai translations
   */
  function translateBatch(texts) {
    if (!texts || texts.length === 0) return Promise.resolve([]);

    // Check cache for each text first
    var cachePromises = texts.map(function (t) { return getCached(t.trim()); });

    return Promise.all(cachePromises).then(function (cachedResults) {
      var uncachedIndices = [];
      var uncachedTexts = [];

      cachedResults.forEach(function (cached, i) {
        if (!cached) {
          uncachedIndices.push(i);
          uncachedTexts.push(texts[i].trim());
        }
      });

      // All cached
      if (uncachedTexts.length === 0) {
        console.log('[AITranslate] Batch fully cached (' + texts.length + ' items)');
        return cachedResults;
      }

      // Build numbered prompt for uncached texts
      var numberedPrompt = 'Translate each numbered item to Thai. Return in the same numbered format:\n\n';
      uncachedTexts.forEach(function (t, i) {
        numberedPrompt += (i + 1) + '. ' + t + '\n';
      });

      console.log('[AITranslate] Batch API call: ' + uncachedTexts.length + ' items (of ' + texts.length + ' total)');

      return callOpenAI(numberedPrompt).then(function (response) {
        // Parse numbered response
        var parsed = parseNumberedResponse(response, uncachedTexts.length);
        var results = cachedResults.slice();

        // Fill in translations and cache them
        var cacheOps = [];
        uncachedIndices.forEach(function (origIdx, j) {
          var translated = parsed[j] || '';
          results[origIdx] = translated;
          if (translated) {
            cacheOps.push(setCache(uncachedTexts[j], translated));
            cacheOps.push(setSupabaseCache(uncachedTexts[j], translated));
          }
        });

        // Fire-and-forget cache writes
        Promise.all(cacheOps).catch(function () { });

        return results;
      });
    });
  }

  /**
   * Parse a numbered response like "1. ข้อความ\n2. ข้อความ"
   */
  function parseNumberedResponse(response, expectedCount) {
    var results = [];
    var lines = response.split('\n');
    var currentNum = 0;
    var currentText = '';

    lines.forEach(function (line) {
      var match = line.match(/^(\d+)\.\s*(.*)$/);
      if (match) {
        if (currentNum > 0 && currentText) {
          results[currentNum - 1] = currentText.trim();
        }
        currentNum = parseInt(match[1]);
        currentText = match[2];
      } else if (currentNum > 0) {
        currentText += '\n' + line;
      }
    });

    // Push last item
    if (currentNum > 0 && currentText) {
      results[currentNum - 1] = currentText.trim();
    }

    // Ensure array has correct length
    while (results.length < expectedCount) {
      results.push('');
    }

    return results;
  }


  // ============================================================
  // WEAPON TRANSLATION
  // ============================================================

  /**
   * Translate all weapons that have empty Thai fields.
   * @param {Array} weapons - Array of weapon objects
   * @param {Function} onProgress - Callback(current, total, weaponName)
   * @returns {Promise<Array>} Array of { id, updates } for Supabase update
   */
  function translateWeapons(weapons, onProgress) {
    if (!weapons || weapons.length === 0) return Promise.resolve([]);

    var updates = [];
    var total = weapons.length;
    var current = 0;

    // Collect all translatable fields
    var nameTexts = [];
    var passiveNameTexts = [];
    var passiveDescTexts = [];
    var loreTexts = [];
    var weaponMap = [];

    weapons.forEach(function (w) {
      var needs = {};
      if (w.name_en && !w.name_th) needs.name = w.name_en;
      if (w.passive_name_en && !w.passive_name_th) needs.passiveName = w.passive_name_en;
      if (w.passive_desc_en && !w.passive_desc_th) needs.passiveDesc = w.passive_desc_en;
      if (w.lore_en && !w.lore_th) needs.lore = w.lore_en;

      if (Object.keys(needs).length > 0) {
        weaponMap.push({ weapon: w, needs: needs });
      }
    });

    if (weaponMap.length === 0) {
      console.log('[AITranslate] All weapons already translated');
      if (onProgress) onProgress(total, total, 'Complete');
      return Promise.resolve([]);
    }

    console.log('[AITranslate] Translating ' + weaponMap.length + ' weapons with missing Thai text');

    // Batch names (short texts)
    weaponMap.forEach(function (item) {
      if (item.needs.name) nameTexts.push(item.needs.name);
      if (item.needs.passiveName) passiveNameTexts.push(item.needs.passiveName);
    });

    // Process in sequential batches to respect rate limits
    function processBatches() {
      var allResults = [];

      // Step 1: Translate names in batches
      return batchProcess(nameTexts, _config.shortBatchSize, 'weapon names')
        .then(function (nameResults) {
          allResults.push({ type: 'name', results: nameResults });

          // Step 2: Translate passive names
          return batchProcess(passiveNameTexts, _config.shortBatchSize, 'passive names');
        })
        .then(function (passiveNameResults) {
          allResults.push({ type: 'passiveName', results: passiveNameResults });

          // Step 3: Translate passive descriptions (medium texts, smaller batches)
          var descTexts = weaponMap
            .filter(function (item) { return item.needs.passiveDesc; })
            .map(function (item) { return item.needs.passiveDesc; });
          return batchProcess(descTexts, _config.mediumBatchSize, 'passive descriptions');
        })
        .then(function (descResults) {
          allResults.push({ type: 'passiveDesc', results: descResults });

          // Step 4: Translate lore (long texts, one at a time)
          var loreItems = weaponMap
            .filter(function (item) { return item.needs.lore; })
            .map(function (item) { return item.needs.lore; });
          return batchProcess(loreItems, 1, 'lore texts');
        })
        .then(function (loreResults) {
          allResults.push({ type: 'lore', results: loreResults });

          // Map results back to weapons
          var nameIdx = 0, passiveNameIdx = 0, descIdx = 0, loreIdx = 0;

          weaponMap.forEach(function (item, i) {
            var update = {};
            if (item.needs.name) {
              update.name_th = allResults[0].results[nameIdx++] || '';
            }
            if (item.needs.passiveName) {
              update.passive_name_th = allResults[1].results[passiveNameIdx++] || '';
            }
            if (item.needs.passiveDesc) {
              update.passive_desc_th = allResults[2].results[descIdx++] || '';
            }
            if (item.needs.lore) {
              update.lore_th = allResults[3].results[loreIdx++] || '';
            }

            if (Object.keys(update).length > 0) {
              updates.push({ id: item.weapon.id, slug: item.weapon.slug, updates: update });
            }

            current++;
            if (onProgress) onProgress(current, weaponMap.length, item.weapon.name_en || item.weapon.slug);
          });

          return updates;
        });
    }

    return processBatches();
  }

  /**
   * Process an array of texts in batches with delay between each batch.
   */
  function batchProcess(texts, batchSize, label) {
    if (!texts || texts.length === 0) return Promise.resolve([]);

    var batches = [];
    for (var i = 0; i < texts.length; i += batchSize) {
      batches.push(texts.slice(i, i + batchSize));
    }

    console.log('[AITranslate] Processing ' + texts.length + ' ' + label + ' in ' + batches.length + ' batch(es)');

    var allResults = [];
    var chain = Promise.resolve();

    batches.forEach(function (batch, idx) {
      chain = chain.then(function () {
        if (idx > 0) {
          return delay(_config.batchDelay).then(function () {
            return translateBatch(batch);
          });
        }
        return translateBatch(batch);
      }).then(function (results) {
        allResults = allResults.concat(results);
      });
    });

    return chain.then(function () { return allResults; });
  }


  // ============================================================
  // CHARACTER TRANSLATION
  // ============================================================

  /**
   * Translate character descriptions that have empty Thai text.
   * Characters use a single 'description' field, so we translate
   * and return updates to store in a new 'description_th' field or JSONB.
   * @param {Array} characters - Array of character objects
   * @param {Function} onProgress - Callback(current, total, charName)
   * @returns {Promise<Array>} Array of { id, updates }
   */
  function translateCharacters(characters, onProgress) {
    if (!characters || characters.length === 0) return Promise.resolve([]);

    var toTranslate = characters.filter(function (c) {
      return c.description && (!c.description_th || c.description_th === '');
    });

    if (toTranslate.length === 0) {
      console.log('[AITranslate] All characters already translated');
      if (onProgress) onProgress(characters.length, characters.length, 'Complete');
      return Promise.resolve([]);
    }

    var texts = toTranslate.map(function (c) { return c.description; });
    var updates = [];

    return batchProcess(texts, _config.mediumBatchSize, 'character descriptions')
      .then(function (results) {
        toTranslate.forEach(function (c, i) {
          if (results[i]) {
            updates.push({
              id: c.id,
              slug: c.slug,
              updates: { description_th: results[i] }
            });
          }
          if (onProgress) onProgress(i + 1, toTranslate.length, c.name_en || c.name || c.slug);
        });
        return updates;
      });
  }


  // ============================================================
  // GUIDE TRANSLATION
  // ============================================================

  /**
   * Translate guide title and description.
   * @param {Object} guide - Guide object with title, description
   * @returns {Promise<Object>} { title_th, description_th }
   */
  function translateGuide(guide) {
    if (!guide) return Promise.resolve({});

    var promises = [];
    var fields = [];

    if (guide.title && !guide.title_th) {
      promises.push(translateText(guide.title));
      fields.push('title_th');
    }
    if (guide.description && !guide.description_th) {
      promises.push(translateText(guide.description));
      fields.push('description_th');
    }

    if (promises.length === 0) return Promise.resolve({});

    return Promise.all(promises).then(function (results) {
      var updates = {};
      fields.forEach(function (field, i) {
        updates[field] = results[i] || '';
      });
      return updates;
    });
  }

  /**
   * Translate guide block content.
   * Handles different block types (heading, paragraph, list, etc.)
   * @param {Object} block - Guide block with type and content JSONB
   * @returns {Promise<Object>} Updated content with Thai translations
   */
  function translateGuideBlock(block) {
    if (!block || !block.content) return Promise.resolve(block);

    var content = typeof block.content === 'string' ? JSON.parse(block.content) : block.content;

    // Skip if already has Thai content
    if (content.text_th && content.text_th.trim()) return Promise.resolve(block);

    var textToTranslate = content.text || content.text_en || '';
    if (!textToTranslate) return Promise.resolve(block);

    return translateText(textToTranslate).then(function (translated) {
      content.text_th = translated;
      return Object.assign({}, block, { content: content });
    });
  }


  // ============================================================
  // EVENT TRANSLATION
  // ============================================================

  /**
   * Translate event title and description.
   * @param {Object} event - Event object
   * @returns {Promise<Object>} { title_th, description_th }
   */
  function translateEvent(event) {
    if (!event) return Promise.resolve({});

    var promises = [];
    var fields = [];

    if (event.title && !event.title_th) {
      promises.push(translateText(event.title));
      fields.push('title_th');
    }
    if (event.description && !event.description_th) {
      promises.push(translateText(event.description));
      fields.push('description_th');
    }

    if (promises.length === 0) return Promise.resolve({});

    return Promise.all(promises).then(function (results) {
      var updates = {};
      fields.forEach(function (field, i) {
        updates[field] = results[i] || '';
      });
      return updates;
    });
  }


  // ============================================================
  // BULK TRANSLATION (ALL CONTENT)
  // ============================================================

  /**
   * Translate all content across the entire website.
   * @param {Object} data - { weapons: [], characters: [], guides: [], events: [] }
   * @param {Function} onProgress - Callback(phase, current, total, itemName)
   * @returns {Promise<Object>} { weapons: [...updates], characters: [...], guides: [...], events: [...] }
   */
  function translateAll(data, onProgress) {
    var results = { weapons: [], characters: [], guides: [], events: [] };

    function phase(name) {
      return function (current, total, item) {
        if (onProgress) onProgress(name, current, total, item);
      };
    }

    return translateWeapons(data.weapons || [], phase('weapons'))
      .then(function (weaponUpdates) {
        results.weapons = weaponUpdates;
        return translateCharacters(data.characters || [], phase('characters'));
      })
      .then(function (charUpdates) {
        results.characters = charUpdates;

        // Translate events sequentially
        var eventUpdates = [];
        var chain = Promise.resolve();
        (data.events || []).forEach(function (ev, i) {
          chain = chain.then(function () {
            return translateEvent(ev).then(function (upd) {
              if (Object.keys(upd).length > 0) {
                eventUpdates.push({ id: ev.id, updates: upd });
              }
              if (onProgress) onProgress('events', i + 1, (data.events || []).length, ev.title || '');
            });
          });
        });

        return chain.then(function () {
          results.events = eventUpdates;
          return results;
        });
      });
  }


  // ============================================================
  // APPLY TRANSLATIONS TO SUPABASE
  // ============================================================

  /**
   * Apply weapon translation updates to Supabase.
   * @param {Array} updates - Array of { id, updates } from translateWeapons
   * @param {Function} onProgress - Callback(current, total)
   * @returns {Promise<Object>} { success: number, failed: number, errors: [] }
   */
  function applyWeaponUpdates(updates, onProgress) {
    if (!updates || updates.length === 0) return Promise.resolve({ success: 0, failed: 0, errors: [] });
    if (typeof SupaDB === 'undefined' || !false /* local mode */) {
      return Promise.reject(new Error('Supabase not connected'));
    }

    var stats = { success: 0, failed: 0, errors: [] };
    var chain = Promise.resolve();

    updates.forEach(function (item, i) {
      chain = chain.then(function () {
        return null /* local mode */
          .from('weapons')
          .update(item.updates)
          .eq('id', item.id)
          .then(function (res) {
            if (res.error) {
              stats.failed++;
              stats.errors.push({ id: item.id, error: res.error.message });
            } else {
              stats.success++;
            }
            if (onProgress) onProgress(i + 1, updates.length);
          })
          .catch(function (err) {
            stats.failed++;
            stats.errors.push({ id: item.id, error: err.message });
          });
      });
    });

    return chain.then(function () { return stats; });
  }

  /**
   * Apply character translation updates to Supabase.
   */
  function applyCharacterUpdates(updates, onProgress) {
    if (!updates || updates.length === 0) return Promise.resolve({ success: 0, failed: 0, errors: [] });
    if (typeof SupaDB === 'undefined' || !false /* local mode */) {
      return Promise.reject(new Error('Supabase not connected'));
    }

    var stats = { success: 0, failed: 0, errors: [] };
    var chain = Promise.resolve();

    updates.forEach(function (item, i) {
      chain = chain.then(function () {
        return null /* local mode */
          .from('characters')
          .update(item.updates)
          .eq('id', item.id)
          .then(function (res) {
            if (res.error) {
              stats.failed++;
              stats.errors.push({ id: item.id, error: res.error.message });
            } else {
              stats.success++;
            }
            if (onProgress) onProgress(i + 1, updates.length);
          })
          .catch(function (err) {
            stats.failed++;
            stats.errors.push({ id: item.id, error: err.message });
          });
      });
    });

    return chain.then(function () { return stats; });
  }


  // ============================================================
  // SINGLE ITEM TRANSLATION (for edit forms)
  // ============================================================

  /**
   * Translate a single weapon's empty Thai fields.
   * Returns the translated fields without saving to DB.
   * @param {Object} weapon - Weapon object with EN fields
   * @returns {Promise<Object>} Object with translated TH fields
   */
  function translateSingleWeapon(weapon) {
    var promises = [];
    var fields = [];

    if (weapon.name_en && !weapon.name_th) {
      promises.push(translateText(weapon.name_en));
      fields.push('name_th');
    }
    if (weapon.passive_name_en && !weapon.passive_name_th) {
      promises.push(translateText(weapon.passive_name_en));
      fields.push('passive_name_th');
    }
    if (weapon.passive_desc_en && !weapon.passive_desc_th) {
      promises.push(translateText(weapon.passive_desc_en));
      fields.push('passive_desc_th');
    }
    if (weapon.lore_en && !weapon.lore_th) {
      promises.push(translateText(weapon.lore_en));
      fields.push('lore_th');
    }

    if (promises.length === 0) return Promise.resolve({});

    return Promise.all(promises).then(function (results) {
      var updates = {};
      fields.forEach(function (field, i) {
        updates[field] = results[i] || '';
      });
      return updates;
    });
  }


  // ============================================================
  // API KEY MANAGEMENT
  // ============================================================

  function setApiKey(key) {
    _config.apiKey = key;
    try {
      localStorage.setItem('7ds_openai_key', key);
    } catch (e) { }
  }

  function getApiKey() {
    if (_config.apiKey) return _config.apiKey;
    try {
      return localStorage.getItem('7ds_openai_key') || '';
    } catch (e) { return ''; }
  }

  function validateApiKey(key) {
    var testKey = key || _config.apiKey;
    if (!testKey) return Promise.resolve(false);

    return fetch(_config.baseUrl + '/models', {
      method: 'GET',
      headers: { 'Authorization': 'Bearer ' + testKey }
    })
      .then(function (res) { return res.ok; })
      .catch(function () { return false; });
  }

  function hasApiKey() {
    return !!getApiKey();
  }


  // ============================================================
  // UTILITIES
  // ============================================================

  function delay(ms) {
    return new Promise(function (resolve) { setTimeout(resolve, ms); });
  }

  function getTranslationStatus(item, enFields, thFields) {
    var total = 0;
    var translated = 0;

    enFields.forEach(function (enField, i) {
      var thField = thFields[i];
      if (item[enField] && item[enField].trim()) {
        total++;
        if (item[thField] && item[thField].trim()) {
          translated++;
        }
      }
    });

    if (total === 0) return 'none';
    if (translated === total) return 'complete';
    if (translated > 0) return 'partial';
    return 'missing';
  }

  function getWeaponTranslationStatus(weapon) {
    return getTranslationStatus(
      weapon,
      ['name_en', 'passive_name_en', 'passive_desc_en', 'lore_en'],
      ['name_th', 'passive_name_th', 'passive_desc_th', 'lore_th']
    );
  }


  // ============================================================
  // INITIALIZATION
  // ============================================================

  function init(options) {
    if (options) {
      if (options.apiKey) _config.apiKey = options.apiKey;
      if (options.model) _config.model = options.model;
      if (options.baseUrl) _config.baseUrl = options.baseUrl;
    }

    // Load API key from localStorage if not provided
    if (!_config.apiKey) {
      _config.apiKey = getApiKey();
    }

    // Clean expired cache entries
    clearExpiredCache();

    _initialized = true;
    console.log('[AITranslate] Initialized. API key: ' + (_config.apiKey ? 'configured' : 'not set') +
      ', Model: ' + _config.model);
  }


  // ============================================================
  // PUBLIC API
  // ============================================================

  return {
    // Initialization
    init: init,

    // Core translation
    translateText: translateText,
    translateBatch: translateBatch,

    // Content-specific translation
    translateWeapons: translateWeapons,
    translateCharacters: translateCharacters,
    translateGuide: translateGuide,
    translateGuideBlock: translateGuideBlock,
    translateEvent: translateEvent,
    translateAll: translateAll,

    // Single item (for edit forms)
    translateSingleWeapon: translateSingleWeapon,

    // Apply to Supabase
    applyWeaponUpdates: applyWeaponUpdates,
    applyCharacterUpdates: applyCharacterUpdates,

    // API key management
    setApiKey: setApiKey,
    getApiKey: getApiKey,
    validateApiKey: validateApiKey,
    hasApiKey: hasApiKey,

    // Cache management
    getCacheStats: getCacheStats,
    clearExpiredCache: clearExpiredCache,

    // Status helpers
    getWeaponTranslationStatus: getWeaponTranslationStatus,
    getTranslationStatus: getTranslationStatus,

    // Config access
    getConfig: function () { return Object.assign({}, _config); }
  };

})();

// Auto-initialize on load
if (typeof document !== 'undefined') {
  document.addEventListener('DOMContentLoaded', function () {
    AITranslate.init();
  });
}
