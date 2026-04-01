/* ============================================================
   7DS ORIGIN - SUPABASE CLIENT MODULE
   Handles all Supabase operations: Auth, CRUD, Storage, Realtime
   ============================================================ */

var SupaDB = (function () {
  var _client = null;
  var _realtimeChannel = null;

  // ---- Initialize ----
  function init() {
    if (typeof SUPABASE_URL === 'undefined' || SUPABASE_URL.includes('YOUR_PROJECT_ID')) {
      console.error('[SupaDB] Supabase URL is not configured.');
      return false;
    }
    if (typeof supabase === 'undefined' || !supabase.createClient) {
      console.error('[SupaDB] supabase is not defined. Ensure the Supabase CDN is loaded.');
      return false;
    }
    
    try {
      _client = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
      console.log("[SupaDB] Supabase client initialized");
      return true;
    } catch (error) {
      console.error("[SupaDB] Initialization failed:", error.message);
      return false;
    }
  }

  function getClient() {
    return _client;
  }

  function isConnected() {
    return _client !== null;
  }

  // ============================================================
  // AUTH - Login / Logout / Session
  // ============================================================

  async function login(email, password) {
    if (!_client) return { error: { message: 'Supabase not initialized' } };
    try {
      const result = await _client.auth.signInWithPassword({
        email: email,
        password: password
      });
      if (result.error) {
        console.error("[SupaDB] Login failure reason:", result.error.message);
        if (result.error.message.includes('fetch')) {
            console.error("[SupaDB] Connection Error: Please check your Supabase URL, Internet connection, and CORS settings in Supabase dashboard.");
        }
      } else {
        console.log("[SupaDB] Login successful");
      }
      return result;
    } catch (error) {
      console.error("[SupaDB] Login exception:", error.message);
      return { error: { message: "Network Error: Failed to connect to Supabase. Check your URL and CORS settings." } };
    }
  }

  async function logout() {
    if (!_client) return;
    const { error } = await _client.auth.signOut();
    if (error) console.error("[SupaDB] Logout error:", error.message);
    else console.log("[SupaDB] Logout successful");
  }

  async function getSession() {
    if (!_client) return null;
    const { data, error } = await _client.auth.getSession();
    if (error) {
      console.error("[SupaDB] Get session error:", error.message);
      return null;
    }
    return data.session;
  }

  async function isLoggedIn() {
    const session = await getSession();
    return session !== null;
  }

  // ============================================================
  // DATABASE - Characters
  // ============================================================

  async function fetchAll() {
    if (!_client) return [];
    const { data, error } = await _client
      .from('characters')
      .select('*')
      .order('name_en', { ascending: true });

    if (error) {
      console.error("[SupaDB] database query error (fetchAll):", error.message);
      return [];
    }
    return data;
  }

  async function fetchBySlug(slug) {
    if (!_client) return null;
    const { data, error } = await _client
      .from('characters')
      .select('*')
      .eq('slug', slug)
      .single();

    if (error) {
      console.error("[SupaDB] database query error (fetchBySlug):", error.message);
      return null;
    }
    return data;
  }

  async function insertCharacter(charData) {
    if (!_client) return { error: { message: 'Not connected' } };
    const { data, error } = await _client
      .from('characters')
      .insert([charData])
      .select()
      .single();

    if (error) console.error("[SupaDB] database query error (insert):", error.message);
    return { data, error };
  }

  async function updateCharacter(id, updates) {
    if (!_client) return { error: { message: 'Not connected' } };
    const { data, error } = await _client
      .from('characters')
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    if (error) console.error("[SupaDB] database query error (update):", error.message);
    return { data, error };
  }

  async function deleteCharacter(id) {
    if (!_client) return { error: { message: 'Not connected' } };
    const { error } = await _client
      .from('characters')
      .delete()
      .eq('id', id);

    if (error) console.error("[SupaDB] database query error (delete):", error.message);
    return { error };
  }

  async function bulkImport(characters) {
    if (!_client) return { error: { message: 'Not connected' } };
    // Strip any existing IDs and ensure slug exists
    var sanitized = characters.map(function(c) {
      var copy = Object.assign({}, c);
      delete copy.id;
      
      // Ensure slug exists (Critical fix for database constraint)
      var nameForSlug = copy.name_en || copy.name || '';
      if (!copy.slug && nameForSlug) {
        copy.slug = nameForSlug.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
      }
      // Ensure name_en is set
      if (!copy.name_en && copy.name) { copy.name_en = copy.name; }
      delete copy.name;
      
      return copy;
    });
    const { data, error } = await _client
      .from('characters')
      .insert(sanitized)
      .select();

    if (error) console.error('[SupaDB] database query error (bulkImport):', error.message);
    return { data, error };
  }

  // ============================================================
  // STORAGE - Image Operations
  // ============================================================

  async function uploadImage(file, characterSlug) {
    if (!_client) return { error: { message: 'Not connected' } };
    const ext = file.name.split('.').pop() || 'png';
    const filePath = `characters/${characterSlug}-${Date.now()}.${ext}`;

    const { data, error } = await _client.storage
      .from('character-images')
      .upload(filePath, file, {
        cacheControl: '3600',
        upsert: true
      });

    if (error) {
      console.error("[SupaDB] Storage upload error:", error.message);
      return { error, url: null };
    }

    const { data: urlData } = _client.storage
      .from('character-images')
      .getPublicUrl(filePath);

    return { error: null, url: urlData.publicUrl };
  }

  async function deleteImage(filePath) {
    if (!_client) return;
    const { error } = await _client.storage
      .from('character-images')
      .remove([filePath]);
    if (error) console.error("[SupaDB] Storage delete error:", error.message);
  }

  async function uploadCostumeImage(file, characterSlug, index) {
    if (!_client) return { error: { message: 'Not connected' } };
    const ext = file.name.split('.').pop() || 'png';
    const filePath = 'costumes/' + characterSlug + '-costume-' + index + '-' + Date.now() + '.' + ext;
    const { data, error } = await _client.storage
      .from('character-images')
      .upload(filePath, file, { cacheControl: '3600', upsert: true });
    if (error) {
      console.error("[SupaDB] Costume image upload error:", error.message);
      return { error, url: null };
    }
    const { data: urlData } = _client.storage.from('character-images').getPublicUrl(filePath);
    return { error: null, url: urlData.publicUrl };
  }

  async function uploadMaterialImage(file, characterSlug, index) {
    if (!_client) return { error: { message: 'Not connected' } };
    const ext = file.name.split('.').pop() || 'png';
    const filePath = 'materials/' + characterSlug + '-material-' + index + '-' + Date.now() + '.' + ext;
    const { data, error } = await _client.storage
      .from('character-images')
      .upload(filePath, file, { cacheControl: '3600', upsert: true });
    if (error) {
      console.error("[SupaDB] Material image upload error:", error.message);
      return { error, url: null };
    }
    const { data: urlData } = _client.storage.from('character-images').getPublicUrl(filePath);
    return { error: null, url: urlData.publicUrl };
  }

  // ============================================================
  // REALTIME - Subscriptions
  // ============================================================

  function subscribeToChanges(callback) {
    if (!_client) return;
    if (_realtimeChannel) unsubscribe();

    _realtimeChannel = _client
      .channel('characters-changes')
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'characters' },
        (payload) => {
          console.log('[SupaDB] Realtime event:', payload.eventType);
          callback(payload);
        }
      )
      .subscribe();
  }

  function unsubscribe() {
    if (_client && _realtimeChannel) {
      _client.removeChannel(_realtimeChannel);
      _realtimeChannel = null;
    }
  }

  return {
    init,
    getClient,
    isConnected,
    login,
    logout,
    getSession,
    isLoggedIn,
    fetchAll,
    fetchBySlug,
    insertCharacter,
    updateCharacter,
    deleteCharacter,
    bulkImport,
    uploadImage,
    deleteImage,
    uploadCostumeImage,
    uploadMaterialImage,
    subscribeToChanges,
    unsubscribe
  };
})();
