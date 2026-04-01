/* ============================================================
   7DS ORIGIN - GUIDE BLOCK EDITOR
   Full block editor: add, edit, move, delete, drag-drop, save
   ============================================================ */

(function () {

  // ── State ──
  var guideId = null;
  var blocks = [];       // Array of { id, type, content }
  var autoSaveTimer = null;
  var isNewGuide = true;
  var currentMode = 'edit'; // 'edit' or 'preview'

  // ── DOM refs ──
  var blocksArea, addBlockBtn, blockPickerOverlay, blockPickerClose;
  var metaTitle, metaCategory, metaDescription, metaCoverUrl, metaCoverUpload, metaCoverPreview;
  var saveDraftBtn, publishBtn, saveStatus;
  var modeEditBtn, modePreviewBtn, editModePanel, previewModePanel, previewContent;
  var editorTitleEl;

  // ── Init ──
  document.addEventListener('DOMContentLoaded', async function () {
    // Check admin
    var isAdmin = false;
    try { isAdmin = await Auth.isLoggedIn(); } catch(e) {}
    if (!isAdmin) {
      window.location.href = 'guides.html';
      return;
    }

    // Cache DOM
    blocksArea = document.getElementById('blocksArea');
    addBlockBtn = document.getElementById('addBlockBtn');
    blockPickerOverlay = document.getElementById('blockPickerOverlay');
    blockPickerClose = document.getElementById('blockPickerClose');
    metaTitle = document.getElementById('metaTitle');
    metaCategory = document.getElementById('metaCategory');
    metaDescription = document.getElementById('metaDescription');
    metaCoverUrl = document.getElementById('metaCoverUrl');
    metaCoverUpload = document.getElementById('metaCoverUpload');
    metaCoverPreview = document.getElementById('metaCoverPreview');
    saveDraftBtn = document.getElementById('saveDraftBtn');
    publishBtn = document.getElementById('publishBtn');
    saveStatus = document.getElementById('saveStatus');
    modeEditBtn = document.getElementById('modeEditBtn');
    modePreviewBtn = document.getElementById('modePreviewBtn');
    editModePanel = document.getElementById('editModePanel');
    previewModePanel = document.getElementById('previewModePanel');
    previewContent = document.getElementById('previewContent');
    editorTitleEl = document.getElementById('editorTitle');

    // Check if editing existing guide
    var params = new URLSearchParams(window.location.search);
    var editId = params.get('id');
    if (editId) {
      guideId = editId;
      isNewGuide = false;
      await loadExistingGuide(editId);
    }

    // Events
    addBlockBtn.addEventListener('click', showBlockPicker);
    blockPickerClose.addEventListener('click', hideBlockPicker);
    blockPickerOverlay.addEventListener('click', function (e) {
      if (e.target === blockPickerOverlay) hideBlockPicker();
    });

    // Block picker items
    blockPickerOverlay.querySelectorAll('.block-picker-item').forEach(function (item) {
      item.addEventListener('click', function () {
        var type = item.dataset.type;
        addBlock(type);
        hideBlockPicker();
      });
    });

    // Save buttons
    saveDraftBtn.addEventListener('click', function () { saveGuide('draft'); });
    publishBtn.addEventListener('click', function () { saveGuide('published'); });

    // Mode toggle
    modeEditBtn.addEventListener('click', function () { switchMode('edit'); });
    modePreviewBtn.addEventListener('click', function () { switchMode('preview'); });

    // Cover image upload
    metaCoverUpload.addEventListener('change', handleCoverUpload);
    metaCoverUrl.addEventListener('input', function () {
      var url = metaCoverUrl.value.trim();
      if (url) {
        metaCoverPreview.src = url;
        metaCoverPreview.style.display = 'block';
      } else {
        metaCoverPreview.style.display = 'none';
      }
    });

    // Auto-save on meta changes
    [metaTitle, metaCategory, metaDescription, metaCoverUrl].forEach(function (el) {
      el.addEventListener('input', scheduleAutoSave);
    });
  });

  // ── Load existing guide ──
  async function loadExistingGuide(id) {
    var guide = await GuideAPI.fetchGuideById(id);
    if (!guide) {
      showToast('Guide not found', 'error');
      return;
    }

    editorTitleEl.textContent = 'Edit: ' + guide.title;
    metaTitle.value = guide.title || '';
    metaCategory.value = guide.category || 'general';
    metaDescription.value = guide.description || '';
    metaCoverUrl.value = guide.cover_image || '';
    if (guide.cover_image) {
      metaCoverPreview.src = guide.cover_image;
      metaCoverPreview.style.display = 'block';
    }

    // Load blocks
    var dbBlocks = await GuideAPI.fetchBlocks(id);
    blocks = dbBlocks.map(function (b) {
      return { id: b.id, type: b.type, content: b.content || {} };
    });

    renderAllBlocks();
  }

  // ── Block picker ──
  function showBlockPicker() { blockPickerOverlay.style.display = 'flex'; }
  function hideBlockPicker() { blockPickerOverlay.style.display = 'none'; }

  // ── Add block ──
  function addBlock(type, insertIndex) {
    var content = getDefaultContent(type);
    var block = { id: generateTempId(), type: type, content: content };
    if (typeof insertIndex === 'number') {
      blocks.splice(insertIndex, 0, block);
    } else {
      blocks.push(block);
    }
    renderAllBlocks();
    scheduleAutoSave();
  }

  function getDefaultContent(type) {
    switch (type) {
      case 'header':  return { level: 2, text: 'Section Title', align: 'left' };
      case 'text':    return { html: '<p>Enter your text here...</p>', align: 'left' };
      case 'image':   return {url:'',caption:'',width:'100%'};
      case 'video':   return { youtube: '', url: '' };
      case 'table':   return { headers: ['Column 1', 'Column 2', 'Column 3'], rows: [['', '', ''], ['', '', '']] };
      case 'list':    return { items: ['Item 1', 'Item 2', 'Item 3'], ordered: false };
      case 'divider': return {};
      case 'spacer':  return { height: 32 };
      case 'box':     return { boxType: 'info', title: 'Info', html: 'Enter content here...' };
      case 'columns': return { layout: '50-50', columns: [{ width: 50, html: 'Left column' }, { width: 50, html: 'Right column' }] };
      default:        return {};
    }
  }

  // ── Render all blocks ──
  function renderAllBlocks() {
    blocksArea.innerHTML = '';
    blocks.forEach(function (block, index) {
      var el = createBlockElement(block, index);
      blocksArea.appendChild(el);
    });
  }

  // ── Create block element ──
  function createBlockElement(block, index) {
    var wrapper = document.createElement('div');
    wrapper.className = 'editor-block';
    wrapper.dataset.index = index;
    wrapper.dataset.blockId = block.id;
    wrapper.draggable = true;

    // Header
    var header = document.createElement('div');
    header.className = 'editor-block-header';
    header.innerHTML =
      '<span class="editor-block-drag">&#9776;</span>' +
      '<span class="editor-block-type">' + block.type.toUpperCase() + '</span>' +
      '<div class="editor-block-actions">' +
        '<button class="editor-block-action" data-action="moveUp" title="Move Up">&#9650;</button>' +
        '<button class="editor-block-action" data-action="moveDown" title="Move Down">&#9660;</button>' +
        '<button class="editor-block-action" data-action="duplicate" title="Duplicate">&#10697;</button>' +
        '<button class="editor-block-action delete-action" data-action="delete" title="Delete">&#10005;</button>' +
      '</div>';

    // Action handlers
    header.addEventListener('click', function (e) {
      var btn = e.target.closest('[data-action]');
      if (!btn) return;
      var action = btn.dataset.action;
      if (action === 'moveUp') moveBlock(index, -1);
      else if (action === 'moveDown') moveBlock(index, 1);
      else if (action === 'duplicate') duplicateBlock(index);
      else if (action === 'delete') deleteBlock(index);
    });

    // Body
    var body = document.createElement('div');
    body.className = 'editor-block-body';
    buildBlockEditor(body, block, index);

    wrapper.appendChild(header);
    wrapper.appendChild(body);

    // Drag events
    wrapper.addEventListener('dragstart', function (e) {
      e.dataTransfer.setData('text/plain', index);
      wrapper.classList.add('dragging');
    });
    wrapper.addEventListener('dragend', function () {
      wrapper.classList.remove('dragging');
      document.querySelectorAll('.editor-block.drag-over').forEach(function (el) {
        el.classList.remove('drag-over');
      });
    });
    wrapper.addEventListener('dragover', function (e) {
      e.preventDefault();
      wrapper.classList.add('drag-over');
    });
    wrapper.addEventListener('dragleave', function () {
      wrapper.classList.remove('drag-over');
    });
    wrapper.addEventListener('drop', function (e) {
      e.preventDefault();
      wrapper.classList.remove('drag-over');
      var fromIndex = parseInt(e.dataTransfer.getData('text/plain'));
      var toIndex = parseInt(wrapper.dataset.index);
      if (fromIndex !== toIndex) {
        var moved = blocks.splice(fromIndex, 1)[0];
        blocks.splice(toIndex, 0, moved);
        renderAllBlocks();
        scheduleAutoSave();
      }
    });

    // Insert block between
    var insertBar = document.createElement('div');
    insertBar.style.cssText = 'text-align:center;padding:4px 0;';
    var insertBtn = document.createElement('button');
    insertBtn.className = 'editor-add-block-btn';
    insertBtn.style.cssText = 'padding:4px 14px;font-size:12px;border-width:1px;';
    insertBtn.textContent = '+';
    insertBtn.title = 'Insert block here';
    insertBtn.addEventListener('click', function () {
      window._insertAtIndex = index + 1;
      showBlockPicker();
    });
    insertBar.appendChild(insertBtn);

    var container = document.createElement('div');
    container.appendChild(wrapper);
    container.appendChild(insertBar);
    return container;
  }

  // Override block picker to support insert at index
  var _origAddBlock = addBlock;
  (function () {
    var pickerItems = document.querySelectorAll ? null : null; // deferred
    document.addEventListener('DOMContentLoaded', function () {
      var overlay = document.getElementById('blockPickerOverlay');
      if (!overlay) return;
      overlay.querySelectorAll('.block-picker-item').forEach(function (item) {
        item.addEventListener('click', function () {
          var type = item.dataset.type;
          var idx = window._insertAtIndex;
          window._insertAtIndex = undefined;
          if (typeof idx === 'number') {
            var content = getDefaultContent(type);
            var block = { id: generateTempId(), type: type, content: content };
            blocks.splice(idx, 0, block);
            renderAllBlocks();
            scheduleAutoSave();
          }
          // else handled by original addBlock
        });
      });
    });
  })();

  // ── Block editors ──
  function buildBlockEditor(container, block, index) {
    switch (block.type) {
      case 'header':  buildHeaderEditor(container, block, index); break;
      case 'text':    buildTextEditor(container, block, index); break;
      case 'image':   buildImageEditor(container, block, index); break;
      case 'video':   buildVideoEditor(container, block, index); break;
      case 'table':   buildTableEditor(container, block, index); break;
      case 'list':    buildListEditor(container, block, index); break;
      case 'divider': container.innerHTML = '<div style="text-align:center;color:var(--muted);font-size:12px;">Horizontal Divider</div>'; break;
      case 'spacer':  buildSpacerEditor(container, block, index); break;
      case 'box':     buildBoxEditor(container, block, index); break;
      case 'columns': buildColumnsEditor(container, block, index); break;
    }
  }

  // ── HEADER EDITOR ──
  function buildHeaderEditor(container, block, index) {
    var c = block.content;
    var html = '<div class="editor-header-level">' +
      '<select class="header-level-select">' +
      '<option value="1"' + (c.level === 1 ? ' selected' : '') + '>H1 - Large</option>' +
      '<option value="2"' + (c.level === 2 ? ' selected' : '') + '>H2 - Medium</option>' +
      '<option value="3"' + (c.level === 3 ? ' selected' : '') + '>H3 - Small</option>' +
      '</select></div>' +
      '<input type="text" class="header-text-input" value="' + escapeAttr(c.text || '') + '" ' +
      'style="width:100%;padding:10px 14px;border:1px solid var(--border);border-radius:8px;background:var(--dark3);color:var(--gold);font-family:\'Cinzel\',serif;font-size:20px;font-weight:700;">';

    container.innerHTML = html;

    container.querySelector('.header-level-select').addEventListener('change', function () {
      blocks[index].content.level = parseInt(this.value);
      scheduleAutoSave();
    });
    container.querySelector('.header-text-input').addEventListener('input', function () {
      blocks[index].content.text = this.value;
      scheduleAutoSave();
    });
  }

  // ── TEXT EDITOR (Rich Text) ──
  function buildTextEditor(container, block, index) {
    var c = block.content;
    var toolbar = createRichTextToolbar(index);
    var editable = document.createElement('div');
    editable.className = 'editor-richtext';
    editable.contentEditable = 'true';
    editable.innerHTML = c.html || c.text || '';
    editable.dataset.blockIndex = index;

    editable.addEventListener('input', function () {
      blocks[index].content.html = editable.innerHTML;
      scheduleAutoSave();
    });

    container.appendChild(toolbar);
    container.appendChild(editable);
  }

  function createRichTextToolbar(blockIndex) {
    var toolbar = document.createElement('div');
    toolbar.className = 'rich-text-toolbar';

    var buttons = [
      { cmd: 'bold', icon: '<b>B</b>', title: 'Bold' },
      { cmd: 'italic', icon: '<i>I</i>', title: 'Italic' },
      { cmd: 'underline', icon: '<u>U</u>', title: 'Underline' },
      { cmd: 'strikeThrough', icon: '<s>S</s>', title: 'Strikethrough' },
      { type: 'separator' },
      { cmd: 'justifyLeft', icon: '&#8676;', title: 'Align Left' },
      { cmd: 'justifyCenter', icon: '&#8596;', title: 'Align Center' },
      { cmd: 'justifyRight', icon: '&#8677;', title: 'Align Right' },
      { type: 'separator' },
      { cmd: 'insertUnorderedList', icon: '&#8226;', title: 'Bullet List' },
      { cmd: 'insertOrderedList', icon: '1.', title: 'Numbered List' },
      { type: 'separator' },
      { action: 'link', icon: '&#128279;', title: 'Insert Link' },
      { action: 'color', icon: 'A', title: 'Text Color' },
      { action: 'fontSize', icon: 'T', title: 'Font Size' }
    ];

    buttons.forEach(function (b) {
      if (b.type === 'separator') {
        var sep = document.createElement('div');
        sep.className = 'rt-separator';
        toolbar.appendChild(sep);
        return;
      }

      if (b.action === 'color') {
        var colorWrap = document.createElement('div');
        colorWrap.style.cssText = 'position:relative;display:flex;align-items:center;';
        var colorBtn = document.createElement('button');
        colorBtn.className = 'rt-btn';
        colorBtn.innerHTML = '<span style="border-bottom:3px solid var(--gold);">A</span>';
        colorBtn.title = 'Text Color';
        var colorInput = document.createElement('input');
        colorInput.type = 'color';
        colorInput.className = 'rt-color-input';
        colorInput.value = '#f0c040';
        colorInput.style.cssText = 'position:absolute;left:0;top:0;width:100%;height:100%;opacity:0;cursor:pointer;';
        colorInput.addEventListener('input', function () {
          document.execCommand('foreColor', false, colorInput.value);
          updateBlockContent(blockIndex);
        });
        colorWrap.appendChild(colorBtn);
        colorWrap.appendChild(colorInput);
        toolbar.appendChild(colorWrap);
        return;
      }

      if (b.action === 'fontSize') {
        var sizeBtn = document.createElement('button');
        sizeBtn.className = 'rt-btn';
        sizeBtn.innerHTML = 'T';
        sizeBtn.title = 'Font Size';
        sizeBtn.addEventListener('click', function () {
          var size = prompt('Font size (1-7, default 3):', '3');
          if (size) {
            document.execCommand('fontSize', false, size);
            updateBlockContent(blockIndex);
          }
        });
        toolbar.appendChild(sizeBtn);
        return;
      }

      if (b.action === 'link') {
        var linkBtn = document.createElement('button');
        linkBtn.className = 'rt-btn';
        linkBtn.innerHTML = b.icon;
        linkBtn.title = b.title;
        linkBtn.addEventListener('click', function () {
          var url = prompt('Enter URL:', 'https://');
          if (url) {
            document.execCommand('createLink', false, url);
            updateBlockContent(blockIndex);
          }
        });
        toolbar.appendChild(linkBtn);
        return;
      }

      var btn = document.createElement('button');
      btn.className = 'rt-btn';
      btn.innerHTML = b.icon;
      btn.title = b.title;
      btn.addEventListener('click', function () {
        document.execCommand(b.cmd, false, null);
        updateBlockContent(blockIndex);
      });
      toolbar.appendChild(btn);
    });

    return toolbar;
  }

  function updateBlockContent(blockIndex) {
    var editable = blocksArea.querySelector('[data-block-index="' + blockIndex + '"]');
    if (editable) {
      blocks[blockIndex].content.html = editable.innerHTML;
      scheduleAutoSave();
    }
  }

  // ── IMAGE EDITOR ──
  function buildImageEditor(container, block, index) {
    var c = block.content;
    var html = '';

    if (c.url) {
      html += '<div class="editor-upload-preview"><img src="' + c.url + '" style="width:'+ (c.width || '100%') +';border-radius:8px;"></div>';
      html += '<div style="margin-top:8px;display:flex;gap:8px;align-items:center;">' +
        '<input type="text" class="img-url-input" value="' + escapeAttr(c.url) + '" style="flex:1;padding:8px 12px;border:1px solid var(--border);border-radius:8px;background:var(--dark3);color:var(--text);font-size:13px;">' +
        '<label class="btn btn-outline" style="padding:6px 14px;cursor:pointer;font-size:12px;margin:0;">Change<input type="file" class="img-file-input" accept="image/*" style="display:none;"></label>' +
        '</div>';
      html += '<div style="margin-top:8px;"><input type="text" class="img-caption-input" placeholder="Caption (optional)" value="' + escapeAttr(c.caption || '') + '" style="width:100%;padding:8px 12px;border:1px solid var(--border);border-radius:8px;background:var(--dark3);color:var(--text);font-size:13px;"></div>';
       html += '<div style="margin-top:10px;">' +
'<label style="font-size:12px;color:var(--muted);">Image Size</label>' +

'<select class="img-size-select" ' +
'style="width:100%;padding:6px;border:1px solid var(--border);border-radius:6px;background:var(--dark3);color:var(--text);">' +

'<option value="25%" ' + (c.width==='25%'?'selected':'') + '>Small</option>' +
'<option value="50%" ' + (c.width==='50%'?'selected':'') + '>Medium</option>' +
'<option value="75%" ' + (c.width==='75%'?'selected':'') + '>Large</option>' +
'<option value="100%" ' + (c.width==='100%'?'selected':'') + '>Full</option>' +

'</select>' +
'</div>';
    } else {
      html += '<div class="editor-upload-area img-upload-trigger">' +
        '<div class="editor-upload-icon">&#128247;</div>' +
        '<div class="editor-upload-text">Click to upload image or paste URL</div>' +
        '<input type="file" class="img-file-input" accept="image/*" style="display:none;">' +
        '</div>';
      html += '<div style="margin-top:8px;"><input type="text" class="img-url-input" placeholder="Or paste image URL..." style="width:100%;padding:8px 12px;border:1px solid var(--border);border-radius:8px;background:var(--dark3);color:var(--text);font-size:13px;"></div>';
    }

    container.innerHTML = html;

    // Upload trigger
     var sizeSelect = container.querySelector('.img-size-select');

if (sizeSelect) {

sizeSelect.addEventListener('change', function () {

blocks[index].content.width = this.value;

renderAllBlocks();
scheduleAutoSave();

});

}
    var trigger = container.querySelector('.img-upload-trigger');
    var fileInput = container.querySelector('.img-file-input');
    if (trigger) {
      trigger.addEventListener('click', function () { fileInput.click(); });
    }

    if (fileInput) {
      fileInput.addEventListener('change', async function () {
        if (!fileInput.files[0]) return;
        showToast('Uploading image...', 'info');
        var result = await GuideAPI.uploadMedia(fileInput.files[0], guideId);
        if (result.url) {
          blocks[index].content.url = result.url;
          renderAllBlocks();
          scheduleAutoSave();
          showToast('Image uploaded!', 'success');
        } else {
          showToast('Upload failed', 'error');
        }
      });
    }

    var urlInput = container.querySelector('.img-url-input');
    if (urlInput) {
      urlInput.addEventListener('change', function () {
        blocks[index].content.url = urlInput.value.trim();
        renderAllBlocks();
        scheduleAutoSave();
      });
    }

    var captionInput = container.querySelector('.img-caption-input');
    if (captionInput) {
      captionInput.addEventListener('input', function () {
        blocks[index].content.caption = captionInput.value;
        scheduleAutoSave();
      });
    }
  }

  // ── VIDEO EDITOR ──
  function buildVideoEditor(container, block, index) {
    var c = block.content;
    var html = '<div class="editor-video-url">' +
      '<input type="text" class="video-yt-input" placeholder="YouTube URL (e.g. https://youtube.com/watch?v=...)" value="' + escapeAttr(c.youtube || '') + '">' +
      '</div>';
    html += '<div style="margin-top:8px;text-align:center;color:var(--muted);font-size:12px;">OR</div>';
    html += '<div style="margin-top:8px;">' +
      '<div class="editor-upload-area video-upload-trigger" style="padding:16px;">' +
      '<div class="editor-upload-icon">&#9654;</div>' +
      '<div class="editor-upload-text">Upload video file</div>' +
      '<input type="file" class="video-file-input" accept="video/*" style="display:none;">' +
      '</div></div>';

    if (c.youtube) {
      var vid = extractYouTubeId(c.youtube);
      if (vid) {
        html += '<div style="margin-top:12px;"><div class="gb-video"><iframe src="https://www.youtube.com/embed/' + vid + '" frameborder="0" allowfullscreen></iframe></div></div>';
      }
    } else if (c.url) {
      html += '<div style="margin-top:12px;"><video src="' + c.url + '" controls style="max-width:100%;border-radius:8px;"></video></div>';
    }

    container.innerHTML = html;

    container.querySelector('.video-yt-input').addEventListener('change', function () {
      blocks[index].content.youtube = this.value.trim();
      blocks[index].content.url = '';
      renderAllBlocks();
      scheduleAutoSave();
    });

    var videoTrigger = container.querySelector('.video-upload-trigger');
    var videoFile = container.querySelector('.video-file-input');
    videoTrigger.addEventListener('click', function () { videoFile.click(); });
    videoFile.addEventListener('change', async function () {
      if (!videoFile.files[0]) return;
      showToast('Uploading video...', 'info');
      var result = await GuideAPI.uploadMedia(videoFile.files[0], guideId);
      if (result.url) {
        blocks[index].content.url = result.url;
        blocks[index].content.youtube = '';
        renderAllBlocks();
        scheduleAutoSave();
        showToast('Video uploaded!', 'success');
      } else {
        showToast('Upload failed', 'error');
      }
    });
  }

  // ── TABLE EDITOR ──
  function buildTableEditor(container, block, index) {
    var c = block.content;
    var headers = c.headers || [];
    var rows = c.rows || [];

    var html = '<div class="editor-table-controls">' +
      '<button class="editor-table-btn add-col-btn">+ Column</button>' +
      '<button class="editor-table-btn add-row-btn">+ Row</button>' +
      '<button class="editor-table-btn del-col-btn">- Column</button>' +
      '<button class="editor-table-btn del-row-btn">- Row</button>' +
      '</div>';

    html += '<div style="overflow-x:auto;"><table class="editor-table"><thead><tr>';
    headers.forEach(function (h, ci) {
      html += '<th contenteditable="true" data-col="' + ci + '">' + h + '</th>';
    });
    html += '</tr></thead><tbody>';
    rows.forEach(function (row, ri) {
      html += '<tr>';
      row.forEach(function (cell, ci) {
        html += '<td contenteditable="true" data-row="' + ri + '" data-col="' + ci + '">' + cell + '</td>';
      });
      html += '</tr>';
    });
    html += '</tbody></table></div>';

    container.innerHTML = html;

    // Cell edit
    container.querySelectorAll('th[contenteditable], td[contenteditable]').forEach(function (cell) {
      cell.addEventListener('input', function () {
        syncTableData(container, index);
      });
    });

    // Add/remove
    container.querySelector('.add-col-btn').addEventListener('click', function () {
      blocks[index].content.headers.push('New');
      blocks[index].content.rows.forEach(function (r) { r.push(''); });
      renderAllBlocks();
      scheduleAutoSave();
    });
    container.querySelector('.add-row-btn').addEventListener('click', function () {
      var cols = blocks[index].content.headers.length;
      blocks[index].content.rows.push(new Array(cols).fill(''));
      renderAllBlocks();
      scheduleAutoSave();
    });
    container.querySelector('.del-col-btn').addEventListener('click', function () {
      if (blocks[index].content.headers.length <= 1) return;
      blocks[index].content.headers.pop();
      blocks[index].content.rows.forEach(function (r) { r.pop(); });
      renderAllBlocks();
      scheduleAutoSave();
    });
    container.querySelector('.del-row-btn').addEventListener('click', function () {
      if (blocks[index].content.rows.length <= 1) return;
      blocks[index].content.rows.pop();
      renderAllBlocks();
      scheduleAutoSave();
    });
  }

  function syncTableData(container, index) {
    var headers = [];
    container.querySelectorAll('thead th').forEach(function (th) {
      headers.push(th.textContent);
    });
    var rows = [];
    container.querySelectorAll('tbody tr').forEach(function (tr) {
      var row = [];
      tr.querySelectorAll('td').forEach(function (td) {
        row.push(td.innerHTML);
      });
      rows.push(row);
    });
    blocks[index].content.headers = headers;
    blocks[index].content.rows = rows;
    scheduleAutoSave();
  }

  // ── LIST EDITOR ──
  function buildListEditor(container, block, index) {
    var c = block.content;
    var html = '<div style="margin-bottom:8px;">' +
      '<label style="color:var(--muted);font-size:12px;margin-right:12px;">' +
      '<input type="radio" name="listType' + index + '" value="false"' + (!c.ordered ? ' checked' : '') + '> Bullet</label>' +
      '<label style="color:var(--muted);font-size:12px;">' +
      '<input type="radio" name="listType' + index + '" value="true"' + (c.ordered ? ' checked' : '') + '> Numbered</label>' +
      '</div>';
    html += '<div class="list-items-container">';
    (c.items || []).forEach(function (item, i) {
      html += '<div style="display:flex;gap:8px;margin-bottom:6px;align-items:center;">' +
        '<span style="color:var(--muted);font-size:12px;min-width:20px;">' + (i + 1) + '.</span>' +
        '<input type="text" class="list-item-input" data-item="' + i + '" value="' + escapeAttr(item) + '" style="flex:1;padding:8px 12px;border:1px solid var(--border);border-radius:8px;background:var(--dark3);color:var(--text);font-size:14px;">' +
        '<button class="editor-table-btn del-item-btn" data-item="' + i + '" style="padding:4px 8px;">&#10005;</button>' +
        '</div>';
    });
    html += '</div>';
    html += '<button class="editor-table-btn add-item-btn" style="margin-top:4px;">+ Add Item</button>';

    container.innerHTML = html;

    // Type toggle
    container.querySelectorAll('input[name="listType' + index + '"]').forEach(function (radio) {
      radio.addEventListener('change', function () {
        blocks[index].content.ordered = (this.value === 'true');
        scheduleAutoSave();
      });
    });

    // Item inputs
    container.querySelectorAll('.list-item-input').forEach(function (input) {
      input.addEventListener('input', function () {
        var i = parseInt(input.dataset.item);
        blocks[index].content.items[i] = input.value;
        scheduleAutoSave();
      });
    });

    // Delete item
    container.querySelectorAll('.del-item-btn').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var i = parseInt(btn.dataset.item);
        blocks[index].content.items.splice(i, 1);
        renderAllBlocks();
        scheduleAutoSave();
      });
    });

    // Add item
    container.querySelector('.add-item-btn').addEventListener('click', function () {
      blocks[index].content.items.push('New item');
      renderAllBlocks();
      scheduleAutoSave();
    });
  }

  // ── SPACER EDITOR ──
  function buildSpacerEditor(container, block, index) {
    var c = block.content;
    container.innerHTML = '<div style="display:flex;align-items:center;gap:12px;">' +
      '<span style="color:var(--muted);font-size:12px;">Height:</span>' +
      '<input type="range" class="spacer-range" min="8" max="120" value="' + (c.height || 32) + '" style="flex:1;">' +
      '<span class="spacer-value" style="color:var(--text);font-size:14px;min-width:40px;">' + (c.height || 32) + 'px</span>' +
      '</div>';

    var range = container.querySelector('.spacer-range');
    var value = container.querySelector('.spacer-value');
    range.addEventListener('input', function () {
      blocks[index].content.height = parseInt(range.value);
      value.textContent = range.value + 'px';
      scheduleAutoSave();
    });
  }

  // ── BOX EDITOR ──
  function buildBoxEditor(container, block, index) {
    var c = block.content;
    var html = '<div class="editor-box-type-select" style="display:flex;gap:8px;margin-bottom:12px;">' +
      '<select class="box-type-select" style="padding:8px 12px;border:1px solid var(--border);border-radius:8px;background:var(--dark3);color:var(--text);font-size:13px;">' +
      '<option value="info"' + (c.boxType === 'info' ? ' selected' : '') + '>Info</option>' +
      '<option value="tip"' + (c.boxType === 'tip' ? ' selected' : '') + '>Tip</option>' +
      '<option value="warning"' + (c.boxType === 'warning' ? ' selected' : '') + '>Warning</option>' +
      '<option value="note"' + (c.boxType === 'note' ? ' selected' : '') + '>Note</option>' +
      '</select>' +
      '<input type="text" class="box-title-input" value="' + escapeAttr(c.title || '') + '" placeholder="Box title..." style="flex:1;padding:8px 12px;border:1px solid var(--border);border-radius:8px;background:var(--dark3);color:var(--text);font-size:14px;">' +
      '</div>';

    container.innerHTML = html;

    // Rich text for box content
    var toolbar = createRichTextToolbar(index);
    container.appendChild(toolbar);

    var editable = document.createElement('div');
    editable.className = 'editor-richtext';
    editable.contentEditable = 'true';
    editable.innerHTML = c.html || c.text || '';
    editable.dataset.blockIndex = index;
    editable.addEventListener('input', function () {
      blocks[index].content.html = editable.innerHTML;
      scheduleAutoSave();
    });
    container.appendChild(editable);

    container.querySelector('.box-type-select').addEventListener('change', function () {
      blocks[index].content.boxType = this.value;
      scheduleAutoSave();
    });
    container.querySelector('.box-title-input').addEventListener('input', function () {
      blocks[index].content.title = this.value;
      scheduleAutoSave();
    });
  }

  // ── COLUMNS EDITOR ──
  function buildColumnsEditor(container, block, index) {
    var c = block.content;
    var layout = c.layout || '50-50';

    var layouts = [
      { key: '50-50', label: '50 / 50', cols: [50, 50] },
      { key: '30-70', label: '30 / 70', cols: [30, 70] },
      { key: '70-30', label: '70 / 30', cols: [70, 30] },
      { key: '33-33-33', label: '33 / 33 / 33', cols: [33, 33, 34] }
    ];

    var html = '<div class="editor-col-layout-picker">';
    layouts.forEach(function (l) {
      html += '<button class="editor-col-layout-option' + (layout === l.key ? ' active' : '') + '" data-layout="' + l.key + '">' + l.label + '</button>';
    });
    html += '</div>';

    container.innerHTML = html;

    // Layout buttons
    container.querySelectorAll('.editor-col-layout-option').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var newLayout = btn.dataset.layout;
        var layoutDef = layouts.find(function (l) { return l.key === newLayout; });
        if (!layoutDef) return;

        blocks[index].content.layout = newLayout;
        // Adjust columns
        var cols = blocks[index].content.columns || [];
        while (cols.length < layoutDef.cols.length) {
          cols.push({ width: 50, html: '' });
        }
        while (cols.length > layoutDef.cols.length) {
          cols.pop();
        }
        layoutDef.cols.forEach(function (w, i) {
          cols[i].width = w;
        });
        blocks[index].content.columns = cols;
        renderAllBlocks();
        scheduleAutoSave();
      });
    });

    // Column editors
    var colsDiv = document.createElement('div');
    colsDiv.className = 'editor-columns-layout';

    var columns = c.columns || [];
    columns.forEach(function (col, ci) {
      var slot = document.createElement('div');
      slot.className = 'editor-column-slot';
      slot.style.flex = '0 0 ' + col.width + '%';
      slot.style.maxWidth = col.width + '%';

      var label = document.createElement('div');
      label.style.cssText = 'font-size:11px;color:var(--muted);margin-bottom:6px;letter-spacing:1px;';
      label.textContent = 'COLUMN ' + (ci + 1) + ' (' + col.width + '%)';
      slot.appendChild(label);

      var editable = document.createElement('div');
      editable.className = 'editor-richtext';
      editable.contentEditable = 'true';
      editable.innerHTML = col.html || col.text || '';
      editable.addEventListener('input', function () {
        blocks[index].content.columns[ci].html = editable.innerHTML;
        scheduleAutoSave();
      });
      slot.appendChild(editable);
      colsDiv.appendChild(slot);
    });

    container.appendChild(colsDiv);
  }

  // ── Block operations ──
  function moveBlock(index, direction) {
    var newIndex = index + direction;
    if (newIndex < 0 || newIndex >= blocks.length) return;
    var temp = blocks[index];
    blocks[index] = blocks[newIndex];
    blocks[newIndex] = temp;
    renderAllBlocks();
    scheduleAutoSave();
  }

  function duplicateBlock(index) {
    var clone = JSON.parse(JSON.stringify(blocks[index]));
    clone.id = generateTempId();
    blocks.splice(index + 1, 0, clone);
    renderAllBlocks();
    scheduleAutoSave();
  }

  function deleteBlock(index) {
    if (!confirm('Delete this block?')) return;
    blocks.splice(index, 1);
    renderAllBlocks();
    scheduleAutoSave();
  }

  // ── Save ──
  async function saveGuide(status) {
    setSaveStatus('saving', 'Saving...');

   var title = metaTitle.value.trim();

if (!title) {
  showToast('Please enter a guide title', 'error');
  setSaveStatus('error', 'Title required');
  return;
}

var slug = createSlug(title);

if(!slug){
slug = 'guide-' + Date.now();
}
   var guideData = {

  title: title,
  description: metaDescription.value.trim(),
  cover_image: metaCoverUrl.value.trim(),
  category: metaCategory.value,

};

if(slug){
  guideData.slug = slug;
}
    // When auto-saving (status=null), don't change the current status
    if (status !== null) {
      guideData.status = status;
    }

    try {
      if (isNewGuide) {
        var result = await GuideAPI.createGuide(guideData);
        if (result.error) {
          showToast('Error creating guide: ' + result.error.message, 'error');
          setSaveStatus('error', 'Error');
          return;
        }
        guideId = result.data.id;
        isNewGuide = false;
        // Update URL
        window.history.replaceState(null, '', 'guide-editor.html?id=' + guideId);
        editorTitleEl.textContent = 'Edit: ' + title;
      } else {
        var result = await GuideAPI.updateGuide(guideId, guideData);
        if (result.error) {
          showToast('Error updating guide: ' + result.error.message, 'error');
          setSaveStatus('error', 'Error');
          return;
        }
      }

      // Save blocks
      var blockResult = await GuideAPI.saveAllBlocks(guideId, blocks);
      if (blockResult.error) {
        showToast('Error saving blocks: ' + blockResult.error.message, 'error');
        setSaveStatus('error', 'Error');
        return;
      }

      // Update block IDs from DB
      if (blockResult.data) {
        blockResult.data.forEach(function (dbBlock, i) {
          if (blocks[i]) blocks[i].id = dbBlock.id;
        });
      }

      var statusText = status === 'published' ? 'Published!' : (status === null ? 'Auto-saved!' : 'Draft saved!');
      showToast(statusText, 'success');
      setSaveStatus('saved', statusText);
    } catch (e) {
      showToast('Save error: ' + e.message, 'error');
      setSaveStatus('error', 'Error');
    }
  }

  // ── Auto-save ──
  function scheduleAutoSave() {
    if (autoSaveTimer) clearTimeout(autoSaveTimer);
    if (isNewGuide) return; // Don't auto-save new guides
    setSaveStatus('saving', 'Unsaved changes...');
    autoSaveTimer = setTimeout(function () {
      saveGuide(null); // Save with current status
    }, 2000);
  }

  // ── Mode toggle ──
  function switchMode(mode) {
    currentMode = mode;
    modeEditBtn.classList.toggle('active', mode === 'edit');
    modePreviewBtn.classList.toggle('active', mode === 'preview');
    editModePanel.style.display = mode === 'edit' ? '' : 'none';
    previewModePanel.style.display = mode === 'preview' ? '' : 'none';
    document.getElementById('editorMetaPanel').style.display = mode === 'edit' ? '' : 'none';

    if (mode === 'preview') {
      // Render preview
      var previewBlocks = blocks.map(function (b, i) {
        return { type: b.type, content: b.content, position: i };
      });
      previewContent.innerHTML = GuideRenderer.renderBlocks(previewBlocks);
    }
  }

  // ── Cover upload ──
  async function handleCoverUpload() {
    var file = metaCoverUpload.files[0];
    if (!file) return;
    showToast('Uploading cover image...', 'info');
    var result = await GuideAPI.uploadMedia(file, guideId);
    if (result.url) {
      metaCoverUrl.value = result.url;
      metaCoverPreview.src = result.url;
      metaCoverPreview.style.display = 'block';
      showToast('Cover uploaded!', 'success');
      scheduleAutoSave();
    } else {
      showToast('Upload failed', 'error');
    }
  }

  // ── Utilities ──
  function generateTempId() {
    return 'tmp_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6);
  }

  function escapeAttr(str) {
    return str.replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  function extractYouTubeId(url) {
    if (!url) return null;
    var match = url.match(/(?:youtu\.be\/|youtube\.com\/(?:embed\/|v\/|watch\?v=|watch\?.+&v=))([^&?#]+)/);
    return match ? match[1] : null;
  }

  function setSaveStatus(cls, text) {
    saveStatus.className = 'editor-save-status ' + cls;
    saveStatus.textContent = text;
  }

  function showToast(msg, type) {
    var toast = document.getElementById('guideToast');
    toast.textContent = msg;
    toast.className = 'guide-toast ' + (type || 'info');
    setTimeout(function () { toast.classList.add('show'); }, 10);
    setTimeout(function () { toast.classList.remove('show'); }, 3000);
  }
   
  // ── Utilities ──

function generateTempId() {
  return 'tmp_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6);
}

// SLUG GENERATOR
function createSlug(title){

  return title
  .toLowerCase()
  .trim()
  .replace(/[^\w\s-]/g,'')
  .replace(/\s+/g,'-')

}

})();
