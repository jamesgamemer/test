/* ============================================================
   7DS ORIGIN - DATA MODULE
   Refactored to use SupaDB exclusively.
   ============================================================ */

var CharDB = (function () {
  
  async function loadAll(callback) {
    console.log("[CharDB] Loading characters from Supabase...");
    const data = await SupaDB.fetchAll();
    if (callback) callback(data);
    return data;
  }

  async function getAll() {
    return await SupaDB.fetchAll();
  }

  async function getBySlug(slug) {
    return await SupaDB.fetchBySlug(slug);
  }

  async function add(character) {
    return await SupaDB.insertCharacter(character);
  }

  async function update(id, updates) {
    return await SupaDB.updateCharacter(id, updates);
  }

  async function remove(id) {
    return await SupaDB.deleteCharacter(id);
  }

  function exportJSON(data) {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'characters_export.json';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  return {
    loadAll: loadAll,
    getAll: getAll,
    getBySlug: getBySlug,
    add: add,
    update: update,
    remove: remove,
    exportJSON: exportJSON
  };
})();
