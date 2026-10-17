(() => {
  let COLS = 4;
  let ROWS = 5;
  let TOTAL = COLS * ROWS;
  const POINTS_PER_VOTE = 10;
  const BONUS_COMPLETE = 50;
  const STORAGE_KEY = "mosaic-flip-v1";

  /** Reflective prompts — vote IS the answer that flips the tile */
  const QUESTIONS = [
    {
      q: "When something good happens to you, do you let it land — or rush past it?",
      opts: ["I savor it", "I notice, briefly", "I move on fast", "I barely feel it"]
    },
    {
      q: "Whose opinion of you still takes up too much space?",
      opts: ["A parent / family", "A peer / partner", "A past version of me", "Honestly — no one's"]
    },
    {
      q: "If your week had a color, what would it be right now?",
      opts: ["Warm gold", "Cool blue", "Soft green", "Storm gray"]
    },
    {
      q: "Do you share your real self more easily in person or in writing?",
      opts: ["In person", "In writing", "Depends on the person", "Neither feels easy"]
    },
    {
      q: "What are you protecting that no longer needs protecting?",
      opts: ["An old story", "A soft spot", "An identity", "I'm not sure yet"]
    },
    {
      q: "When you feel stuck, what actually helps first?",
      opts: ["Movement / walk", "Talking it out", "Quiet alone", "Making something"]
    },
    {
      q: "How honest is your \"I'm fine\" lately?",
      opts: ["Mostly true", "Half true", "A polite shield", "I'm done saying it"]
    },
    {
      q: "Which kind of courage do you need more of this month?",
      opts: ["Saying no", "Asking for help", "Starting small", "Being seen"]
    },
    {
      q: "Does privacy feel like safety, or like hiding?",
      opts: ["Safety", "Hiding", "Both, honestly", "Neither — it's just quiet"]
    },
    {
      q: "What would \"enough\" look like for you today?",
      opts: ["One clear win", "Rest without guilt", "Being present", "Connection"]
    },
    {
      q: "Are you more afraid of being misunderstood — or fully understood?",
      opts: ["Misunderstood", "Fully understood", "Both sting", "I've made peace"]
    },
    {
      q: "When did you last change your mind about something important?",
      opts: ["This week", "This year", "A long time ago", "I resist changing"]
    },
    {
      q: "What part of you do you show the world last?",
      opts: ["My tenderness", "My ambition", "My doubt", "My joy"]
    },
    {
      q: "Is your current pace sustainable — or are you borrowing from tomorrow?",
      opts: ["Sustainable", "Slightly stretched", "Borrowing heavily", "I need a reset"]
    },
    {
      q: "Who in your life feels like home right now?",
      opts: ["A person", "A place", "Myself", "Still searching"]
    },
    {
      q: "Do you trust your gut more than your to-do list?",
      opts: ["Gut wins", "List wins", "I negotiate", "I ignore both"]
    },
    {
      q: "What are you ready to outgrow?",
      opts: ["A habit", "A role", "A fear", "A relationship dynamic"]
    },
    {
      q: "If tonight could rewrite one moment from today, what would you choose?",
      opts: ["A conversation", "How I spent time", "How I treated myself", "I'd keep it as-is"]
    },
    {
      q: "Does accountability feel like freedom or pressure to you lately?",
      opts: ["Freedom", "Pressure", "Depends who asks", "I'm figuring that out"]
    },
    {
      q: "What do you want your next chapter to feel like?",
      opts: ["Lighter", "Bolder", "Clearer", "More connected"]
    }
  ];

  function seedTallies() {
    return QUESTIONS.map((item) => {
      const n = item.opts.length;
      return Array.from({ length: n }, () => 8 + Math.floor(Math.random() * 28));
    });
  }

  let libIdSeq = 1;

  const state = {
    answered: {},
    points: 0,
    tallies: seedTallies(),
    activeId: null,
    frontTiles: null,
    backTiles: null,
    frontFull: null,
    backFull: null,
    frontName: null,
    backName: null,
    frontLibId: null,
    backLibId: null,
    library: [], // { id, name, fullDataUrl, tiles }
    selectedLibId: null
  };

  const els = {};

  function load() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const data = JSON.parse(raw);
      if (data && typeof data === "object") {
        state.answered = data.answered || {};
        state.points = data.points || 0;
        if (Array.isArray(data.tallies) && data.tallies.length === TOTAL) {
          state.tallies = data.tallies;
        }
      }
    } catch (_) { /* ignore */ }
  }

  function save() {
    try {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({
          answered: state.answered,
          points: state.points,
          tallies: state.tallies
        })
      );
    } catch (_) { /* ignore */ }
  }

  function answeredCount() {
    return Object.keys(state.answered).length;
  }

  function dissolveOpacity() {
    const t = answeredCount() / TOTAL;
    return Math.max(0.12, 1 - t * 0.88);
  }

  function ghostOpacity() {
    const t = answeredCount() / TOTAL;
    return 0.12 + t * 0.55;
  }

  function pad(n) {
    return String(n).padStart(2, "0");
  }

  function defaultFrontUrl(i) {
    return `tiles/front/tile-${pad(i)}.png`;
  }

  function defaultBackUrl(i) {
    return `tiles/back/tile-${pad(i)}.png`;
  }

  function frontUrl(i) {
    return (state.frontTiles && state.frontTiles[i]) || defaultFrontUrl(i);
  }

  function backUrl(i) {
    return (state.backTiles && state.backTiles[i]) || defaultBackUrl(i);
  }

  function ghostBackUrl() {
    return state.backFull || "tiles/back-full.png";
  }

  function sliceImageFile(file) {
    return new Promise((resolve, reject) => {
      if (!file || !file.type.startsWith("image/")) {
        reject(new Error("Please choose an image file"));
        return;
      }
      const reader = new FileReader();
      reader.onerror = () => reject(new Error("Could not read that file"));
      reader.onload = () => {
        const img = new Image();
        img.onerror = () => reject(new Error("Could not load that image"));
        img.onload = () => {
          try {
            const tiles = sliceImageToTiles(img);
            resolve({ tiles, fullDataUrl: reader.result, name: file.name });
          } catch (err) {
            reject(err);
          }
        };
        img.src = reader.result;
      };
      reader.readAsDataURL(file);
    });
  }

  function sliceImageToTiles(img) {
    const targetRatio = COLS / ROWS;
    const imgRatio = img.naturalWidth / img.naturalHeight;
    let sx = 0;
    let sy = 0;
    let sw = img.naturalWidth;
    let sh = img.naturalHeight;
    if (imgRatio > targetRatio) {
      sw = Math.round(img.naturalHeight * targetRatio);
      sx = Math.round((img.naturalWidth - sw) / 2);
    } else if (imgRatio < targetRatio) {
      sh = Math.round(img.naturalWidth / targetRatio);
      sy = Math.round((img.naturalHeight - sh) / 2);
    }

    const tileW = Math.max(1, Math.floor(sw / COLS));
    const tileH = Math.max(1, Math.floor(sh / ROWS));
    const renderW = 256;
    const renderH = 256;

    const canvas = document.createElement("canvas");
    canvas.width = renderW;
    canvas.height = renderH;
    const ctx = canvas.getContext("2d");
    const tiles = [];

    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        const i = r * COLS + c;
        const srcX = sx + c * tileW;
        const srcY = sy + r * tileH;
        const srcW = c === COLS - 1 ? sw - c * tileW : tileW;
        const srcH = r === ROWS - 1 ? sh - r * tileH : tileH;
        ctx.clearRect(0, 0, renderW, renderH);
        ctx.drawImage(img, srcX, srcY, srcW, srcH, 0, 0, renderW, renderH);
        tiles[i] = canvas.toDataURL("image/jpeg", 0.88);
      }
    }
    return tiles;
  }

  function buildGrid() {
    const grid = els.grid;
    grid.innerHTML = "";
    document.documentElement.style.setProperty("--cols", String(COLS));
    document.documentElement.style.setProperty("--rows", String(ROWS));

    for (let i = 0; i < TOTAL; i++) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "tile";
      btn.dataset.id = String(i);
      btn.setAttribute("aria-label", `Tile ${i + 1}`);

      const inner = document.createElement("div");
      inner.className = "tile-inner";

      const front = document.createElement("div");
      front.className = "face face-front";
      front.style.backgroundImage = `url("${frontUrl(i)}")`;

      const back = document.createElement("div");
      back.className = "face face-back";
      back.style.backgroundImage = `url("${backUrl(i)}")`;

      inner.appendChild(front);
      inner.appendChild(back);
      btn.appendChild(inner);

      if (state.answered[i] !== undefined) {
        btn.classList.add("flipped", "answered");
      }

      btn.addEventListener("click", () => onTileClick(i));
      grid.appendChild(btn);
    }
    applyDissolve();
    updateGhost();
  }

  function updateGhost() {
    els.ghost.style.backgroundImage = `url("${ghostBackUrl()}")`;
  }

  function applyDissolve() {
    const frontOp = dissolveOpacity();
    els.ghost.style.opacity = String(ghostOpacity());
    els.grid.querySelectorAll(".tile").forEach((tile) => {
      const id = tile.dataset.id;
      const front = tile.querySelector(".face-front");
      if (!front) return;
      if (state.answered[id] !== undefined) {
        front.style.opacity = "1";
      } else {
        front.style.opacity = String(frontOp);
      }
    });
  }

  function updateChrome() {
    const n = answeredCount();
    const pct = Math.round((n / TOTAL) * 100);
    els.progressFill.style.width = `${pct}%`;
    els.progressLabel.textContent = `${n} / ${TOTAL}`;
    els.pointsBadge.textContent = String(state.points);
    els.hint.innerHTML =
      n === 0
        ? `Tap a tile to <strong>vote</strong> — each vote flips a piece (+${POINTS_PER_VOTE} pts)`
        : n < TOTAL
          ? `<strong>${TOTAL - n}</strong> tiles left · keep voting to reveal the painting`
          : `Mosaic complete — the new picture is fully here`;

    const done = n >= TOTAL;
    els.complete.classList.toggle("show", done);
    if (done) {
      els.complete.innerHTML =
        `<strong>Picture revealed.</strong> You earned ${state.points} points` +
        (state.points >= POINTS_PER_VOTE * TOTAL + BONUS_COMPLETE
          ? ` including a +${BONUS_COMPLETE} finish bonus.`
          : `.`) +
        ` Nice work thinking it through.`;
      els.stage.classList.add("revealed");
    } else {
      els.stage.classList.remove("revealed");
    }
  }

  function updateTrayUI() {
    if (state.frontFull) {
      els.frontPreview.style.backgroundImage = `url("${state.frontFull}")`;
      els.frontSlot.classList.add("has-custom");
      els.frontStatus.textContent = state.frontName || "Custom picture";
    } else {
      els.frontPreview.style.backgroundImage = 'url("tiles/front-full.png")';
      els.frontSlot.classList.remove("has-custom");
      els.frontStatus.textContent = "Using default picture";
    }
    if (state.backFull) {
      els.backPreview.style.backgroundImage = `url("${state.backFull}")`;
      els.backSlot.classList.add("has-custom");
      els.backStatus.textContent = state.backName || "Custom picture";
    } else {
      els.backPreview.style.backgroundImage = 'url("tiles/back-full.png")';
      els.backSlot.classList.remove("has-custom");
      els.backStatus.textContent = "Using default picture";
    }
  }

  function getSelectedLibItem() {
    if (state.selectedLibId == null) return null;
    return state.library.find((p) => p.id === state.selectedLibId) || null;
  }

  function updateAssignUI() {
    const item = getSelectedLibItem();
    const has = !!item;
    els.libraryAssign.hidden = state.library.length === 0;
    els.useAsFront.disabled = !has;
    els.useAsBack.disabled = !has;
    if (has) {
      const short = item.name.length > 28 ? item.name.slice(0, 26) + "…" : item.name;
      els.assignHint.textContent = `Selected: ${short}`;
    } else if (state.library.length > 0) {
      els.assignHint.textContent = "Select a picture, then assign to a tray";
    }
  }

  function renderLibrary() {
    const wrap = els.libraryThumbs;
    wrap.innerHTML = "";
    state.library.forEach((pic) => {
      const thumb = document.createElement("button");
      thumb.type = "button";
      thumb.className = "lib-thumb";
      thumb.setAttribute("role", "listitem");
      thumb.setAttribute("aria-label", pic.name);
      thumb.dataset.libId = String(pic.id);
      thumb.style.backgroundImage = `url("${pic.fullDataUrl}")`;
      thumb.draggable = true;

      if (state.selectedLibId === pic.id) thumb.classList.add("selected");
      if (state.frontLibId === pic.id) thumb.classList.add("in-front");
      if (state.backLibId === pic.id) thumb.classList.add("in-back");

      const name = document.createElement("span");
      name.className = "lib-thumb-name";
      name.textContent = pic.name;
      thumb.appendChild(name);

      thumb.addEventListener("click", () => {
        state.selectedLibId = pic.id;
        renderLibrary();
        updateAssignUI();
      });

      thumb.addEventListener("dragstart", (e) => {
        e.dataTransfer.setData("text/mosaic-lib-id", String(pic.id));
        e.dataTransfer.setData("text/plain", String(pic.id));
        e.dataTransfer.effectAllowed = "copy";
        state.selectedLibId = pic.id;
        renderLibrary();
        updateAssignUI();
      });

      wrap.appendChild(thumb);
    });
    updateAssignUI();
  }


  /* ---- IndexedDB persistence for uploaded pictures + Front/Back choices ---- */
  const IDB_NAME = "mosaic-images-v1";
  function idbOpen() {
    return new Promise((resolve, reject) => {
      if (!("indexedDB" in window)) { reject(new Error("no idb")); return; }
      const req = indexedDB.open(IDB_NAME, 1);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains("library")) db.createObjectStore("library", { keyPath: "id" });
        if (!db.objectStoreNames.contains("meta")) db.createObjectStore("meta");
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }
  let idbP = null;
  function idb() { if (!idbP) idbP = idbOpen(); return idbP; }
  function idbPersist() {
    return idb().then((db) => new Promise((resolve) => {
      const tx = db.transaction(["library", "meta"], "readwrite");
      const lib = tx.objectStore("library");
      lib.clear();
      state.library.forEach((it) => lib.put({ id: it.id, name: it.name, fullDataUrl: it.fullDataUrl, tiles: it.tiles }));
      tx.objectStore("meta").put({
        frontLibId: state.frontLibId, backLibId: state.backLibId,
        selectedLibId: state.selectedLibId, libIdSeq, savedAt: new Date().toISOString()
      }, "slots");
      tx.oncomplete = () => resolve(true);
      tx.onerror = () => resolve(false);
    })).catch(() => false);
  }
  function idbRestore() {
    return idb().then((db) => new Promise((resolve) => {
      const tx = db.transaction(["library", "meta"], "readonly");
      const out = {};
      const r1 = tx.objectStore("library").getAll();
      r1.onsuccess = () => { out.items = r1.result || []; };
      const r2 = tx.objectStore("meta").get("slots");
      r2.onsuccess = () => { out.meta = r2.result || null; };
      tx.oncomplete = () => resolve(out);
      tx.onerror = () => resolve(null);
    })).catch(() => null);
  }
  async function restoreImages() {
    const data = await idbRestore();
    if (!data || !data.items || !data.items.length) return;
    data.items.sort((a, b) => a.id - b.id);
    state.library = data.items;
    const m = data.meta || {};
    libIdSeq = Math.max(m.libIdSeq || 1, ...data.items.map((i) => i.id + 1));
    const find = (id) => state.library.find((p) => p.id === id);
    state.selectedLibId = find(m.selectedLibId) ? m.selectedLibId : state.library[state.library.length - 1].id;
    const f = find(m.frontLibId), b = find(m.backLibId);
    if (f) assignLibItemToSlot(f, "front", true);
    if (b) assignLibItemToSlot(b, "back", true);
    renderLibrary();
    if (typeof updateAssignUI === "function") updateAssignUI();
    updateTrayUI();
  }

  function assignLibItemToSlot(item, slot, restoring) {
    if (!item) return;
    if (slot === "front") {
      state.frontTiles = item.tiles;
      state.frontFull = item.fullDataUrl;
      state.frontName = item.name;
      state.frontLibId = item.id;
      els.frontStatus.textContent = "Assigned from library";
    } else {
      state.backTiles = item.tiles;
      state.backFull = item.fullDataUrl;
      state.backName = item.name;
      state.backLibId = item.id;
      els.backStatus.textContent = "Assigned from library";
    }
    buildGrid();
    updateTrayUI();
    renderLibrary();
    updateChrome();
    if (!restoring) idbPersist();
  }

  async function addFilesToLibrary(fileList) {
    const files = Array.from(fileList || []).filter((f) => f.type && f.type.startsWith("image/"));
    if (!files.length) return;
    els.assignHint && (els.assignHint.textContent = `Loading ${files.length} picture${files.length > 1 ? "s" : ""}…`);
    els.libraryAssign.hidden = false;

    let lastId = null;
    for (const file of files) {
      try {
        const { tiles, fullDataUrl, name } = await sliceImageFile(file);
        const id = libIdSeq++;
        state.library.push({ id, name, fullDataUrl, tiles });
        lastId = id;
      } catch (err) {
        console.warn("Skip file:", file.name, err.message);
      }
    }
    if (lastId != null) state.selectedLibId = lastId;
    renderLibrary();
    updateAssignUI();
    idbPersist();
  }

  async function handleDirectTrayPick(slot, file) {
    if (!file) return;
    const statusEl = slot === "front" ? els.frontStatus : els.backStatus;
    const prev = statusEl.textContent;
    statusEl.textContent = "Slicing into tiles…";
    try {
      const { tiles, fullDataUrl, name } = await sliceImageFile(file);
      const id = libIdSeq++;
      const item = { id, name, fullDataUrl, tiles };
      state.library.push(item);
      state.selectedLibId = id;
      assignLibItemToSlot(item, slot);
    } catch (err) {
      statusEl.textContent = err.message || "Could not use that file";
      setTimeout(() => {
        statusEl.textContent = prev;
      }, 2500);
    }
  }

  function wireLibrary() {
    els.libraryFile.addEventListener("change", () => {
      addFilesToLibrary(els.libraryFile.files);
      els.libraryFile.value = "";
    });

    // Click drop zone opens file picker
    els.libraryDrop.addEventListener("click", () => els.libraryFile.click());
    els.libraryDrop.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        els.libraryFile.click();
      }
    });

    ["dragenter", "dragover"].forEach((ev) => {
      els.libraryDrop.addEventListener(ev, (e) => {
        e.preventDefault();
        e.stopPropagation();
        els.libraryDrop.classList.add("drag-over");
      });
    });
    ["dragleave", "drop"].forEach((ev) => {
      els.libraryDrop.addEventListener(ev, (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (ev === "dragleave" && els.libraryDrop.contains(e.relatedTarget)) return;
        els.libraryDrop.classList.remove("drag-over");
      });
    });
    els.libraryDrop.addEventListener("drop", (e) => {
      const files = e.dataTransfer && e.dataTransfer.files;
      if (files && files.length) addFilesToLibrary(files);
    });

    els.useAsFront.addEventListener("click", () => {
      const item = getSelectedLibItem();
      if (item) assignLibItemToSlot(item, "front");
    });
    els.useAsBack.addEventListener("click", () => {
      const item = getSelectedLibItem();
      if (item) assignLibItemToSlot(item, "back");
    });
  }

  function wireTraySlot(slot) {
    const card = slot === "front" ? els.frontSlot : els.backSlot;
    const input = slot === "front" ? els.frontFile : els.backFile;

    input.addEventListener("change", () => {
      const file = input.files && input.files[0];
      handleDirectTrayPick(slot, file);
      input.value = "";
    });

    ["dragenter", "dragover"].forEach((ev) => {
      card.addEventListener(ev, (e) => {
        e.preventDefault();
        e.stopPropagation();
        card.classList.add("drag-over");
      });
    });
    ["dragleave", "drop"].forEach((ev) => {
      card.addEventListener(ev, (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (ev === "dragleave" && card.contains(e.relatedTarget)) return;
        card.classList.remove("drag-over");
      });
    });
    card.addEventListener("drop", (e) => {
      // Library thumb drag
      const libIdRaw =
        (e.dataTransfer && e.dataTransfer.getData("text/mosaic-lib-id")) ||
        (e.dataTransfer && e.dataTransfer.getData("text/plain"));
      if (libIdRaw) {
        const libId = Number(libIdRaw);
        const item = state.library.find((p) => p.id === libId);
        if (item) {
          assignLibItemToSlot(item, slot);
          return;
        }
      }
      // OS file drop
      const file = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
      if (file) handleDirectTrayPick(slot, file);
    });
  }

  function onTileClick(id) {
    if (state.answered[id] !== undefined) {
      openModal(id, true);
      return;
    }
    openModal(id, false);
  }

  function openModal(id, review) {
    state.activeId = id;
    const item = QUESTIONS[id];
    els.modalKicker.textContent = review ? `Tile ${id + 1} · your vote` : `Tile ${id + 1} · vote to flip`;
    els.modalTitle.textContent = item.q;
    els.options.innerHTML = "";

    item.opts.forEach((label, optIdx) => {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "option";
      b.textContent = label;
      if (review) {
        b.disabled = true;
        if (state.answered[id] === optIdx) b.classList.add("picked");
      } else {
        b.addEventListener("click", () => castVote(id, optIdx));
      }
      els.options.appendChild(b);
    });

    if (review) {
      renderTally(id);
      els.modalClose.textContent = "Close";
    } else {
      els.tally.hidden = true;
      els.tally.innerHTML = "";
      els.modalClose.textContent = "Not now";
    }

    els.backdrop.classList.add("open");
    els.backdrop.setAttribute("aria-hidden", "false");
  }

  function closeModal() {
    els.backdrop.classList.remove("open");
    els.backdrop.setAttribute("aria-hidden", "true");
    state.activeId = null;
  }

  function castVote(id, optIdx) {
    if (state.answered[id] !== undefined) return;

    state.answered[id] = optIdx;
    state.tallies[id][optIdx] += 1;
    state.points += POINTS_PER_VOTE;

    const wasLast = answeredCount() === TOTAL;
    if (wasLast) {
      state.points += BONUS_COMPLETE;
    }

    save();

    const tile = els.grid.querySelector(`.tile[data-id="${id}"]`);
    if (tile) {
      tile.classList.add("flipped", "answered", "just-flipped");
      setTimeout(() => tile.classList.remove("just-flipped"), 900);
    }

    applyDissolve();
    updateChrome();

    renderTally(id);
    els.modalKicker.textContent = `+${POINTS_PER_VOTE} pts · tile flipped`;
    els.options.querySelectorAll(".option").forEach((b, i) => {
      b.disabled = true;
      if (i === optIdx) b.classList.add("picked");
    });
    els.modalClose.textContent = "Keep going";

    popPoints(POINTS_PER_VOTE);

    if (wasLast) {
      setTimeout(() => {
        closeModal();
        celebrate();
      }, 900);
    }
  }

  function renderTally(id) {
    const tallies = state.tallies[id];
    const total = tallies.reduce((a, b) => a + b, 0) || 1;
    const item = QUESTIONS[id];
    const picked = state.answered[id];

    els.tally.hidden = false;
    els.tally.innerHTML =
      `<p class="tally-label">How others lean <span>(soft poll)</span></p>` +
      item.opts
        .map((label, i) => {
          const pct = Math.round((tallies[i] / total) * 100);
          const mine = i === picked ? " mine" : "";
          return `<div class="tally-row${mine}">
            <div class="tally-meta"><span>${label}</span><span>${pct}%</span></div>
            <div class="tally-track"><div class="tally-fill" style="width:${pct}%"></div></div>
          </div>`;
        })
        .join("");
  }

  function popPoints(amount) {
    const pop = document.createElement("div");
    pop.className = "points-pop";
    pop.textContent = `+${amount}`;
    els.pointsWrap.appendChild(pop);
    requestAnimationFrame(() => pop.classList.add("show"));
    setTimeout(() => pop.remove(), 900);
  }

  function celebrate() {
    els.confetti.hidden = false;
    els.confetti.classList.add("burst");
    els.stage.classList.add("celebrate");
    popPoints(BONUS_COMPLETE);
    setTimeout(() => {
      els.confetti.classList.remove("burst");
      els.confetti.hidden = true;
      els.stage.classList.remove("celebrate");
    }, 2800);
  }

  function resetAll() {
    if (!confirm("Reset all votes, points, and flips?")) return;
    state.answered = {};
    state.points = 0;
    state.tallies = seedTallies();
    save();
    buildGrid();
    updateChrome();
    closeModal();
  }

  function init() {
    els.grid = document.getElementById("grid");
    els.ghost = document.getElementById("ghostBack");
    els.stage = document.getElementById("stage");
    els.progressFill = document.getElementById("progressFill");
    els.progressLabel = document.getElementById("progressLabel");
    els.pointsBadge = document.getElementById("pointsBadge");
    els.pointsWrap = document.getElementById("pointsWrap");
    els.hint = document.getElementById("hint");
    els.complete = document.getElementById("completeBanner");
    els.backdrop = document.getElementById("modalBackdrop");
    els.modalKicker = document.getElementById("modalKicker");
    els.modalTitle = document.getElementById("modalTitle");
    els.options = document.getElementById("options");
    els.tally = document.getElementById("tally");
    els.modalClose = document.getElementById("modalClose");
    els.confetti = document.getElementById("confetti");
    els.resetBtn = document.getElementById("resetBtn");

    els.frontSlot = document.getElementById("frontSlot");
    els.backSlot = document.getElementById("backSlot");
    els.frontFile = document.getElementById("frontFile");
    els.backFile = document.getElementById("backFile");
    els.frontPreview = document.getElementById("frontPreview");
    els.backPreview = document.getElementById("backPreview");
    els.frontStatus = document.getElementById("frontStatus");
    els.backStatus = document.getElementById("backStatus");

    els.libraryFile = document.getElementById("libraryFile");
    els.libraryDrop = document.getElementById("libraryDrop");
    els.libraryThumbs = document.getElementById("libraryThumbs");
    els.libraryAssign = document.getElementById("libraryAssign");
    els.assignHint = document.getElementById("assignHint");
    els.useAsFront = document.getElementById("useAsFront");
    els.useAsBack = document.getElementById("useAsBack");

    load();
    const n = answeredCount();
    const expected = n * POINTS_PER_VOTE + (n >= TOTAL ? BONUS_COMPLETE : 0);
    if (state.points < expected) state.points = expected;

    buildGrid();
    updateTrayUI();
    renderLibrary();
    updateChrome();

    wireLibrary();
    wireTraySlot("front");
    wireTraySlot("back");

    els.modalClose.addEventListener("click", closeModal);
    els.backdrop.addEventListener("click", (e) => {
      if (e.target === els.backdrop) closeModal();
    });
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") closeModal();
    });
    els.resetBtn.addEventListener("click", resetAll);
    restoreImages();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
