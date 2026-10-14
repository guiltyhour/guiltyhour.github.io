// A Scene case playable in the browser, on the app's own pictures.
//
// The plan, the pawns and the suspect cards are images the app drew of itself
// (app/tool/web_art_test.dart). This file only lays an SVG over the plan for
// what changes as you play, with the geometry and colours of FloorPlan:
// pawns, crosses, a lit clue and clashes. Nothing is solved here: the frozen
// case carries its solution and the page compares the plan with it.
(function () {
  'use strict';
  var data = JSON.parse(document.getElementById('case-data').textContent);
  var c = data.case, w = data.words, art = data.art;
  var n = c.size;
  var NS = 'http://www.w3.org/2000/svg';

  // FloorPlan's layout: a ruler band taken out of the square, then the grid.
  var extent = data.extent;
  var gutter = Math.min(Math.max(extent * 0.055, 11), 22);
  var side = (extent - gutter) / n;

  var INK = '#14110F', VERDICT = '#C8102E', PAPER = '#F4F1EA';
  var CERTAINTY = '#2F6F6B', CERTAINTY_DARK = '#5FA8A2';

  function key(r, col) { return r + ',' + col; }
  var blocked = {}, seatAt = {}, furnitureAt = {};
  c.furniture.forEach(function (f) {
    (f.cells || [[f.r, f.c]]).forEach(function (rc) {
      var k = key(rc[0], rc[1]);
      furnitureAt[k] = f;
      if (f.seat) seatAt[k] = true; else blocked[k] = true;
    });
  });
  var names = c.suspects.map(function (s) { return s.name; });
  var answer = {};
  c.solution.forEach(function (p) { answer[p.suspect] = key(p.r, p.c); });

  var store = 'guilty-hour-case-' + c.id;
  var state = { pos: {}, crosses: {}, used: {}, solved: false };
  try {
    var saved = JSON.parse(localStorage.getItem(store) || 'null');
    if (saved && saved.pos) state = saved;
  } catch (e) { /* private mode: play without saving */ }
  var selected = state.solved ? null : firstFree(), lit = null;

  function save() {
    try { localStorage.setItem(store, JSON.stringify(state)); } catch (e) {}
  }
  function firstFree() {
    return names.filter(function (x) { return !state.pos[x]; })[0] || null;
  }
  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }
  function svg(tag, attrs) {
    var e = document.createElementNS(NS, tag);
    for (var a in attrs) e.setAttribute(a, attrs[a]);
    return e;
  }

  var root = document.getElementById('case');
  var stage = el('div', 'stage');
  var picture = el('img', 'plan');
  picture.src = art + 'plan.webp';
  picture.alt = data.alt;
  picture.width = 720;
  picture.height = 720;
  var overlay = svg('svg', { viewBox: '0 0 ' + extent + ' ' + extent, 'class': 'marks' });
  stage.appendChild(picture);
  stage.appendChild(overlay);

  var info = el('p', 'case-info');
  var tray = el('div', 'tray');
  var cards = names.map(function (name, i) {
    var b = el('button', 'card');
    b.type = 'button';
    var img = el('img');
    img.src = art + 'card-' + i + '.webp';
    img.alt = name;
    b.appendChild(img);
    b.addEventListener('click', function () {
      if (state.solved) return;
      selected = name;
      info.textContent = '';
      render();
    });
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
      info.textContent = '';
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
      info.textContent = wrong === 1 ? w.wrongOne : w.wrong.replace('%d', wrong);
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
    state = { pos: {}, crosses: {}, used: {}, solved: false };
    lit = null;
    info.textContent = '';
    selected = firstFree();
    save();
    render();
  });
  var verdict = document.getElementById('verdict');

  overlay.addEventListener('click', function (ev) {
    if (state.solved) return;
    var box = overlay.getBoundingClientRect();
    var x = (ev.clientX - box.left) / box.width * extent - gutter;
    var y = (ev.clientY - box.top) / box.height * extent - gutter;
    if (x < 0 || y < 0) return;
    var col = Math.floor(x / side), r = Math.floor(y / side);
    if (r >= n || col >= n) return;
    onSquare(r, col);
  });

  function occupant(k) {
    for (var name in state.pos) if (state.pos[name] === k) return name;
    return null;
  }

  function onSquare(r, col) {
    var k = key(r, col);
    var who = occupant(k);
    var f = furnitureAt[k];
    info.textContent = '';
    if (who) {
      delete state.pos[who];
      selected = who;
    } else if (blocked[k]) {
      info.textContent = w.furniture.replace('%s', f.name);
      render();
      return;
    } else if (selected) {
      state.pos[selected] = k;
      delete state.crosses[k];
      selected = firstFree();
    } else if (state.crosses[k]) {
      delete state.crosses[k];
    } else {
      state.crosses[k] = true;
    }
    save();
    render();
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

  function rect(r, col, inset) {
    return { x: gutter + col * side + inset, y: gutter + r * side + inset,
             width: side - 2 * inset, height: side - 2 * inset };
  }
  function cross(r, col, inset, colour, width) {
    var b = rect(r, col, inset);
    var g = svg('g', { stroke: colour, 'stroke-width': width, 'stroke-linecap': 'round' });
    g.appendChild(svg('line', { x1: b.x, y1: b.y, x2: b.x + b.width, y2: b.y + b.height }));
    g.appendChild(svg('line', { x1: b.x + b.width, y1: b.y, x2: b.x, y2: b.y + b.height }));
    return g;
  }

  function render() {
    while (overlay.firstChild) overlay.removeChild(overlay.firstChild);
    picture.src = art + (state.solved ? 'solved.webp' : 'plan.webp');

    if (!state.solved) {
      var bad = clashes();
      var clue = lit == null ? null : c.clues[lit];
      var litCells = {};
      if (clue) clue.cells.forEach(function (rc) { litCells[key(rc[0], rc[1])] = true; });

      for (var r = 0; r < n; r++) {
        for (var col = 0; col < n; col++) {
          var k = key(r, col);
          if (clue && !litCells[k]) {
            overlay.appendChild(svg('rect', Object.assign(rect(r, col, 0), { fill: 'rgba(0,0,0,.38)' })));
          }
          if (clue && litCells[k] && clue.positive) {
            overlay.appendChild(svg('rect', Object.assign(rect(r, col, 0), { fill: CERTAINTY, 'fill-opacity': .3 })));
          }
          if (bad[k]) {
            overlay.appendChild(svg('rect', Object.assign(rect(r, col, 0), { fill: VERDICT, 'fill-opacity': .34 })));
          }
          if (state.crosses[k] && !occupant(k)) {
            overlay.appendChild(cross(r, col, side * 0.2, VERDICT, Math.max(2, side * 0.08)));
          }
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
            overlay.appendChild(cross(rc[0], rc[1], side * 0.32, 'rgba(20,17,15,.55)', 1.8));
          }
        });
      }
      names.forEach(function (name, i) {
        var at = state.pos[name];
        if (!at) return;
        var rc = at.split(',').map(Number);
        var b = rect(rc[0], rc[1], 0);
        var img = svg('image', { href: art + 'pawn-' + i + '.webp',
                                 x: b.x, y: b.y, width: b.width, height: b.height });
        overlay.appendChild(img);
        if (name === selected) {
          overlay.appendChild(svg('circle', { cx: b.x + side / 2, cy: b.y + side / 2,
            r: side * 0.4, fill: 'none', stroke: VERDICT, 'stroke-width': Math.max(2, side * 0.06) }));
        }
      });
    }

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
    if (!info.textContent || state.solved) {
      info.textContent = state.solved ? w.solved
        : selected ? w.place.replace('%s', selected) : full ? w.full : w.start;
    }
    if (state.solved) {
      verdict.querySelector('.who').textContent = c.killer;
      verdict.querySelector('.why').textContent = w.why
        .replace('%k', c.killer).replace('%v', c.victim.name)
        .replace('%r', c.rooms[c.victim.room].nameIn);
      verdict.hidden = false;
    } else {
      verdict.hidden = true;
    }
  }

  var actions = el('div', 'actions');
  actions.appendChild(solve);
  actions.appendChild(reset);
  root.appendChild(stage);
  root.appendChild(info);
  root.appendChild(tray);
  root.appendChild(actions);
  root.appendChild(verdict);
  root.appendChild(el('h2', null, w.clues));
  root.appendChild(el('p', 'hint', w.clueHint));
  root.appendChild(clueList);
  root.hidden = false;
  render();
})();
