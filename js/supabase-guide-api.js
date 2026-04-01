/* ============================================================
   7DS ORIGIN - GUIDE CMS API MODULE (LOCAL MODE)
   Replaces Supabase with localStorage for all guide operations
   ============================================================ */

var GuideAPI = (function () {

  var STORAGE_KEY = '7dso-guides';
  var BLOCKS_KEY  = '7dso-guide-blocks';
  var MEDIA_KEY   = '7dso-guide-media';

  /* ── Default guides data ── */
  function _getDefaults() {
    return [
      {
        id: 'guide-1',
        title: 'Beginner\'s Guide to 7DS Origin',
        slug: 'beginners-guide',
        description: 'Everything you need to know to get started in 7DS Origin. Learn about the basics of combat, team building, and progression.',
        cover_image: '',
        category: 'beginner',
        status: 'published',
        created_at: '2026-03-01T00:00:00Z',
        updated_at: '2026-03-01T00:00:00Z'
      },
      {
        id: 'guide-2',
        title: 'Best Team Compositions',
        slug: 'best-team-compositions',
        description: 'Discover the strongest team compositions for PvP and PvE content. Includes tier rankings and synergy explanations.',
        cover_image: '',
        category: 'strategy',
        status: 'published',
        created_at: '2026-03-05T00:00:00Z',
        updated_at: '2026-03-05T00:00:00Z'
      },
      {
        id: 'guide-3',
        title: 'Weapon Upgrade Guide',
        slug: 'weapon-upgrade-guide',
        description: 'Learn how to efficiently upgrade your weapons, which materials to farm, and the best weapons for each character.',
        cover_image: '',
        category: 'equipment',
        status: 'published',
        created_at: '2026-03-10T00:00:00Z',
        updated_at: '2026-03-10T00:00:00Z'
      }
    ];
  }

  function _loadGuides() {
    try {
      var stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        var parsed = JSON.parse(stored);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
    } catch(e) {}
    var defaults = _getDefaults();
    _saveGuides(defaults);
    return defaults;
  }

  function _saveGuides(guides) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(guides));
    } catch(e) { console.error('[GuideAPI] Save error:', e); }
  }

  function _loadBlocks() {
    try {
      var stored = localStorage.getItem(BLOCKS_KEY);
      if (stored) return JSON.parse(stored);
    } catch(e) {}
    return {};
  }

  function _saveBlocks(blocks) {
    try {
      localStorage.setItem(BLOCKS_KEY, JSON.stringify(blocks));
    } catch(e) { console.error('[GuideAPI] Save blocks error:', e); }
  }

  // ============================================================
  // GUIDES CRUD
  // ============================================================

  async function fetchAllGuides(statusFilter) {
    var guides = _loadGuides();
    if (statusFilter) {
      return guides.filter(function(g) { return g.status === statusFilter; });
    }
    return guides;
  }

  async function fetchGuideBySlug(slug) {
    var guides = _loadGuides();
    return guides.find(function(g) { return g.slug === slug; }) || null;
  }

  async function fetchGuideById(id) {
    var guides = _loadGuides();
    return guides.find(function(g) { return g.id === id || String(g.id) === String(id); }) || null;
  }

  async function createGuide(guideData) {
    var guides = _loadGuides();
    var slug = guideData.slug || (guideData.title || 'untitled').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
    var newGuide = {
      id: 'guide-' + Date.now(),
      title: guideData.title || 'Untitled Guide',
      slug: slug,
      description: guideData.description || '',
      cover_image: guideData.cover_image || '',
      category: guideData.category || 'general',
      status: guideData.status || 'draft',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };
    guides.unshift(newGuide);
    _saveGuides(guides);
    return { data: newGuide, error: null };
  }

  async function updateGuide(id, updates) {
    var guides = _loadGuides();
    var idx = -1;
    for (var i = 0; i < guides.length; i++) {
      if (String(guides[i].id) === String(id)) { idx = i; break; }
    }
    if (idx === -1) return { data: null, error: { message: 'Guide not found' } };

    for (var key in updates) {
      if (updates.hasOwnProperty(key)) {
        guides[idx][key] = updates[key];
      }
    }
    guides[idx].updated_at = new Date().toISOString();
    _saveGuides(guides);
    return { data: guides[idx], error: null };
  }

  async function deleteGuide(id) {
    var guides = _loadGuides();
    guides = guides.filter(function(g) { return String(g.id) !== String(id); });
    _saveGuides(guides);

    /* Also delete blocks for this guide */
    var allBlocks = _loadBlocks();
    delete allBlocks[id];
    _saveBlocks(allBlocks);

    return { error: null };
  }

  // ============================================================
  // GUIDE BLOCKS CRUD
  // ============================================================

  async function fetchBlocks(guideId) {
    var allBlocks = _loadBlocks();
    var blocks = allBlocks[guideId] || [];
    return blocks.sort(function(a, b) { return (a.position || 0) - (b.position || 0); });
  }

  async function insertBlock(blockData) {
    var allBlocks = _loadBlocks();
    var guideId = blockData.guide_id;
    if (!allBlocks[guideId]) allBlocks[guideId] = [];

    var newBlock = {
      id: 'block-' + Date.now() + '-' + Math.random().toString(36).substr(2, 5),
      guide_id: guideId,
      type: blockData.type,
      content: blockData.content || {},
      position: blockData.position || allBlocks[guideId].length
    };
    allBlocks[guideId].push(newBlock);
    _saveBlocks(allBlocks);
    return { data: newBlock, error: null };
  }

  async function updateBlock(id, updates) {
    var allBlocks = _loadBlocks();
    for (var gid in allBlocks) {
      var blocks = allBlocks[gid];
      for (var i = 0; i < blocks.length; i++) {
        if (String(blocks[i].id) === String(id)) {
          for (var key in updates) {
            if (updates.hasOwnProperty(key)) {
              blocks[i][key] = updates[key];
            }
          }
          _saveBlocks(allBlocks);
          return { data: blocks[i], error: null };
        }
      }
    }
    return { data: null, error: { message: 'Block not found' } };
  }

  async function deleteBlock(id) {
    var allBlocks = _loadBlocks();
    for (var gid in allBlocks) {
      allBlocks[gid] = allBlocks[gid].filter(function(b) { return String(b.id) !== String(id); });
    }
    _saveBlocks(allBlocks);
    return { error: null };
  }

  async function saveAllBlocks(guideId, blocks) {
    var allBlocks = _loadBlocks();
    allBlocks[guideId] = (blocks || []).map(function(b, i) {
      return {
        id: b.id || ('block-' + Date.now() + '-' + i),
        guide_id: guideId,
        type: b.type,
        content: b.content || {},
        position: i
      };
    });
    _saveBlocks(allBlocks);
    return { data: allBlocks[guideId], error: null };
  }

  // ============================================================
  // MEDIA (localStorage - store as data URLs for small files)
  // ============================================================

  async function uploadMedia(file, guideId) {
    try {
      return new Promise(function(resolve) {
        var reader = new FileReader();
        reader.onload = function(e) {
          var dataUrl = e.target.result;
          var mediaList = JSON.parse(localStorage.getItem(MEDIA_KEY) || '[]');
          var entry = {
            id: 'media-' + Date.now(),
            url: dataUrl,
            type: file.type.startsWith('video') ? 'video' : 'image',
            filename: file.name,
            guide_id: guideId || null,
            created_at: new Date().toISOString()
          };
          mediaList.unshift(entry);
          /* Keep only last 50 media items to avoid localStorage overflow */
          if (mediaList.length > 50) mediaList = mediaList.slice(0, 50);
          localStorage.setItem(MEDIA_KEY, JSON.stringify(mediaList));
          resolve({ error: null, url: dataUrl });
        };
        reader.onerror = function() {
          resolve({ error: { message: 'Failed to read file' }, url: null });
        };
        reader.readAsDataURL(file);
      });
    } catch(e) {
      return { error: e, url: null };
    }
  }

  async function fetchMedia(guideId) {
    try {
      var mediaList = JSON.parse(localStorage.getItem(MEDIA_KEY) || '[]');
      if (guideId) {
        return mediaList.filter(function(m) { return m.guide_id === guideId; });
      }
      return mediaList;
    } catch(e) { return []; }
  }

  // ============================================================
  // PUBLIC API
  // ============================================================

  return {
    fetchAllGuides: fetchAllGuides,
    fetchGuideBySlug: fetchGuideBySlug,
    fetchGuideById: fetchGuideById,
    createGuide: createGuide,
    updateGuide: updateGuide,
    deleteGuide: deleteGuide,
    fetchBlocks: fetchBlocks,
    insertBlock: insertBlock,
    updateBlock: updateBlock,
    deleteBlock: deleteBlock,
    saveAllBlocks: saveAllBlocks,
    uploadMedia: uploadMedia,
    fetchMedia: fetchMedia
  };

})();
