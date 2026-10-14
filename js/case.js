// A Scene case playable in the browser, on the app's own pictures.
//
// The plan, pawns, suspect cards and tool icons are images the app drew of
// itself (app/tool/web_art_test.dart). This file lays an SVG over the plan for
// what changes as you play, copying FloorPlan's geometry and colours: pawns,
// crosses, notes, a lit clue and clashes. The tools are the app's three that
// touch the plan (notes, crosses, place), with strokes across squares and
// pawns dragged on and off the plan.
//
// Nothing is solved here: the frozen case carries its solution and the page
// compares the plan with it.
(function () {
  'use strict';
  var data = JSON.parse(document.getElementById('case-data').textContent);
  var c = data.case, w = data.words, art = data.art;
  var initials = data.initials, colours = data.colours;
  var n = c.size;
  var NS = 'http://www.w3.org/2000/svg';

  // FloorPlan's layout: a ruler band taken out of the square, then the grid.
  var extent = data.extent;
  var gutter = Math.min(Math.max(extent * 0.055, 11), 22);
  var side = (extent - gutter) / n;

  var INK = '#14110F', VERDICT = '#C8102E';
  var CERTAINTY = '#2F6F6B', CERTAINTY_DARK = '#5FA8A2';

  function key(r, col) { return r + ',' + col; }
  var blocked = {}, furnitureAt = {};
  c.furniture.forEach(function (f) {
    (f.cells || [[f.r, f.c]]).forEach(function (rc) {
      var k = key(rc[0], rc[1]);
      furnitureAt[k] = f;
      if (!f.seat) blocked[k] = true;
    });
  });
  var names = c.suspects.map(function (s) { return s.name; });
  var answer = {};
  c.solution.forEach(function (p) { answer[p.suspect] = key(p.r, p.c); });

  var store = 'guilty-hour-case-v2-' + c.id;
  function fresh() {
    return { pos: {}, crosses: {}, scross: {}, notes: {}, used: {}, solved: false };
  }
  var state = fresh();
  try {
    var saved = JSON.parse(localStorage.getItem(store) || 'null');
    if (saved && saved.pos) state = Object.assign(fresh(), saved);
  } catch (e) { /* private mode: play without saving */ }
  var tool = 'place', selected = null, lit = null;

  function save() {
    try { localStorage.setItem(store, JSON.stringify(state)); } catch (e) {}
  }
  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }
  function svg(tag, attrs, text) {
    var e = document.createElementNS(NS, tag);
    for (var a in attrs) e.setAttribute(a, attrs[a]);
    if (text != null) e.textContent = text;
    return e;
  }
  function occupant(k) {
    for (var name in state.pos) if (state.pos[name] === k) return name;
    return null;
  }
  function has(map, k, name) { return (map[k] || []).indexOf(name) >= 0; }
  function toggle(map, k, name, on) {
    var list = (map[k] || []).filter(function (x) { return x !== name; });
    if (on) list.push(name);
    if (list.length) map[k] = list; else delete map[k];
  }
  function say(text) { info.textContent = text; }

  // Layout -----------------------------------------------------------------
  var root = document.getElementById('case');
  var stage = el('div', 'stage');
  var picture = el('img', 'plan-pic');
  picture.src = art + 'plan.webp';
  picture.alt = data.alt;
  picture.width = 720;
  picture.height = 720;
  picture.draggable = false;
  var overlay = svg('svg', { viewBox: '0 0 ' + extent + ' ' + extent, 'class': 'marks' });
  stage.appendChild(picture);
  stage.appendChild(overlay);

  var tools = el('div', 'tools');
  var toolButtons = {};
  ['notes', 'crosses', 'place'].forEach(function (name) {
    var b = el('button', 'tool');
    b.type = 'button';
    var icon = el('span', 'tool-icon');
    icon.style.webkitMaskImage = icon.style.maskImage = 'url(' + data.tools + name + '.webp)';
    b.appendChild(icon);
    b.appendChild(el('span', 'tool-label', w.tools[name]));
    b.addEventListener('click', function () {
      tool = name;
      say(hintFor());
      render();
    });
    toolButtons[name] = b;
    tools.appendChild(b);
  });

  var info = el('p', 'case-info');
  var tray = el('div', 'tray');
  var cards = names.map(function (name, i) {
    var b = el('button', 'card');
    b.type = 'button';
    var img = el('img');
    img.src = art + 'card-' + i + '.webp';
    img.alt = name;
    img.draggable = false;
    b.appendChild(img);
    b.addEventListener('pointerdown', function (ev) { pressCard(ev, name); });
    tray.appendChild(b);
    return b;
  });

  var clueList = el('ol', 'clues');
  var clueRows = c.clues.map(function (clue, i) {
    var li = el('li');
    var b = el('button', 'clue');
    b.type = 'button';
    b.appendChild(el('span', 'num', String(i + 1)));
    b.appendChild(el('span', 'text', clue.text));
    b.addEventListener('click', function () {
      // Off, lit on the plan, used, and back again.
      if (lit === i) { lit = null; state.used[i] = true; }
      else if (state.used[i]) { delete state.used[i]; }
      else { lit = i; }
      save();
      render();
    });
    li.appendChild(b);
    clueList.appendChild(li);
    return b;
  });

  var solve = el('button', 'solve', w.solve);
  solve.type = 'button';
  solve.addEventListener('click', function () {
    var wrong = names.filter(function (x) { return state.pos[x] !== answer[x]; }).length;
    if (wrong) {
      say(wrong === 1 ? w.wrongOne : w.wrong.replace('%d', wrong));
      return;
    }
    state.solved = true;
    selected = null; lit = null;
    save();
    render();
    verdict.scrollIntoView({ behavior: 'smooth', block: 'center' });
  });
  var reset = el('button', 'reset', w.reset);
  reset.type = 'button';
  reset.addEventListener('click', function () {
    state = fresh();
    lit = null; selected = null; tool = 'place';
    say(w.start);
    save();
    render();
  });
  var verdict = document.getElementById('verdict');

  function hintFor() {
    if (tool === 'notes') return selected ? w.notesFor.replace('%s', selected) : w.notesNeed;
    if (tool === 'crosses') return selected ? w.crossesFor.replace('%s', selected) : w.crossesAll;
    return selected ? w.place.replace('%s', selected) : w.start;
  }

  // Pointer: taps, strokes and drags --------------------------------------
  function cellAt(x, y) {
    var box = overlay.getBoundingClientRect();
    var px = (x - box.left) / box.width * extent - gutter;
    var py = (y - box.top) / box.height * extent - gutter;
    if (px < 0 || py < 0 || x > box.right || y > box.bottom) return null;
    var col = Math.floor(px / side), r = Math.floor(py / side);
    if (r >= n || col >= n) return null;
    return [r, col];
  }

  var ghost = null, drag = null, stroke = null;

  function startGhost(name, ev) {
    var box = overlay.getBoundingClientRect();
    var size = box.width * side / extent * 1.15;
    ghost = el('img', 'ghost');
    ghost.src = art + 'pawn-' + names.indexOf(name) + '.webp';
    ghost.style.width = ghost.style.height = size + 'px';
    document.body.appendChild(ghost);
    moveGhost(ev);
  }
  function moveGhost(ev) {
    if (!ghost) return;
    var size = parseFloat(ghost.style.width);
    ghost.style.left = (ev.clientX - size / 2) + 'px';
    ghost.style.top = (ev.clientY - size / 2) + 'px';
  }
  function endGhost() {
    if (ghost) ghost.remove();
    ghost = null;
  }

  function pressCard(ev, name) {
    if (state.solved) return;
    ev.preventDefault();
    drag = { name: name, x: ev.clientX, y: ev.clientY, from: null, moved: false };
    listen();
  }

  function listen() {
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onCancel);
  }
  function unlisten() {
    window.removeEventListener('pointermove', onMove);
    window.removeEventListener('pointerup', onUp);
    window.removeEventListener('pointercancel', onCancel);
  }

  overlay.addEventListener('pointerdown', function (ev) {
    if (state.solved) return;
    var at = cellAt(ev.clientX, ev.clientY);
    if (!at) return;
    ev.preventDefault();
    var k = key(at[0], at[1]);
    var who = occupant(k);
    if (who) {
      // A pawn under the finger is there to be picked or dragged, whatever
      // the tool, as in the app.
      drag = { name: who, x: ev.clientX, y: ev.clientY, from: k, moved: false };
      listen();
      return;
    }
    if (tool === 'place') {
      tapPlace(at, k);
      return;
    }
    if (tool === 'notes' && !selected) {
      say(w.notesNeed);
      return;
    }
    if (blocked[k]) {
      say(w.furniture.replace('%s', furnitureAt[k].name));
      return;
    }
    var on = tool === 'notes' ? !has(state.notes, k, selected)
      : selected ? !has(state.scross, k, selected) : !state.crosses[k];
    stroke = { on: on, done: {} };
    mark(at);
    listen();
  });

  function mark(at) {
    var k = key(at[0], at[1]);
    if (stroke.done[k] || blocked[k] || occupant(k)) return;
    stroke.done[k] = true;
    if (tool === 'notes') toggle(state.notes, k, selected, stroke.on);
    else if (selected) toggle(state.scross, k, selected, stroke.on);
    else if (stroke.on) state.crosses[k] = true;
    else delete state.crosses[k];
    render();
  }

  function onMove(ev) {
    if (stroke) {
      var at = cellAt(ev.clientX, ev.clientY);
      if (at) mark(at);
      return;
    }
    if (!drag) return;
    if (!drag.moved && Math.hypot(ev.clientX - drag.x, ev.clientY - drag.y) > 6) {
      drag.moved = true;
      startGhost(drag.name, ev);
      if (drag.from) { takeOff(drag.name); render(); }
    }
    moveGhost(ev);
  }

  function onUp(ev) {
    unlisten();
    if (stroke) { stroke = null; save(); return; }
    var d = drag;
    drag = null;
    endGhost();
    if (!d) return;
    if (!d.moved) {
      // A tap: pick that suspect.
      selected = d.name;
      say(hintFor());
      render();
      return;
    }
    var at = cellAt(ev.clientX, ev.clientY);
    if (at && put(d.name, at)) {
      selected = null;
      say(hintFor());
    } else if (d.from && at) {
      // Dropped on furniture: back where it came from.
      put(d.name, d.from.split(',').map(Number));
    }
    save();
    render();
  }

  function onCancel() {
    unlisten();
    stroke = null;
    if (drag && drag.from && drag.moved) put(drag.name, drag.from.split(',').map(Number));
    drag = null;
    endGhost();
    render();
  }

  // Who a clue is about: its subject, and the other suspect when it names one.
  function cast(clue) {
    return names.indexOf(clue.other) >= 0 ? [clue.subject, clue.other] : [clue.subject];
  }
  function room(k) {
    var rc = k.split(',').map(Number);
    return c.roomAt[rc[0]][rc[1]];
  }
  function inPath(k, at) {
    var a = k.split(','), b = at.split(',');
    return k !== at && (a[0] === b[0] || a[1] === b[1] || room(k) === room(at));
  }

  // Board.place with the app's default settings: the cross under the pawn
  // goes, the suspect's own marks go everywhere, and so does every mark in the
  // new pawn's row, column and room. A clue whose suspects are all placed
  // counts as used.
  function put(name, at) {
    var k = key(at[0], at[1]);
    if (blocked[k]) { say(w.furniture.replace('%s', furnitureAt[k].name)); return false; }
    var other = occupant(k);
    if (other && other !== name) takeOff(other);
    state.pos[name] = k;
    delete state.crosses[k];
    [state.notes, state.scross].forEach(function (map) {
      Object.keys(map).forEach(function (cell) {
        if (inPath(cell, k)) delete map[cell];
        else toggle(map, cell, name, false);
      });
    });
    c.clues.forEach(function (clue, i) {
      if (cast(clue).indexOf(name) >= 0 &&
          cast(clue).every(function (x) { return state.pos[x]; })) {
        state.used[i] = true;
      }
    });
    return true;
  }

  // Board.removeSuspect: off the plan, and their clues back into play.
  function takeOff(name) {
    delete state.pos[name];
    c.clues.forEach(function (clue, i) {
      if (cast(clue).indexOf(name) >= 0) delete state.used[i];
    });
  }

  function tapPlace(at, k) {
    if (!selected) { say(w.start); return; }
    if (put(selected, at)) {
      selected = null;
      say(hintFor());
    }
    save();
    render();
  }

  // Drawing ----------------------------------------------------------------
  function rect(r, col, inset) {
    return { x: gutter + col * side + inset, y: gutter + r * side + inset,
             width: side - 2 * inset, height: side - 2 * inset };
  }
  function lines(cx, cy, half, colour, width, opacity) {
    var g = svg('g', { stroke: colour, 'stroke-width': width, 'stroke-linecap': 'round',
                       'stroke-opacity': opacity == null ? 1 : opacity });
    g.appendChild(svg('line', { x1: cx - half, y1: cy - half, x2: cx + half, y2: cy + half }));
    g.appendChild(svg('line', { x1: cx + half, y1: cy - half, x2: cx - half, y2: cy + half }));
    return g;
  }
  function label(cx, cy, text, size) {
    return svg('text', { x: cx, y: cy, 'font-size': size, 'class': 'mark-label',
                         'dominant-baseline': 'central', 'text-anchor': 'middle' }, text);
  }

  // FloorPlan's _paintNote: a rounded tile in the suspect's colour.
  function note(cx, cy, ext, i, faded) {
    var g = svg('g', { opacity: faded ? 0.55 : 1 });
    g.appendChild(svg('rect', { x: cx - ext / 2, y: cy - ext / 2, width: ext, height: ext,
                                rx: ext * 0.25, fill: colours[i] }));
    var t = initials[i];
    g.appendChild(label(cx, cy, t, ext * (t.length === 1 ? 0.72 : 0.5)));
    return g;
  }
  // FloorPlan's _paintSuspectCross: a red cross with the suspect's badge on it.
  function suspectCross(cx, cy, ext, i, faded) {
    var g = svg('g', { opacity: faded ? 0.55 : 1 });
    g.appendChild(lines(cx, cy, ext * 0.46, VERDICT, Math.max(1.8, ext * 0.11), 0.95));
    var radius = ext * 0.33;
    g.appendChild(svg('circle', { cx: cx, cy: cy, r: radius, fill: colours[i], stroke: '#fff',
                                  'stroke-width': Math.max(1.2, ext * 0.05) }));
    var t = initials[i];
    g.appendChild(label(cx, cy, t, radius * (t.length === 1 ? 1.25 : 0.9)));
    return g;
  }

  function clashes() {
    var seen = {}, cells = {};
    names.forEach(function (name) {
      var k = state.pos[name];
      if (!k) return;
      var rc = k.split(',').map(Number);
      ['r' + rc[0], 'c' + rc[1], 'm' + c.roomAt[rc[0]][rc[1]]].forEach(function (g) {
        if (seen[g]) { cells[k] = true; cells[seen[g]] = true; }
        else seen[g] = k;
      });
    });
    return cells;
  }

  function render() {
    while (overlay.firstChild) overlay.removeChild(overlay.firstChild);
    picture.src = art + (state.solved ? 'solved.webp' : 'plan.webp');

    if (!state.solved) {
      var bad = clashes();
      // Board.autoCrosses: the rest of every placed suspect's row, column and
      // room, drawn lighter than the player's own crosses.
      var placed = names.map(function (x) { return state.pos[x]; }).filter(Boolean);
      var implied = {};
      for (var ar = 0; ar < n; ar++) {
        for (var ac = 0; ac < n; ac++) {
          var ak = key(ar, ac);
          if (blocked[ak] || occupant(ak)) continue;
          if (placed.some(function (at) { return inPath(ak, at); })) implied[ak] = true;
        }
      }
      var clue = lit == null ? null : c.clues[lit];
      var litCells = {};
      if (clue) clue.cells.forEach(function (rc) { litCells[key(rc[0], rc[1])] = true; });

      for (var r = 0; r < n; r++) {
        for (var col = 0; col < n; col++) {
          var k = key(r, col);
          var box = rect(r, col, 0);
          if (clue && !litCells[k]) overlay.appendChild(svg('rect', Object.assign(box, { fill: '#000', 'fill-opacity': 0.38 })));
          if (clue && litCells[k] && clue.positive) overlay.appendChild(svg('rect', Object.assign(rect(r, col, 0), { fill: CERTAINTY, 'fill-opacity': 0.3 })));
          if (bad[k]) overlay.appendChild(svg('rect', Object.assign(rect(r, col, 0), { fill: VERDICT, 'fill-opacity': 0.34 })));
          if (occupant(k)) continue;
          var cx = gutter + (col + 0.5) * side, cy = gutter + (r + 0.5) * side;
          if (state.crosses[k]) {
            overlay.appendChild(lines(cx, cy, side * 0.3, VERDICT, Math.max(2, side * 0.08), 0.9));
          } else if (implied[k]) {
            overlay.appendChild(lines(cx, cy, side * 0.3, VERDICT, Math.max(1.8, side * 0.065), 0.5));
          }
          // Laid out by how many marks the square holds, as the app does.
          var here = [];
          names.forEach(function (name) { if (has(state.notes, k, name)) here.push([name, false]); });
          if (!state.crosses[k]) {
            names.forEach(function (name) { if (has(state.scross, k, name)) here.push([name, true]); });
          }
          if (!here.length) continue;
          var perRow = here.length === 1 ? 1 : Math.ceil(Math.sqrt(here.length));
          var slot = side * (here.length === 1 ? 0.62 : 0.84) / perRow;
          var inset = (side - slot * perRow) / 2;
          here.forEach(function (m, j) {
            var i = names.indexOf(m[0]);
            var faded = selected != null && selected !== m[0];
            var x = box.x + inset + slot * (j % perRow + 0.5);
            var y = box.y + inset + slot * (Math.floor(j / perRow) + 0.5);
            overlay.appendChild(m[1] ? suspectCross(x, y, slot * 0.9, i, faded)
                                     : note(x, y, slot * 0.9, i, faded));
          });
        }
      }
      if (clue) {
        clue.cells.forEach(function (rc) {
          var b = rect(rc[0], rc[1], side * 0.06);
          overlay.appendChild(svg('rect', Object.assign(b, {
            rx: side * 0.12, fill: 'none',
            stroke: clue.positive ? CERTAINTY_DARK : INK,
            'stroke-width': Math.max(2, side * 0.06)
          })));
          if (!clue.positive) {
            overlay.appendChild(lines(gutter + (rc[1] + 0.5) * side, gutter + (rc[0] + 0.5) * side,
                                      side * 0.18, INK, 1.8, 0.55));
          }
        });
      }
      names.forEach(function (name, i) {
        var at = state.pos[name];
        if (!at) return;
        var rc = at.split(',').map(Number);
        var b = rect(rc[0], rc[1], 0);
        overlay.appendChild(svg('image', { href: art + 'pawn-' + i + '.webp',
                                           x: b.x, y: b.y, width: b.width, height: b.height }));
        if (name === selected) {
          overlay.appendChild(svg('circle', { cx: b.x + side / 2, cy: b.y + side / 2,
            r: side * 0.4, fill: 'none', stroke: VERDICT, 'stroke-width': Math.max(2, side * 0.06) }));
        }
      });
    }

    Object.keys(toolButtons).forEach(function (name) {
      toolButtons[name].classList.toggle('on', tool === name);
    });
    tools.hidden = state.solved;
    names.forEach(function (name, i) {
      cards[i].hidden = !!state.pos[name] || state.solved;
      cards[i].classList.toggle('on', selected === name);
    });
    clueRows.forEach(function (b, i) {
      b.classList.toggle('on', lit === i);
      b.classList.toggle('used', !!state.used[i]);
    });
    var full = names.every(function (x) { return state.pos[x]; });
    solve.disabled = !full || state.solved;
    if (state.solved) {
      say(w.solved);
      verdict.querySelector('.who').textContent = c.killer;
      verdict.querySelector('.why').textContent = w.why
        .replace('%k', c.killer).replace('%v', c.victim.name)
        .replace('%r', c.rooms[c.victim.room].nameIn);
      verdict.hidden = false;
    } else {
      if (full && !selected && tool === 'place') say(w.full);
      verdict.hidden = true;
    }
  }

  var actions = el('div', 'actions');
  actions.appendChild(solve);
  actions.appendChild(reset);
  root.appendChild(stage);
  root.appendChild(tools);
  root.appendChild(info);
  root.appendChild(tray);
  root.appendChild(actions);
  root.appendChild(verdict);
  root.appendChild(el('h2', null, w.clues));
  root.appendChild(el('p', 'hint', w.clueHint));
  root.appendChild(clueList);
  root.hidden = false;
  say(state.solved ? w.solved : w.start);
  render();
})();
