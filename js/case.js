// A Scene case playable in the browser. Nothing is solved here: the frozen case
// already carries its solution, so the page only compares the plan with it.
(function () {
  'use strict';
  var data = JSON.parse(document.getElementById('case-data').textContent);
  var c = data.case, w = data.words;
  var n = c.size;
  var root = document.getElementById('case');

  var TINTS = ['#E6D9BD', '#B9CCC4', '#D7C3DA', '#BFCFE4', '#E9CDBB',
               '#CADACF', '#E3D3A6', '#C9C3E0', '#D9C8B4', '#B8D3D9'];
  var PAWNS = ['#8E44AD', '#2E86C1', '#117A65', '#CA6F1E', '#B03A2E',
               '#1F618D', '#7D6608', '#6C3483', '#0E6655', '#922B21'];
  var ICONS = {
    armchair: '🛋️', armour: '🛡️', barrel: '🛢️', bathtub: '🛁', bed: '🛏️',
    bell: '🛎️', bench: '🪑', billiard: '🎱', binoculars: '🔭', bust: '🗿',
    cabinet: '🗄️', candelabra: '🕯️', canopybed: '🛏️', cartwheel: '☸️',
    chair: '🪑', chest: '🧰', clock: '🕰️', cupboard: '🚪', desk: '🗃️',
    envelope: '✉️', fireplace: '🔥', flag: '🚩', gear: '⚙️', globe: '🌐',
    gramophone: '📯', grandfatherclock: '🕰️', hanger: '🧥', harp: '🎼',
    lantern: '🏮', lifering: '⚓', mirror: '🪞', music: '🎵', olive: '🫒',
    palmtree: '🌴', piano: '🎹', plant: '🪴', pot: '🍲', rack: '🗄️',
    rope: '🪢', roulette: '🎡', sandbag: '🎒', shelf: '📚', sideboard: '🗄️',
    skis: '🎿', sofa: '🛋️', spotlight: '💡', spyglass: '🔭', stove: '🍳',
    stretcher: '🩼', suitcase: '🧳', table: '🍽️', tablelamp: '💡',
    teapot: '🫖', tree: '🌳', trophy: '🏆', umbrella: '☂️',
    umbrellastand: '🌂', wheel: '☸️'
  };

  function key(r, col) { return r + ',' + col; }
  function square(r, col) { return String.fromCharCode(65 + col) + (r + 1); }

  var furnitureAt = {};
  c.furniture.forEach(function (f) {
    (f.cells || [[f.r, f.c]]).forEach(function (rc) {
      furnitureAt[key(rc[0], rc[1])] = f;
    });
  });
  var names = c.suspects.map(function (s) { return s.name; });
  var answer = {};
  c.solution.forEach(function (p) { answer[p.suspect] = key(p.r, p.c); });

  var store = 'guilty-hour-case-' + c.id;
  var state = { pos: {}, crosses: {}, clues: {}, solved: false };
  try {
    var saved = JSON.parse(localStorage.getItem(store) || 'null');
    if (saved && saved.pos) state = saved;
  } catch (e) { /* private mode: play without saving */ }
  var selected = null, lit = null;

  function save() {
    try { localStorage.setItem(store, JSON.stringify(state)); } catch (e) {}
  }

  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }

  // Board ----------------------------------------------------------------
  var board = el('div', 'board');
  board.style.setProperty('--n', n);
  board.setAttribute('role', 'grid');
  var cells = {};
  for (var r = 0; r < n; r++) {
    for (var col = 0; col < n; col++) {
      var b = el('button', 'sq');
      b.type = 'button';
      var room = c.roomAt[r][col];
      b.style.background = TINTS[room % TINTS.length];
      var edge = function (rr, cc) {
        return rr < 0 || cc < 0 || rr >= n || cc >= n || c.roomAt[rr][cc] !== room;
      };
      b.style.borderTopWidth = edge(r - 1, col) ? '3px' : '1px';
      b.style.borderBottomWidth = edge(r + 1, col) ? '3px' : '1px';
      b.style.borderLeftWidth = edge(r, col - 1) ? '3px' : '1px';
      b.style.borderRightWidth = edge(r, col + 1) ? '3px' : '1px';
      var f = furnitureAt[key(r, col)];
      if (f) {
        b.classList.add(f.seat ? 'seat' : 'furn');
        if (f.r === r && f.c === col) b.appendChild(el('span', 'icon', ICONS[f.icon] || '◆'));
      }
      b.dataset.r = r;
      b.dataset.c = col;
      b.setAttribute('aria-label', square(r, col) + ', ' + c.rooms[room].name +
                     (f ? ', ' + f.name : ''));
      b.addEventListener('click', onSquare);
      cells[key(r, col)] = b;
      board.appendChild(b);
    }
  }

  var info = el('p', 'case-info', w.start);
  var chips = el('div', 'chips');
  var chipFor = {};
  names.forEach(function (name, i) {
    var chip = el('button', 'chip');
    chip.type = 'button';
    var dot = el('span', 'dot', name.charAt(0));
    dot.style.background = PAWNS[i % PAWNS.length];
    chip.appendChild(dot);
    chip.appendChild(document.createTextNode(name));
    chip.addEventListener('click', function () {
      if (state.solved) return;
      // Always selects: after a placement the next suspect is already chosen,
      // and tapping it should not undo that.
      selected = name;
      info.textContent = w.place.replace('%s', name);
      render();
    });
    chipFor[name] = chip;
    chips.appendChild(chip);
  });

  var clueList = el('ol', 'clues');
  var clueItems = c.clues.map(function (clue, i) {
    var li = el('li');
    var btn = el('button', 'clue', clue.text);
    btn.type = 'button';
    btn.addEventListener('click', function () {
      // Off, lit on the plan, ticked off, and back again.
      if (lit === i) { lit = null; state.clues[i] = true; }
      else if (state.clues[i]) { delete state.clues[i]; }
      else { lit = i; }
      save();
      render();
    });
    li.appendChild(btn);
    clueList.appendChild(li);
    return btn;
  });

  var solve = el('button', 'solve', w.solve);
  solve.type = 'button';
  solve.addEventListener('click', onSolve);
  var reset = el('button', 'reset', w.reset);
  reset.type = 'button';
  reset.addEventListener('click', function () {
    state = { pos: {}, crosses: {}, clues: {}, solved: false };
    selected = null; lit = null;
    verdict.hidden = true;
    info.textContent = w.start;
    save();
    render();
  });
  var verdict = document.getElementById('verdict');

  function occupant(k) {
    for (var name in state.pos) if (state.pos[name] === k) return name;
    return null;
  }

  function onSquare(ev) {
    if (state.solved) return;
    var b = ev.currentTarget;
    var k = key(+b.dataset.r, +b.dataset.c);
    var f = furnitureAt[k];
    var who = occupant(k);
    if (who) {
      delete state.pos[who];
      selected = who;
    } else if (f && !f.seat) {
      info.textContent = w.furniture.replace('%s', f.name);
      render();
      return;
    } else if (selected) {
      state.pos[selected] = k;
      delete state.crosses[k];
      selected = names.filter(function (x) { return !state.pos[x]; })[0] || null;
    } else if (state.crosses[k]) {
      delete state.crosses[k];
    } else {
      state.crosses[k] = true;
    }
    if (f && f.seat) info.textContent = w.seat.replace('%s', f.name);
    else info.textContent = selected ? w.place.replace('%s', selected) : w.start;
    save();
    render();
  }

  function clashes() {
    var seen = {}, bad = {};
    names.forEach(function (name) {
      var k = state.pos[name];
      if (!k) return;
      var rc = k.split(',').map(Number);
      ['r' + rc[0], 'c' + rc[1], 'm' + c.roomAt[rc[0]][rc[1]]].forEach(function (g) {
        if (seen[g]) { bad[name] = true; bad[seen[g]] = true; }
        else seen[g] = name;
      });
    });
    return bad;
  }

  function onSolve() {
    var wrong = names.filter(function (x) { return state.pos[x] !== answer[x]; }).length;
    if (wrong) {
      info.textContent = wrong === 1 ? w.wrongOne : w.wrong.replace('%d', wrong);
      return;
    }
    state.solved = true;
    selected = null; lit = null;
    save();
    render();
  }

  function render() {
    var bad = clashes();
    Object.keys(cells).forEach(function (k) {
      var b = cells[k];
      var who = occupant(k);
      var pawn = b.querySelector('.pawn');
      if (pawn) pawn.remove();
      var cross = b.querySelector('.cross');
      if (cross) cross.remove();
      if (who) {
        var p = el('span', 'pawn' + (bad[who] ? ' clash' : ''), who.charAt(0));
        p.style.background = PAWNS[names.indexOf(who) % PAWNS.length];
        p.title = who;
        b.appendChild(p);
      } else if (state.crosses[k]) {
        b.appendChild(el('span', 'cross', '✕'));
      }
      b.classList.remove('lit-in', 'lit-out', 'victim');
    });
    if (lit != null) {
      var clue = c.clues[lit];
      clue.cells.forEach(function (rc) {
        cells[key(rc[0], rc[1])].classList.add(clue.positive ? 'lit-in' : 'lit-out');
      });
    }
    names.forEach(function (name) {
      chipFor[name].classList.toggle('on', selected === name);
      chipFor[name].classList.toggle('placed', !!state.pos[name]);
    });
    clueItems.forEach(function (btn, i) {
      btn.classList.toggle('on', lit === i);
      btn.classList.toggle('done', !!state.clues[i]);
    });
    var full = names.every(function (x) { return state.pos[x]; });
    solve.disabled = !full || state.solved;
    if (state.solved) {
      var v = cells[key(c.victim.r, c.victim.c)];
      v.classList.add('victim');
      info.textContent = w.solved;
      verdict.querySelector('.who').textContent = c.killer;
      verdict.querySelector('.why').textContent = w.why
        .replace('%k', c.killer).replace('%v', c.victim.name)
        .replace('%r', c.rooms[c.victim.room].nameIn);
      verdict.hidden = false;
    }
  }

  var actions = el('div', 'actions');
  actions.appendChild(solve);
  actions.appendChild(reset);
  root.appendChild(board);
  root.appendChild(info);
  root.appendChild(chips);
  root.appendChild(actions);
  root.appendChild(verdict);
  root.appendChild(el('h2', null, w.clues));
  root.appendChild(el('p', 'hint', w.clueHint));
  root.appendChild(clueList);
  root.hidden = false;
  render();
})();
