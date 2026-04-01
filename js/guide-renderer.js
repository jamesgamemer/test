/* ============================================================
   7DS ORIGIN - GUIDE BLOCK RENDERER
   Converts guide_blocks JSON into display HTML
   ============================================================ */

var GuideRenderer = (function () {

  function renderBlocks(blocks) {
    if (!blocks || blocks.length === 0) return '';
    var html = '';
    blocks.forEach(function (block) {
      html += renderBlock(block);
    });
    return html;
  }

  function renderBlock(block) {
    var c = block.content || {};
    switch (block.type) {
      case 'header':   return renderHeader(c);
      case 'text':     return renderText(c);
      case 'image':    return renderImage(c);
      case 'video':    return renderVideo(c);
      case 'table':    return renderTable(c);
      case 'list':     return renderList(c);
      case 'divider':  return renderDivider();
      case 'spacer':   return renderSpacer(c);
      case 'box':      return renderBox(c);
      case 'columns':  return renderColumns(c);
      default:         return '';
    }
  }

  function renderHeader(c) {
    var level = c.level || 2;
    var text = c.text || '';
    var align = c.align ? ' style="text-align:' + c.align + '"' : '';
    return '<div class="gb-block gb-header"><h' + level + align + '>' + text + '</h' + level + '></div>';
  }

  function renderText(c) {
    var html = c.html || c.text || '';
    var style = '';
    if (c.align) style += 'text-align:' + c.align + ';';
    if (c.fontSize) style += 'font-size:' + c.fontSize + ';';
    if (c.color) style += 'color:' + c.color + ';';
    var styleAttr = style ? ' style="' + style + '"' : '';
    return '<div class="gb-block gb-text"' + styleAttr + '>' + html + '</div>';
  }

  function renderImage(c) {

var src = c.url || c.src || '';
var caption = c.caption || '';
var width = c.width || '100%';

var html = '<div class="gb-block gb-image">';

html += '<img src="' + src + '" alt="' + caption + '" style="width:' + width + ';max-width:100%" loading="lazy">';

if (caption) html += '<div class="gb-image-caption">' + caption + '</div>';

html += '</div>';

return html;

}

  function renderVideo(c) {
    var html = '<div class="gb-block">';
    if (c.youtube) {
      var videoId = extractYouTubeId(c.youtube);
      if (videoId) {
        html += '<div class="gb-video"><iframe src="https://www.youtube.com/embed/' + videoId + '" frameborder="0" allowfullscreen></iframe></div>';
      }
    } else if (c.url) {
      html += '<div class="gb-video"><video src="' + c.url + '" controls></video></div>';
    }
    html += '</div>';
    return html;
  }

  function renderTable(c) {
    var headers = c.headers || [];
    var rows = c.rows || [];
    var html = '<div class="gb-block"><div class="gb-table-wrapper"><table class="gb-table">';
    if (headers.length > 0) {
      html += '<thead><tr>';
      headers.forEach(function (h) { html += '<th>' + h + '</th>'; });
      html += '</tr></thead>';
    }
    html += '<tbody>';
    rows.forEach(function (row) {
      html += '<tr>';
      row.forEach(function (cell) { html += '<td>' + cell + '</td>'; });
      html += '</tr>';
    });
    html += '</tbody></table></div></div>';
    return html;
  }

  function renderList(c) {
    var items = c.items || [];
    var ordered = c.ordered || false;
    var tag = ordered ? 'ol' : 'ul';
    var html = '<div class="gb-block"><' + tag + ' class="gb-list">';
    items.forEach(function (item) { html += '<li>' + item + '</li>'; });
    html += '</' + tag + '></div>';
    return html;
  }

  function renderDivider() {
    return '<hr class="gb-divider">';
  }

  function renderSpacer(c) {
    var height = c.height || 32;
    return '<div class="gb-spacer" style="height:' + height + 'px"></div>';
  }

  function renderBox(c) {
    var boxType = c.boxType || 'info';
    var title = c.title || '';
    var content = c.html || c.text || '';
    var html = '<div class="gb-block gb-box gb-box-' + boxType + '">';
    if (title) html += '<div class="gb-box-title">' + title + '</div>';
    html += '<div class="gb-box-content">' + content + '</div>';
    html += '</div>';
    return html;
  }

  function renderColumns(c) {
    var columns = c.columns || [];
    var html = '<div class="gb-block gb-columns">';
    columns.forEach(function (col) {
      var width = col.width || 50;
      html += '<div class="gb-column" style="flex:0 0 ' + width + '%;max-width:' + width + '%">';
      html += col.html || col.text || '';
      html += '</div>';
    });
    html += '</div>';
    return html;
  }

  function extractYouTubeId(url) {
    if (!url) return null;
    var match = url.match(/(?:youtu\.be\/|youtube\.com\/(?:embed\/|v\/|watch\?v=|watch\?.+&v=))([^&?#]+)/);
    return match ? match[1] : null;
  }

  return {
    renderBlocks: renderBlocks,
    renderBlock: renderBlock
  };

})();
