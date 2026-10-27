(function () {
  var KEY = "blokno.v1";
  var st;
  try { st = JSON.parse(localStorage.getItem(KEY)) || {}; } catch (e) { st = {}; }
  st = Object.assign({ notes: [], tasks: [], tx: [], goals: [], recurring: [], skipped: [] }, st);
  var txType = "expense";

  // Sync with the laptop server (optional). Config lives only on this phone.
  var SYNC_KEY = "blokno.sync";
  function getSync() { try { return JSON.parse(localStorage.getItem(SYNC_KEY)) || null; } catch (e) { return null; } }
  function setStatus(t) { var el = document.getElementById("syncStatus"); if (el) el.textContent = t; }
  var pushTimer = null;
  function schedulePush() {
    if (!getSync()) return;
    clearTimeout(pushTimer);
    pushTimer = setTimeout(push, 800);
  }
  function push() {
    var cfg = getSync(); if (!cfg) return;
    setStatus("сохраняю…");
    fetch(cfg.url + "/data", {
      method: "PUT",
      headers: { "Authorization": "Bearer " + cfg.token, "Content-Type": "application/json" },
      body: JSON.stringify(st)
    }).then(function (r) {
      setStatus(r.ok ? "синхронизировано" : "ошибка сохранения, код " + r.status);
    }).catch(function () { setStatus("нет связи с ноутбуком"); });
  }
  function pull() {
    var cfg = getSync(); if (!cfg) return;
    fetch(cfg.url + "/data", { headers: { "Authorization": "Bearer " + cfg.token } })
      .then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); })
      .then(function (remote) {
        var ru = remote.updated || 0;
        if (ru > (st.updated || 0)) {
          st = Object.assign({ notes: [], tasks: [], tx: [], goals: [], recurring: [], skipped: [] }, remote);
          try { localStorage.setItem(KEY, JSON.stringify(st)); } catch (e) {}
          renderAll();
        } else if ((st.updated || 0) > ru) {
          push();
          return;
        }
        setStatus("синхронизировано");
      })
      .catch(function () { setStatus("нет связи с ноутбуком"); });
  }
  function save() {
    st.updated = Date.now();
    try { localStorage.setItem(KEY, JSON.stringify(st)); } catch (e) {}
    schedulePush();
  }
  function $(s) { return document.querySelector(s); }
  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }
  function money(n) { return Math.round(n).toLocaleString("ru-RU") + " ₽"; }
  function pad(n) { return (n < 10 ? "0" : "") + n; }
  function fmt(d) { return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate()); }
  function today() { return fmt(new Date()); }
  function addDays(s, n) { var d = new Date(s + "T00:00"); d.setDate(d.getDate() + n); return fmt(d); }
  function monthKey(s) { return s.slice(0, 7); }
  function nextMonth(m) {
    var y = +m.slice(0, 4), mo = +m.slice(5, 7) + 1;
    if (mo > 12) { y++; mo = 1; }
    return y + "-" + pad(mo);
  }
  // Day `day` of month `m` (YYYY-MM), clamped to the month's length
  function dateInMonth(m, day) {
    var y = +m.slice(0, 4), mo = +m.slice(5, 7);
    var last = new Date(y, mo, 0).getDate();
    return m + "-" + pad(Math.min(day, last));
  }
  function dayLabel(s) {
    if (s === today()) return "Сегодня";
    if (s === addDays(today(), 1)) return "Завтра";
    return new Date(s + "T00:00").toLocaleDateString("ru-RU", { weekday: "long", day: "numeric", month: "long" });
  }

  // Migrate: tasks saved before dates existed get today's date
  st.tasks.forEach(function (t) { if (!t.date) t.date = today(); });

  // Create the due repeating operations that are not yet recorded
  function materialize() {
    var now = today(), cur = monthKey(now), changed = false;
    st.recurring.forEach(function (r) {
      var m = monthKey(r.start);
      while (m <= cur) {
        var d = dateInMonth(m, r.day);
        var exists = st.tx.some(function (x) { return x.rid === r.id && x.date === d; });
        var skipped = st.skipped.indexOf(r.id + "|" + d) !== -1;
        if (d <= now && d >= r.start && !exists && !skipped) {
          st.tx.push({ id: uid(), type: r.type, amount: r.amount, cat: r.cat, note: r.note, date: d, at: Date.now(), rid: r.id });
          changed = true;
        }
        m = nextMonth(m);
      }
    });
    // Store locally without bumping the sync timestamp: generated operations are not user edits
    if (changed) { try { localStorage.setItem(KEY, JSON.stringify(st)); } catch (e) {} }
  }

  // Tabs
  function show(name) {
    document.querySelectorAll("[data-view]").forEach(function (v) { v.hidden = v.dataset.view !== name; });
    document.querySelectorAll("[data-tab]").forEach(function (b) { b.classList.toggle("on", b.dataset.tab === name); });
  }
  document.querySelectorAll("[data-tab]").forEach(function (b) {
    b.addEventListener("click", function () { show(b.dataset.tab); });
  });

  // Auto-grow and heading styling for note fields
  function marks(el) {
    var v = el.value;
    el.classList.toggle("h", v.indexOf("# ") === 0 && v.indexOf("\n") === -1);
    el.style.height = "auto";
    el.style.height = el.scrollHeight + "px";
  }

  // Notes
  function renderNotes() {
    $("#noteList").innerHTML = st.notes.length ? st.notes.map(function (n) {
      return '<div class="note-row"><textarea class="note" data-note="' + n.id + '">' + esc(n.text) +
        '</textarea><button class="x" data-del="notes" data-id="' + n.id + '">×</button></div>';
    }).join("") : '<div class="empty">Заметок пока нет</div>';
    document.querySelectorAll("textarea.note").forEach(marks);
  }
  var noteNew = $("#noteNew");
  noteNew.addEventListener("input", function () { marks(noteNew); });
  noteNew.addEventListener("blur", function () {
    var v = noteNew.value.replace(/\s+$/, "");
    if (v.trim()) {
      st.notes.unshift({ id: uid(), text: v, at: Date.now() });
      save();
      noteNew.value = "";
      renderNotes();
    }
    marks(noteNew);
  });
  document.addEventListener("input", function (e) {
    var t = e.target;
    if (t.matches && t.matches("textarea.note")) {
      var n = st.notes.find(function (x) { return x.id === t.dataset.note; });
      if (n) { n.text = t.value; save(); }
      marks(t);
    }
  });

  // Tasks grouped by day
  function taskHTML(t) {
    return '<div class="item' + (t.done ? ' done' : '') + '">' +
      '<button class="check' + (t.done ? ' on' : '') + '" data-toggle="' + t.id + '">' + (t.done ? '✓' : '') + '</button>' +
      '<div class="body">' + esc(t.text) + '</div>' +
      '<button class="x" data-del="tasks" data-id="' + t.id + '">×</button></div>';
  }
  function renderTasks() {
    var el = $("#taskGroups");
    if (!st.tasks.length) { el.innerHTML = '<div class="empty">Задач пока нет</div>'; return; }
    var groups = {};
    st.tasks.forEach(function (t) { (groups[t.date] = groups[t.date] || []).push(t); });
    el.innerHTML = Object.keys(groups).sort().map(function (d) {
      var items = groups[d].slice().sort(function (a, b) { return a.done - b.done; });
      return '<h2>' + esc(dayLabel(d)) + '</h2><div class="list">' + items.map(taskHTML).join("") + '</div>';
    }).join("");
  }
  $("#taskDate").value = today();
  $("#taskAdd").addEventListener("click", function () {
    var t = $("#taskText").value.trim();
    var d = $("#taskDate").value || today();
    if (!t) return;
    st.tasks.push({ id: uid(), text: t, done: false, date: d });
    $("#taskText").value = "";
    save(); renderTasks();
  });

  // Budget
  function renderBudget() {
    var all = st.tx, inc = 0, out = 0, mOut = 0, cur = monthKey(today()), cats = {};
    all.forEach(function (t) {
      if (t.type === "income") inc += t.amount; else out += t.amount;
      if (t.type === "expense" && monthKey(t.date) === cur) {
        mOut += t.amount;
        var c = t.cat || "Без категории";
        cats[c] = (cats[c] || 0) + t.amount;
      }
    });
    $("#balance").textContent = money(inc - out);
    $("#monthOut").textContent = money(mOut);

    var keys = Object.keys(cats).sort(function (a, b) { return cats[b] - cats[a]; });
    $("#catList").innerHTML = keys.length ? keys.map(function (k) {
      var p = mOut ? Math.round(cats[k] / mOut * 100) : 0;
      return '<div class="item"><div class="body">' + esc(k) + '</div>' +
        '<span class="pct">' + p + '%</span><span class="amt">' + money(cats[k]) + '</span></div>';
    }).join("") : '<div class="empty">Расходов за месяц нет</div>';

    // Repeating rules
    $("#recurWrap").hidden = !st.recurring.length;
    $("#recurList").innerHTML = st.recurring.map(function (r) {
      var sign = r.type === "income" ? "+" : "−";
      var meta = ["каждое " + r.day + "-е число", r.cat, r.note].filter(Boolean).join(" · ");
      return '<div class="item"><div class="body"><span class="amt ' + (r.type === "income" ? "in" : "") + '">' +
        sign + money(r.amount) + '</span><div class="meta">' + esc(meta) + '</div></div>' +
        '<button class="x" data-del="recurring" data-id="' + r.id + '">×</button></div>';
    }).join("");

    // Operations grouped by day
    var el = $("#txGroups");
    if (!all.length) {
      el.innerHTML = '<div class="empty">Операций пока нет</div>';
    } else {
      var days = {};
      all.forEach(function (t) { (days[t.date] = days[t.date] || []).push(t); });
      el.innerHTML = Object.keys(days).sort().map(function (d) {
        var items = days[d].slice().sort(function (a, b) { return b.at - a.at; });
        var net = 0;
        items.forEach(function (t) { net += t.type === "income" ? t.amount : -t.amount; });
        var netText = net === 0 ? "0 ₽" : (net > 0 ? "+" : "−") + money(Math.abs(net));
        return '<h2>' + esc(dayLabel(d)) + ' · ' + netText + '</h2><div class="list">' + items.map(function (t) {
          var sign = t.type === "income" ? "+" : "−";
          var meta = [t.cat, t.note, t.rid ? "повтор" : ""].filter(Boolean).join(" · ");
          return '<div class="item"><div class="body"><span class="amt ' + (t.type === "income" ? "in" : "") + '">' +
            sign + money(t.amount) + '</span><div class="meta">' + esc(meta) + '</div></div>' +
            '<button class="x" data-del="tx" data-id="' + t.id + '">×</button></div>';
        }).join("") + '</div>';
      }).join("");
    }
  }
  document.querySelectorAll("#txType button").forEach(function (b) {
    b.addEventListener("click", function () {
      txType = b.dataset.type;
      document.querySelectorAll("#txType button").forEach(function (x) { x.classList.toggle("on", x === b); });
    });
  });
  $("#txDate").value = today();
  $("#txAdd").addEventListener("click", function () {
    var amount = parseFloat($("#txAmount").value);
    if (!(amount > 0)) return;
    var date = $("#txDate").value || today();
    var base = { type: txType, amount: amount, cat: $("#txCat").value.trim(), note: $("#txNote").value.trim() };
    var item = Object.assign({ id: uid(), date: date, at: Date.now() }, base);
    if ($("#txRepeat").checked) {
      var rule = Object.assign({ id: uid(), day: +date.slice(8), start: date }, base);
      st.recurring.push(rule);
      item.rid = rule.id;
    }
    st.tx.push(item);
    $("#txAmount").value = ""; $("#txNote").value = "";
    $("#txRepeat").checked = false;
    materialize();
    save(); renderBudget();
  });

  // Copy of data: show as text, copy to clipboard, or load from file
  $("#exportBtn").addEventListener("click", function () {
    var box = $("#dataBox");
    box.value = JSON.stringify(st);
    box.hidden = false;
    $("#copyRow").hidden = false;
  });
  $("#copyBtn").addEventListener("click", function () {
    var box = $("#dataBox");
    var fallback = function () { box.focus(); box.select(); };
    try {
      navigator.clipboard.writeText(box.value).then(function () {
        $("#copyBtn").textContent = "Скопировано";
      }, fallback);
    } catch (e) { fallback(); }
  });

  function applyImport(text) {
    var data;
    try { data = JSON.parse(text); } catch (e) { return false; }
    if (!data || !Array.isArray(data.notes) || !Array.isArray(data.tasks) || !Array.isArray(data.tx)) return false;
    st = Object.assign({ notes: [], tasks: [], tx: [], goals: [], recurring: [], skipped: [] }, data);
    save(); renderAll();
    return true;
  }
  var importBtn = $("#importBtn");
  importBtn.addEventListener("click", function () {
    var file = $("#importFile").files[0];
    var pasted = $("#dataBox").value.trim();
    if (!importBtn.classList.contains("armed")) {
      if (!file && !pasted) { importBtn.textContent = "Выберите файл или вставьте копию"; return; }
      importBtn.classList.add("armed");
      importBtn.textContent = "Заменить все данные?";
      setTimeout(function () {
        if (importBtn.isConnected) { importBtn.classList.remove("armed"); importBtn.textContent = "Загрузить копию"; }
      }, 3000);
      return;
    }
    importBtn.classList.remove("armed");
    importBtn.textContent = "Загрузить копию";
    if (file) {
      var reader = new FileReader();
      reader.onload = function () { importBtn.textContent = applyImport(reader.result) ? "Готово" : "Не похоже на копию"; };
      reader.readAsText(file);
    } else {
      importBtn.textContent = applyImport(pasted) ? "Готово" : "Не похоже на копию";
    }
  });

  // Plans
  function renderGoals() {
    var el = $("#goalList");
    if (!st.goals.length) { el.innerHTML = '<div class="empty">Целей пока нет</div>'; return; }
    el.innerHTML = st.goals.map(function (g) {
      var pct = g.target ? Math.min(100, Math.round(g.saved / g.target * 100)) : 0;
      var left = Math.max(0, g.target - g.saved);
      return '<div class="item goal">' +
        '<div class="row" style="width:100%"><div class="body" style="flex:1">' + esc(g.name) + '</div>' +
        '<button class="x" data-del="goals" data-id="' + g.id + '">×</button></div>' +
        '<div class="meta" style="margin:0;font-variant-numeric:tabular-nums">' + money(g.saved) + ' из ' + money(g.target) +
        ' · осталось ' + money(left) + ' · ' + pct + '%</div>' +
        '<div class="bar"><i style="width:' + pct + '%"></i></div>' +
        '<div class="row" style="width:100%"><input type="number" inputmode="decimal" placeholder="Добавить сумму" data-add-input="' + g.id + '">' +
        '<button class="btn ghost" data-add="' + g.id + '">+</button></div></div>';
    }).join("");
  }
  $("#goalAdd").addEventListener("click", function () {
    var name = $("#goalName").value.trim();
    var target = parseFloat($("#goalTarget").value);
    if (!name || !(target > 0)) return;
    st.goals.unshift({ id: uid(), name: name, target: target, saved: 0 });
    $("#goalName").value = ""; $("#goalTarget").value = "";
    save(); renderGoals();
  });

  // Delegated actions: toggle tasks, add to goals, two-tap delete
  document.addEventListener("click", function (e) {
    var t = e.target;
    if (t.dataset.toggle) {
      var task = st.tasks.find(function (x) { return x.id === t.dataset.toggle; });
      if (task) { task.done = !task.done; save(); renderTasks(); }
      return;
    }
    if (t.dataset.add) {
      var g = st.goals.find(function (x) { return x.id === t.dataset.add; });
      var input = document.querySelector('[data-add-input="' + t.dataset.add + '"]');
      var v = parseFloat(input.value);
      if (g && v > 0) { g.saved += v; input.value = ""; save(); renderGoals(); }
      return;
    }
    if (t.dataset.del) {
      if (!t.classList.contains("armed")) {
        t.classList.add("armed"); t.textContent = "Удалить?";
        setTimeout(function () {
          if (t.isConnected) { t.classList.remove("armed"); t.textContent = "×"; }
        }, 2500);
        return;
      }
      var kind = t.dataset.del, id = t.dataset.id;
      if (kind === "tx") {
        var op = st.tx.find(function (x) { return x.id === id; });
        // Remember deleted repeating occurrences so they are not recreated
        if (op && op.rid) st.skipped.push(op.rid + "|" + op.date);
      }
      // Deleting a repeating rule keeps its recorded operations as history
      st[kind] = st[kind].filter(function (x) { return x.id !== id; });
      save(); renderAll();
    }
  });

  // Sync settings
  var cfg0 = getSync();
  if (cfg0) { $("#syncUrl").value = cfg0.url; $("#syncToken").value = cfg0.token; }
  $("#syncBtn").addEventListener("click", function () {
    var url = $("#syncUrl").value.trim().replace(/\/+$/, "");
    var token = $("#syncToken").value.trim();
    if (!url || !token) { setStatus("Заполните адрес и токен"); return; }
    try { localStorage.setItem(SYNC_KEY, JSON.stringify({ url: url, token: token })); } catch (e) {}
    setStatus("подключаюсь…");
    pull();
  });
  document.addEventListener("visibilitychange", function () {
    if (!document.hidden) pull();
  });

  function renderAll() { materialize(); renderNotes(); renderTasks(); renderBudget(); renderGoals(); }
  renderAll();
  pull();
})();
