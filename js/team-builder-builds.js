/* ============================================================
   7DS ORIGIN - TEAM BUILDER BUILD SYSTEM
   Save Build, Copy Link, Export Image, Clear Team
   Build data reuses existing character/weapon database IDs
   ============================================================ */
(function () {
  'use strict';

  /* ══════════════════════════════════════════════
     CONSTANTS
  ══════════════════════════════════════════════ */
  var STORAGE_KEY = '7ds_team_builds';
  var MAX_BUILDS = 50;

  /* ══════════════════════════════════════════════
     TOAST NOTIFICATION SYSTEM
  ══════════════════════════════════════════════ */
  function showToast(message, type) {
    type = type || 'info';
    var container = document.getElementById('toastContainer');
    if (!container) {
      container = document.createElement('div');
      container.id = 'toastContainer';
      container.className = 'tb-toast-container';
      document.body.appendChild(container);
    }

    var toast = document.createElement('div');
    toast.className = 'tb-toast tb-toast-' + type;

    var icons = { success: '\u2714', error: '\u2718', info: '\u2139', warning: '\u26A0' };
    toast.innerHTML =
      '<span class="tb-toast-icon">' + (icons[type] || icons.info) + '</span>' +
      '<span class="tb-toast-msg">' + message + '</span>';

    container.appendChild(toast);

    /* Animate in */
    requestAnimationFrame(function () {
      toast.classList.add('show');
    });

    /* Auto-dismiss */
    setTimeout(function () {
      toast.classList.remove('show');
      toast.classList.add('hide');
      setTimeout(function () { toast.remove(); }, 300);
    }, 3000);
  }

  /* ══════════════════════════════════════════════
     BUILD DATA SERIALIZATION
     Uses existing DB IDs (charId, weapon id)
  ══════════════════════════════════════════════ */
  function serializeBuild() {
    if (!window.__TB_getNodes || !window.__TB_getEdges) return null;

    var nodes = window.__TB_getNodes();
    var edges = window.__TB_getEdges();

    if (!nodes || nodes.length === 0) return null;

    var buildNodes = nodes.map(function (n) {
      var d = n.data || {};
      return {
        id: n.id,
        charId: d.charId || '',
        charName: d.charName || '',
        rarity: d.rarity || 'SR',
        position: { x: Math.round(n.position.x), y: Math.round(n.position.y) },
        weapons: (d.weapons || []).map(function (w) {
          if (!w) return null;
          return { id: w.id || '' };
        }),
      };
    });

    var buildEdges = edges.map(function (e) {
      return {
        source: e.source,
        target: e.target,
      };
    });

    return {
      version: 1,
      nodes: buildNodes,
      edges: buildEdges,
      timestamp: Date.now(),
    };
  }

  function encodeBuild(buildData) {
    try {
      var json = JSON.stringify(buildData);
      return btoa(unescape(encodeURIComponent(json)));
    } catch (e) {
      return null;
    }
  }

  function decodeBuild(encoded) {
    try {
      var json = decodeURIComponent(escape(atob(encoded)));
      return JSON.parse(json);
    } catch (e) {
      return null;
    }
  }

  /* ══════════════════════════════════════════════
     LOAD BUILD FROM DATA
     Restores nodes and edges from serialized data
  ══════════════════════════════════════════════ */
  function loadBuildData(buildData, allChars, allWeapons) {
    if (!buildData || !buildData.nodes || !window.__TB_clearAll) return false;

    /* Clear existing */
    window.__TB_clearAll();

    /* Small delay to let React clear state */
    setTimeout(function () {
      var nodeIdMap = {};

      buildData.nodes.forEach(function (bn) {
        /* Find character in existing database by charId */
        var charObj = allChars.find(function (c) {
          return (c.id || c.slug || '') == bn.charId;
        });

        if (!charObj) {
          /* Fallback: try to find by name */
          charObj = allChars.find(function (c) {
            return (c.name_en || c.name || '') === bn.charName;
          });
        }

        if (!charObj) return;

        /* Add node at saved position */
        var nodeId;
        if (window.__TB_addCharacterNodeAt) {
          nodeId = window.__TB_addCharacterNodeAt(charObj, bn.position.x, bn.position.y);
        } else if (window.__TB_addCharacterNode) {
          nodeId = window.__TB_addCharacterNode(charObj);
        }

        if (nodeId) {
          nodeIdMap[bn.id] = nodeId;

          /* Assign weapons */
          if (bn.weapons && window.__TB_assignWeapon) {
            bn.weapons.forEach(function (ws, idx) {
              if (!ws || !ws.id) return;
              var weaponObj = allWeapons.find(function (w) {
                return (w.id || w.slug || '') == ws.id;
              });
              if (weaponObj) {
                setTimeout(function () {
                  window.__TB_assignWeapon(nodeId, idx, weaponObj);
                }, 100 * (idx + 1));
              }
            });
          }
        }
      });

      /* Restore edges after nodes are created */
      setTimeout(function () {
        if (buildData.edges && window.__TB_setEdges) {
          var newEdges = [];
          buildData.edges.forEach(function (be) {
            var sourceId = nodeIdMap[be.source];
            var targetId = nodeIdMap[be.target];
            if (sourceId && targetId) {
              newEdges.push({
                id: 'e-' + sourceId + '-' + targetId,
                source: sourceId,
                target: targetId,
                type: 'synergy',
              });
            }
          });
          if (newEdges.length > 0) {
            var existing = window.__TB_getEdges ? window.__TB_getEdges() : [];
            window.__TB_setEdges(existing.concat(newEdges));
          }
        }

        /* Fit view after loading */
        setTimeout(function () {
          if (window.__TB_fitView) window.__TB_fitView();
        }, 300);
      }, 500);
    }, 100);

    return true;
  }

  /* ══════════════════════════════════════════════
     LOCAL STORAGE: SAVED BUILDS
  ══════════════════════════════════════════════ */
  function getSavedBuilds() {
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch (e) {
      return [];
    }
  }

  function saveBuildToStorage(name, buildData) {
    var builds = getSavedBuilds();
    var entry = {
      id: 'build-' + Date.now(),
      name: name,
      data: buildData,
      createdAt: new Date().toISOString(),
      nodeCount: buildData.nodes.length,
      charNames: buildData.nodes.map(function (n) { return n.charName; }),
    };

    builds.unshift(entry);
    if (builds.length > MAX_BUILDS) builds = builds.slice(0, MAX_BUILDS);

    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(builds));
      return entry;
    } catch (e) {
      showToast('Storage full. Please delete old builds.', 'error');
      return null;
    }
  }

  function deleteBuildFromStorage(buildId) {
    var builds = getSavedBuilds();
    builds = builds.filter(function (b) { return b.id !== buildId; });
    localStorage.setItem(STORAGE_KEY, JSON.stringify(builds));
  }

  /* ══════════════════════════════════════════════
     SAVE BUILD MODAL
  ══════════════════════════════════════════════ */
  function createSaveModal() {
    var overlay = document.createElement('div');
    overlay.id = 'saveBuildModal';
    overlay.className = 'tb-modal-overlay';
    overlay.innerHTML =
      '<div class="tb-modal">' +
        '<div class="tb-modal-header">' +
          '<div class="tb-modal-title">\uD83D\uDCBE Save Build</div>' +
          '<button class="tb-modal-close" id="saveModalClose">&times;</button>' +
        '</div>' +
        '<div class="tb-modal-body">' +
          '<div class="tb-modal-section">' +
            '<label class="tb-modal-label">Build Name</label>' +
            '<input type="text" class="tb-modal-input" id="saveBuildName" placeholder="My Awesome Team" maxlength="50">' +
          '</div>' +
          '<div class="tb-modal-preview" id="saveBuildPreview"></div>' +
          '<div class="tb-modal-section" style="display:flex;gap:8px;">' +
            '<button class="tb-modal-btn btn-primary" id="saveBuildConfirm" style="flex:1;">\uD83D\uDCBE Save to Browser</button>' +
            '<button class="tb-modal-btn" id="saveBuildCloud" style="flex:1;background:linear-gradient(135deg,#2563eb,#7c3aed);color:#fff;border:1px solid #3b82f6;">\u2601 Save to Cloud</button>' +
          '</div>' +
          '<div id="cloudSaveStatus" style="text-align:center;font-size:11px;color:#64748b;margin-top:4px;"></div>' +
          '<div class="tb-modal-divider"></div>' +
          '<div class="tb-modal-section">' +
            '<div class="tb-modal-subtitle">\uD83D\uDCBB Browser Saves</div>' +
            '<div class="tb-saved-builds-list" id="savedBuildsList"></div>' +
          '</div>' +
          '<div class="tb-modal-divider"></div>' +
          '<div class="tb-modal-section">' +
            '<div class="tb-modal-subtitle">\u2601 Cloud Saves</div>' +
            '<div class="tb-saved-builds-list" id="cloudBuildsList"></div>' +
          '</div>' +
        '</div>' +
      '</div>';

    document.body.appendChild(overlay);
    return overlay;
  }

  function openSaveModal(allChars, allWeapons) {
    var modal = document.getElementById('saveBuildModal') || createSaveModal();
    var nameInput = document.getElementById('saveBuildName');
    var preview = document.getElementById('saveBuildPreview');
    var confirmBtn = document.getElementById('saveBuildConfirm');
    var cloudBtn = document.getElementById('saveBuildCloud');
    var cloudStatus = document.getElementById('cloudSaveStatus');
    var closeBtn = document.getElementById('saveModalClose');
    var listEl = document.getElementById('savedBuildsList');
    var cloudListEl = document.getElementById('cloudBuildsList');

    /* Generate preview */
    var buildData = serializeBuild();
    if (!buildData) {
      showToast('Add characters to the canvas first!', 'warning');
      return;
    }

    /* Show character preview */
    var previewHtml = '<div class="tb-save-preview-chars">';
    buildData.nodes.forEach(function (n) {
      var charObj = allChars.find(function (c) { return (c.id || c.slug || '') == n.charId; });
      var img = charObj ? (charObj.image || '') : '';
      previewHtml +=
        '<div class="tb-save-preview-char">' +
          (img ? '<img src="' + img + '" alt="' + n.charName + '">' : '') +
          '<span>' + n.charName + '</span>' +
        '</div>';
    });
    previewHtml += '</div>';
    previewHtml += '<div class="tb-save-preview-info">' +
      n_nodes(buildData) + ' characters, ' +
      n_weapons(buildData) + ' weapons, ' +
      buildData.edges.length + ' connections' +
    '</div>';
    preview.innerHTML = previewHtml;

    /* Default name */
    var charNames = buildData.nodes.map(function (n) { return n.charName; });
    nameInput.value = charNames.slice(0, 3).join(' + ') + (charNames.length > 3 ? ' +' + (charNames.length - 3) : '');

    /* Render saved builds list (browser) */
    renderSavedBuildsList(listEl, allChars, allWeapons);

    /* Render cloud builds list */
    renderCloudBuildsList(cloudListEl, allChars, allWeapons);

    /* Update cloud save status */
    if (cloudStatus) {
      if (typeof UserAuth !== 'undefined' && UserAuth.isLoggedIn()) {
        cloudStatus.innerHTML = '<span style="color:#22c55e;">\u2713 Signed in as ' + escHtml(UserAuth.getDisplayName()) + '</span>';
      } else {
        cloudStatus.innerHTML = '<span style="color:#f0c040;">Sign in to save builds to cloud</span>';
      }
    }

    /* Confirm save (browser) */
    var newConfirm = confirmBtn.cloneNode(true);
    confirmBtn.parentNode.replaceChild(newConfirm, confirmBtn);
    newConfirm.addEventListener('click', function () {
      var name = nameInput.value.trim();
      if (!name) { nameInput.focus(); return; }
      var entry = saveBuildToStorage(name, buildData);
      if (entry) {
        showToast('Build "' + name + '" saved to browser!', 'success');
        renderSavedBuildsList(listEl, allChars, allWeapons);
        nameInput.value = '';
      }
    });

    /* Cloud save */
    if (cloudBtn) {
      var newCloud = cloudBtn.cloneNode(true);
      cloudBtn.parentNode.replaceChild(newCloud, cloudBtn);
      newCloud.addEventListener('click', async function () {
        if (typeof UserAuth === 'undefined' || !UserAuth.isLoggedIn()) {
          showToast('Please sign in first to save to cloud!', 'warning');
          if (typeof window.openLoginModal === 'function') window.openLoginModal();
          return;
        }
        var name = nameInput.value.trim();
        if (!name) { nameInput.focus(); return; }
        newCloud.disabled = true;
        newCloud.textContent = 'Saving...';
        if (typeof window.saveUserBuildToSupabase === 'function') {
          var ok = await window.saveUserBuildToSupabase(name, buildData);
          if (ok) {
            showToast('Build "' + name + '" saved to cloud!', 'success');
            renderCloudBuildsList(cloudListEl, allChars, allWeapons);
            nameInput.value = '';
          } else {
            showToast('Cloud save failed. Try again.', 'error');
          }
        } else {
          showToast('Cloud save not available', 'error');
        }
        newCloud.disabled = false;
        newCloud.textContent = '\u2601 Save to Cloud';
      });
    }

    /* Close */
    var newClose = closeBtn.cloneNode(true);
    closeBtn.parentNode.replaceChild(newClose, closeBtn);
    newClose.addEventListener('click', function () { modal.classList.remove('active'); });
    modal.addEventListener('click', function (e) {
      if (e.target === modal) modal.classList.remove('active');
    });

    modal.classList.add('active');
    setTimeout(function () { nameInput.focus(); }, 100);
  }

  function n_nodes(bd) { return bd.nodes.length; }
  function n_weapons(bd) {
    var count = 0;
    bd.nodes.forEach(function (n) {
      (n.weapons || []).forEach(function (w) { if (w) count++; });
    });
    return count;
  }

  function renderSavedBuildsList(listEl, allChars, allWeapons) {
    var builds = getSavedBuilds();
    if (builds.length === 0) {
      listEl.innerHTML = '<div class="tb-saved-empty">No saved builds yet</div>';
      return;
    }

    var html = '';
    builds.forEach(function (b) {
      var date = new Date(b.createdAt).toLocaleDateString();
      var chars = (b.charNames || []).join(', ');
      html +=
        '<div class="tb-saved-build-item" data-build-id="' + b.id + '">' +
          '<div class="tb-saved-build-info">' +
            '<div class="tb-saved-build-name">' + escHtml(b.name) + '</div>' +
            '<div class="tb-saved-build-meta">' + (b.nodeCount || 0) + ' chars &bull; ' + date + '</div>' +
            '<div class="tb-saved-build-chars">' + escHtml(chars) + '</div>' +
          '</div>' +
          '<div class="tb-saved-build-actions">' +
            '<button class="tb-saved-btn tb-saved-load" data-action="load" title="Load Build">\u25B6</button>' +
            '<button class="tb-saved-btn tb-saved-delete" data-action="delete" title="Delete">\uD83D\uDDD1</button>' +
          '</div>' +
        '</div>';
    });
    listEl.innerHTML = html;

    /* Bind events */
    listEl.querySelectorAll('.tb-saved-build-item').forEach(function (item) {
      var buildId = item.getAttribute('data-build-id');

      item.querySelector('[data-action="load"]').addEventListener('click', function (e) {
        e.stopPropagation();
        var build = builds.find(function (b) { return b.id === buildId; });
        if (build && build.data) {
          loadBuildData(build.data, allChars, allWeapons);
          showToast('Build "' + build.name + '" loaded!', 'success');
          var modal = document.getElementById('saveBuildModal');
          if (modal) modal.classList.remove('active');
        }
      });

      item.querySelector('[data-action="delete"]').addEventListener('click', function (e) {
        e.stopPropagation();
        if (confirm('Delete this build?')) {
          deleteBuildFromStorage(buildId);
          renderSavedBuildsList(listEl, allChars, allWeapons);
          showToast('Build deleted', 'info');
        }
      });
    });
  }

  /* ══════════════════════════════════════════════
     CLOUD BUILDS LIST (Supabase user_builds)
  ══════════════════════════════════════════════ */
  async function renderCloudBuildsList(listEl, allChars, allWeapons) {
    if (!listEl) return;

    if (typeof UserAuth === 'undefined' || !UserAuth.isLoggedIn()) {
      listEl.innerHTML = '<div class="tb-saved-empty" style="color:#64748b;">Sign in to access cloud saves</div>';
      return;
    }

    listEl.innerHTML = '<div class="tb-saved-empty">Loading cloud builds...</div>';

    var builds = [];
    if (typeof window.loadUserBuilds === 'function') {
      builds = await window.loadUserBuilds();
    }

    if (!builds || builds.length === 0) {
      listEl.innerHTML = '<div class="tb-saved-empty">No cloud builds yet</div>';
      return;
    }

    var html = '';
    builds.forEach(function (b) {
      var date = new Date(b.created_at).toLocaleDateString();
      var chars = (b.char_names || []).join(', ');
      html +=
        '<div class="tb-saved-build-item" data-cloud-id="' + b.id + '">' +
          '<div class="tb-saved-build-info">' +
            '<div class="tb-saved-build-name" style="color:#a78bfa;">\u2601 ' + escHtml(b.name) + '</div>' +
            '<div class="tb-saved-build-meta">' + (b.char_count || 0) + ' chars \u2022 ' + date + '</div>' +
            '<div class="tb-saved-build-chars">' + escHtml(chars) + '</div>' +
          '</div>' +
          '<div class="tb-saved-build-actions">' +
            '<button class="tb-saved-btn tb-saved-load" data-action="cloud-load" title="Load Build">\u25B6</button>' +
            '<button class="tb-saved-btn tb-saved-delete" data-action="cloud-delete" title="Delete">\uD83D\uDDD1</button>' +
          '</div>' +
        '</div>';
    });
    listEl.innerHTML = html;

    /* Bind events */
    listEl.querySelectorAll('.tb-saved-build-item').forEach(function (item) {
      var cloudId = item.getAttribute('data-cloud-id');

      item.querySelector('[data-action="cloud-load"]').addEventListener('click', function (e) {
        e.stopPropagation();
        var build = builds.find(function (b) { return b.id === cloudId; });
        if (build && build.build_data) {
          loadBuildData(build.build_data, allChars, allWeapons);
          showToast('Cloud build "' + build.name + '" loaded!', 'success');
          var modal = document.getElementById('saveBuildModal');
          if (modal) modal.classList.remove('active');
        }
      });

      item.querySelector('[data-action="cloud-delete"]').addEventListener('click', function (e) {
        e.stopPropagation();
        if (confirm('Delete this cloud build?')) {
          if (typeof window.deleteUserBuild === 'function') {
            window.deleteUserBuild(cloudId).then(function(ok) {
              if (ok) {
                renderCloudBuildsList(listEl, allChars, allWeapons);
                showToast('Cloud build deleted', 'info');
              }
            });
          }
        }
      });
    });
  }

  /* ══════════════════════════════════════════════
     COPY LINK
  ══════════════════════════════════════════════ */
  function copyBuildLink() {
    var buildData = serializeBuild();
    if (!buildData) {
      showToast('Add characters to the canvas first!', 'warning');
      return;
    }

    var encoded = encodeBuild(buildData);
    if (!encoded) {
      showToast('Failed to encode build data', 'error');
      return;
    }

    var url = window.location.origin + window.location.pathname + '?build=' + encoded;

    /* Use clipboard API */
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(url).then(function () {
        showToast('Build link copied to clipboard!', 'success');
      }).catch(function () {
        fallbackCopy(url);
      });
    } else {
      fallbackCopy(url);
    }
  }

  function fallbackCopy(text) {
    var ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    try {
      document.execCommand('copy');
      showToast('Build link copied to clipboard!', 'success');
    } catch (e) {
      showToast('Failed to copy. URL logged to console.', 'error');
      console.log('Build URL:', text);
    }
    document.body.removeChild(ta);
  }

  /* ══════════════════════════════════════════════
     EXPORT IMAGE
  ══════════════════════════════════════════════ */
  function exportCanvasImage() {
    var nodes = window.__TB_getNodes ? window.__TB_getNodes() : [];
    if (nodes.length === 0) {
      showToast('Add characters to the canvas first!', 'warning');
      return;
    }

    showToast('Generating image...', 'info');

    var canvasEl = document.getElementById('reactFlowCanvas');
    if (!canvasEl) {
      showToast('Canvas not found', 'error');
      return;
    }

    /* Capture the exact rendered size of the canvas 1:1 */
    var rect = canvasEl.getBoundingClientRect();
    var renderW = Math.round(rect.width);
    var renderH = Math.round(rect.height);

    if (typeof html2canvas !== 'undefined') {
      html2canvas(canvasEl, {
        backgroundColor: '#020617',
        scale: 2,
        useCORS: true,
        allowTaint: true,
        logging: false,
        width: renderW,
        height: renderH,
        x: 0,
        y: 0,
        scrollX: 0,
        scrollY: 0,
        windowWidth: renderW,
        windowHeight: renderH,
      }).then(function (canvas) {
        downloadCanvas(canvas);
      }).catch(function (err) {
        console.error('html2canvas error:', err);
        exportFallbackSVG();
      });
    } else {
      exportFallbackSVG();
    }
  }

  function downloadCanvas(canvas) {
    try {
      var link = document.createElement('a');
      link.download = '7ds-team-build-' + Date.now() + '.png';
      link.href = canvas.toDataURL('image/png');
      link.click();
      showToast('Image exported!', 'success');
    } catch (e) {
      showToast('Failed to export image', 'error');
    }
  }

  function exportFallbackSVG() {
    /* Fallback: capture the React Flow viewport SVG + nodes as a composite image */
    var canvasEl = document.getElementById('reactFlowCanvas');
    var viewport = canvasEl.querySelector('.react-flow__viewport');
    if (!viewport) {
      showToast('Could not capture canvas', 'error');
      return;
    }

    /* Create a canvas element manually */
    var c = document.createElement('canvas');
    var rect = canvasEl.getBoundingClientRect();
    c.width = rect.width * 2;
    c.height = rect.height * 2;
    var ctx = c.getContext('2d');
    ctx.scale(2, 2);

    /* Draw dark background */
    ctx.fillStyle = '#020617';
    ctx.fillRect(0, 0, rect.width, rect.height);

    /* Draw grid pattern */
    ctx.strokeStyle = 'rgba(96,165,250,0.08)';
    ctx.lineWidth = 0.5;
    for (var x = 0; x < rect.width; x += 20) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, rect.height);
      ctx.stroke();
    }
    for (var y = 0; y < rect.height; y += 20) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(rect.width, y);
      ctx.stroke();
    }

    /* Draw node info as text */
    var nodes = window.__TB_getNodes ? window.__TB_getNodes() : [];
    var vp = window.__TB_rfInstance ? window.__TB_rfInstance.getViewport() : { x: 0, y: 0, zoom: 1 };

    ctx.font = 'bold 14px Rajdhani, sans-serif';
    ctx.textAlign = 'center';

    nodes.forEach(function (n) {
      var sx = n.position.x * vp.zoom + vp.x;
      var sy = n.position.y * vp.zoom + vp.y;
      var w = 180 * vp.zoom;
      var h = 240 * vp.zoom;

      /* Node background */
      ctx.fillStyle = 'rgba(15, 23, 42, 0.95)';
      ctx.strokeStyle = '#f0c040';
      ctx.lineWidth = 2;
      roundRect(ctx, sx, sy, w, h, 10);
      ctx.fill();
      ctx.stroke();

      /* Character name */
      ctx.fillStyle = '#e2e8f0';
      ctx.font = 'bold ' + (14 * vp.zoom) + 'px Rajdhani, sans-serif';
      ctx.fillText(n.data.charName || '', sx + w / 2, sy + h - 20 * vp.zoom);

      /* Rarity badge */
      ctx.fillStyle = n.data.rarity === 'SSR' ? '#f0c040' : '#a78bfa';
      ctx.font = 'bold ' + (11 * vp.zoom) + 'px Rajdhani, sans-serif';
      ctx.fillText(n.data.rarity || '', sx + w / 2, sy + h - 6 * vp.zoom);
    });

    /* Draw edges */
    var edges = window.__TB_getEdges ? window.__TB_getEdges() : [];
    edges.forEach(function (e) {
      var srcNode = nodes.find(function (n) { return n.id === e.source; });
      var tgtNode = nodes.find(function (n) { return n.id === e.target; });
      if (!srcNode || !tgtNode) return;

      var sx = srcNode.position.x * vp.zoom + vp.x + 90 * vp.zoom;
      var sy = srcNode.position.y * vp.zoom + vp.y + 240 * vp.zoom;
      var tx = tgtNode.position.x * vp.zoom + vp.x + 90 * vp.zoom;
      var ty = tgtNode.position.y * vp.zoom + vp.y;

      ctx.strokeStyle = (e.style && e.style.stroke) || '#f0c040';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(sx, sy);
      ctx.lineTo(tx, ty);
      ctx.stroke();
    });

    /* Add watermark */
    ctx.fillStyle = 'rgba(240, 192, 64, 0.5)';
    ctx.font = '12px Rajdhani, sans-serif';
    ctx.textAlign = 'right';
    ctx.fillText('7DS Origin Team Builder', rect.width - 10, rect.height - 10);

    downloadCanvas(c);
  }

  function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r);
    ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
  }

  /* ══════════════════════════════════════════════
     CLEAR TEAM (with confirmation)
  ══════════════════════════════════════════════ */
  function clearTeam() {
    var nodes = window.__TB_getNodes ? window.__TB_getNodes() : [];
    if (nodes.length === 0) {
      showToast('Canvas is already empty', 'info');
      return;
    }

    /* Show confirmation dialog */
    var overlay = document.createElement('div');
    overlay.className = 'tb-confirm-overlay';
    overlay.innerHTML =
      '<div class="tb-confirm-dialog">' +
        '<div class="tb-confirm-icon">\u26A0</div>' +
        '<div class="tb-confirm-title">Clear Team?</div>' +
        '<div class="tb-confirm-text">This will remove all ' + nodes.length + ' characters, weapons, and connections from the canvas. This cannot be undone.</div>' +
        '<div class="tb-confirm-actions">' +
          '<button class="tb-confirm-btn tb-confirm-cancel">Cancel</button>' +
          '<button class="tb-confirm-btn tb-confirm-ok">\uD83D\uDDD1 Clear All</button>' +
        '</div>' +
      '</div>';

    document.body.appendChild(overlay);
    requestAnimationFrame(function () { overlay.classList.add('active'); });

    overlay.querySelector('.tb-confirm-cancel').addEventListener('click', function () {
      overlay.classList.remove('active');
      setTimeout(function () { overlay.remove(); }, 300);
    });

    overlay.querySelector('.tb-confirm-ok').addEventListener('click', function () {
      if (window.__TB_clearAll) window.__TB_clearAll();
      overlay.classList.remove('active');
      setTimeout(function () { overlay.remove(); }, 300);
      showToast('Team cleared!', 'success');
    });

    overlay.addEventListener('click', function (e) {
      if (e.target === overlay) {
        overlay.classList.remove('active');
        setTimeout(function () { overlay.remove(); }, 300);
      }
    });
  }

  /* ══════════════════════════════════════════════
     LOAD BUILD FROM URL
  ══════════════════════════════════════════════ */
  function checkUrlBuild(allChars, allWeapons) {
    var params = new URLSearchParams(window.location.search);
    var buildParam = params.get('build');
    if (!buildParam) return;

    var buildData = decodeBuild(buildParam);
    if (!buildData || !buildData.nodes) {
      showToast('Invalid build link', 'error');
      return;
    }

    /* Wait for canvas to be ready */
    var attempts = 0;
    var interval = setInterval(function () {
      attempts++;
      if (window.__TB_addCharacterNodeAt && window.__TB_clearAll) {
        clearInterval(interval);
        showToast('Loading shared build...', 'info');
        loadBuildData(buildData, allChars, allWeapons);

        /* Clean URL */
        var cleanUrl = window.location.origin + window.location.pathname;
        window.history.replaceState({}, '', cleanUrl);
      }
      if (attempts > 50) {
        clearInterval(interval);
        showToast('Canvas not ready. Please refresh.', 'error');
      }
    }, 200);
  }

  /* ══════════════════════════════════════════════
     UTILITY
  ══════════════════════════════════════════════ */
  function escHtml(str) {
    var div = document.createElement('div');
    div.textContent = str || '';
    return div.innerHTML;
  }

  /* ══════════════════════════════════════════════
     INIT: Wire up buttons when DOM is ready
  ══════════════════════════════════════════════ */
  window.__TB_BuildSystem = {
    init: function (allChars, allWeapons) {
      /* Save Build */
      var btnSave = document.getElementById('btnSaveBuild');
      if (btnSave) {
        btnSave.addEventListener('click', function () {
          openSaveModal(allChars, allWeapons);
        });
      }

      /* Copy Link */
      var btnCopy = document.getElementById('btnCopyLink');
      if (btnCopy) {
        btnCopy.addEventListener('click', copyBuildLink);
      }

      /* Export Image */
      var btnExport = document.getElementById('btnExportImage');
      if (btnExport) {
        btnExport.addEventListener('click', exportCanvasImage);
      }

      /* Clear Team (replace existing handler) */
      var btnClear = document.getElementById('btnClearTeam');
      if (btnClear) {
        /* Remove old listener by replacing element */
        var newClear = btnClear.cloneNode(true);
        btnClear.parentNode.replaceChild(newClear, btnClear);
        newClear.addEventListener('click', clearTeam);
      }

      /* Check URL for shared build */
      checkUrlBuild(allChars, allWeapons);
    },

    /* Expose for community builds */
    loadBuild: function (buildData, allChars, allWeapons) {
      return loadBuildData(buildData, allChars, allWeapons);
    },

    showToast: showToast,
  };

})();
