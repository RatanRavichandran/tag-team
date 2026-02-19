// ═══════════════════════════════════════════
// TAG CHAIN — Game Logic (Live AO3 Edition)
// Depends on tagData.js (STARTER_TAGS only)
// ═══════════════════════════════════════════

(() => {
  "use strict";

  // ═══════════════════════════════════════════
  // AO3 API Module (via Vercel serverless backend)
  // ═══════════════════════════════════════════
  const AO3 = (() => {
    const cache = new Map();

    /**
     * Search AO3 freeform tag autocomplete.
     * Returns: [{ name: "Slow Burn" }, ...]
     */
    async function autocomplete(query) {
      if (!query || query.length < 2) return [];

      const key = `ac:${query.toLowerCase()}`;
      if (cache.has(key)) return cache.get(key);

      const res = await fetch(`/api/autocomplete?term=${encodeURIComponent(query)}`);

      if (res.status === 429) throw new Error("RATE_LIMITED");
      if (!res.ok) throw new Error("API_ERROR");

      const data = await res.json();
      if (data.error) throw new Error(data.error === "rate_limited" ? "RATE_LIMITED" : "API_ERROR");

      const results = data.map((item) => ({ name: item.name }));
      cache.set(key, results);
      return results;
    }

    /**
     * Check co-occurrence: how many AO3 works are tagged with ALL given tags.
     * @param {string[]} tags - array of tag names
     * Returns: number (work count)
     */
    async function getCoOccurrence(tags) {
      const sorted = [...tags].sort();
      const key = `co:${sorted.join("|||")}`;
      if (cache.has(key)) return cache.get(key);

      const res = await fetch(
        `/api/cooccurrence?tags=${encodeURIComponent(tags.join(","))}`
      );

      if (res.status === 429) throw new Error("RATE_LIMITED");
      if (!res.ok) throw new Error("API_ERROR");

      const data = await res.json();
      if (data.error) throw new Error(data.error === "rate_limited" ? "RATE_LIMITED" : "API_ERROR");

      const count = data.count || 0;
      cache.set(key, count);
      return count;
    }

    return { autocomplete, getCoOccurrence };
  })();

  // ═══════════════════════════════════════════
  // Game State
  // ═══════════════════════════════════════════
  let chain = [];
  let chainCounts = [];
  let usedTags = new Set(); // lowercase keys for comparison
  let threshold = 500;
  let gameActive = false;
  let isValidating = false;

  // ═══════════════════════════════════════════
  // DOM References
  // ═══════════════════════════════════════════
  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => document.querySelectorAll(sel);

  const screens = {
    start: $("#start-screen"),
    game: $("#game-screen"),
    end: $("#end-screen"),
  };

  const dom = {
    starterInput: $("#starter-input"),
    starterAutocomplete: $("#starter-autocomplete"),
    suggestedStarters: $("#suggested-starters"),
    randomBtn: $("#random-starter-btn"),
    startBtn: $("#start-btn"),
    personalBest: $("#personal-best-display"),

    chainDisplay: $("#chain-display"),
    chainLength: $("#chain-length"),
    lastLink: $("#last-link"),
    currentBest: $("#current-best"),
    tagInput: $("#tag-input"),
    autocompleteList: $("#autocomplete-list"),
    addBtn: $("#add-btn"),
    errorMsg: $("#error-msg"),
    milestoneMsg: $("#milestone-msg"),
    giveUpBtn: $("#give-up-btn"),

    endTitle: $("#end-title"),
    endSubtitle: $("#end-subtitle"),
    finalLength: $("#final-length"),
    finalWeakest: $("#final-weakest"),
    finalStrongest: $("#final-strongest"),
    finalChain: $("#final-chain"),
    shareBtn: $("#share-btn"),
    restartBtn: $("#restart-btn"),
    copyToast: $("#copy-toast"),
  };

  // ═══════════════════════════════════════════
  // Helpers
  // ═══════════════════════════════════════════
  function formatCount(n) {
    if (n >= 10000) return (n / 1000).toFixed(1).replace(/\.0$/, "") + "k";
    if (n >= 1000) return (n / 1000).toFixed(1) + "k";
    return n.toLocaleString();
  }

  function showScreen(name) {
    Object.values(screens).forEach((s) => s.classList.remove("active"));
    screens[name].classList.add("active");
    window.scrollTo(0, 0);
  }

  function escapeHtml(str) {
    const div = document.createElement("div");
    div.textContent = str;
    return div.innerHTML;
  }

  function highlightMatch(text, query) {
    if (!query) return escapeHtml(text);
    const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const regex = new RegExp(`(${escaped})`, "ig");
    return escapeHtml(text).replace(regex, "<strong>$1</strong>");
  }

  function debounce(fn, ms) {
    let timer;
    return (...args) => {
      clearTimeout(timer);
      timer = setTimeout(() => fn(...args), ms);
    };
  }

  // ═══════════════════════════════════════════
  // Async Autocomplete Engine
  // ═══════════════════════════════════════════
  function setupAsyncAutocomplete(input, dropdown, fetchItems, onSelect) {
    let selectedIdx = -1;
    let currentItems = [];
    let requestId = 0;

    const doSearch = debounce(async (text) => {
      if (!text || text.length < 2) {
        dropdown.classList.remove("open");
        dropdown.innerHTML = "";
        return;
      }

      const myId = ++requestId;

      // Show loading state
      dropdown.innerHTML = `<div class="autocomplete-loading">
        <span class="loading-spinner"></span> Searching AO3...
      </div>`;
      dropdown.classList.add("open");

      try {
        const items = await fetchItems(text);
        if (myId !== requestId) return; // stale request

        currentItems = items;
        selectedIdx = -1;

        if (items.length === 0) {
          dropdown.innerHTML = `<div class="autocomplete-loading">No tags found</div>`;
          return;
        }

        dropdown.innerHTML = items
          .slice(0, 30)
          .map((item, i) => {
            const nameHtml = highlightMatch(item.name, text);
            const classes = ["autocomplete-item"];
            if (item.used) classes.push("used");
            const usedBadge = item.used
              ? `<span class="used-badge">already used</span>`
              : "";
            return `<div class="${classes.join(" ")}" data-index="${i}">
              <span class="tag-name">${nameHtml}</span>${usedBadge}
            </div>`;
          })
          .join("");

        dropdown.querySelectorAll(".autocomplete-item:not(.used)").forEach((el) => {
          el.addEventListener("mousedown", (e) => {
            e.preventDefault();
            const idx = parseInt(el.dataset.index);
            onSelect(currentItems[idx].name);
            input.value = currentItems[idx].name;
            dropdown.classList.remove("open");
          });
        });
      } catch (err) {
        if (myId !== requestId) return;
        if (err.message === "RATE_LIMITED") {
          dropdown.innerHTML = `<div class="autocomplete-loading autocomplete-error">
            ⏳ AO3 rate limit hit — wait a moment
          </div>`;
        } else {
          dropdown.innerHTML = `<div class="autocomplete-loading autocomplete-error">
            Could not reach AO3
          </div>`;
        }
      }
    }, 400);

    input.addEventListener("input", () => doSearch(input.value.trim()));
    input.addEventListener("focus", () => {
      if (input.value.trim().length >= 2) doSearch(input.value.trim());
    });

    input.addEventListener("keydown", (e) => {
      const visible = dropdown.classList.contains("open");
      const maxIdx = Math.min(currentItems.length, 30) - 1;

      if (e.key === "ArrowDown" && visible) {
        e.preventDefault();
        selectedIdx = Math.min(selectedIdx + 1, maxIdx);
        updateSelection(dropdown, selectedIdx);
      } else if (e.key === "ArrowUp" && visible) {
        e.preventDefault();
        selectedIdx = Math.max(selectedIdx - 1, 0);
        updateSelection(dropdown, selectedIdx);
      } else if (e.key === "Enter") {
        e.preventDefault();
        if (visible && selectedIdx >= 0 && currentItems[selectedIdx]) {
          const item = currentItems[selectedIdx];
          if (!item.used) {
            input.value = item.name;
            onSelect(item.name);
            dropdown.classList.remove("open");
          }
        } else {
          onSelect(input.value.trim());
        }
      } else if (e.key === "Escape") {
        dropdown.classList.remove("open");
      }
    });

    document.addEventListener("click", (e) => {
      if (!input.contains(e.target) && !dropdown.contains(e.target)) {
        dropdown.classList.remove("open");
      }
    });
  }

  function updateSelection(dropdown, idx) {
    dropdown.querySelectorAll(".autocomplete-item").forEach((el, i) => {
      el.classList.toggle("selected", i === idx);
      if (i === idx) el.scrollIntoView({ block: "nearest" });
    });
  }

  // ═══════════════════════════════════════════
  // Local Storage
  // ═══════════════════════════════════════════
  function getBest() {
    try {
      return JSON.parse(localStorage.getItem("tagchain_best")) || {};
    } catch {
      return {};
    }
  }

  function saveBest(length, difficulty) {
    const best = getBest();
    const key = `d${difficulty}`;
    if (!best[key] || length > best[key]) {
      best[key] = length;
      localStorage.setItem("tagchain_best", JSON.stringify(best));
    }
  }

  function displayPersonalBest() {
    const best = getBest();
    const key = `d${threshold}`;
    if (best[key]) {
      dom.personalBest.innerHTML = `Your best at this difficulty: <strong>${best[key]}</strong> tags`;
    } else {
      dom.personalBest.innerHTML = "";
    }
  }

  // ═══════════════════════════════════════════
  // Start Screen
  // ═══════════════════════════════════════════
  function initStartScreen() {
    // Difficulty buttons
    $$(".diff-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        $$(".diff-btn").forEach((b) => b.classList.remove("active"));
        btn.classList.add("active");
        threshold = parseInt(btn.dataset.threshold);
        displayPersonalBest();
      });
    });

    // Suggested starters
    renderStarterChips();

    // Starter autocomplete — searches AO3 live
    setupAsyncAutocomplete(
      dom.starterInput,
      dom.starterAutocomplete,
      async (text) => {
        const results = await AO3.autocomplete(text);
        return results.map((r) => ({ name: r.name, used: false }));
      },
      (tag) => {
        dom.starterInput.value = tag;
      }
    );

    // Random button
    dom.randomBtn.addEventListener("click", () => {
      const tag = STARTER_TAGS[Math.floor(Math.random() * STARTER_TAGS.length)];
      dom.starterInput.value = tag;
    });

    // Start button
    dom.startBtn.addEventListener("click", startGame);
    displayPersonalBest();
  }

  function renderStarterChips() {
    const shuffled = [...STARTER_TAGS].sort(() => Math.random() - 0.5).slice(0, 8);
    dom.suggestedStarters.innerHTML = shuffled
      .map((t) => `<button class="starter-chip" data-tag="${escapeHtml(t)}">${escapeHtml(t)}</button>`)
      .join("");
    dom.suggestedStarters.querySelectorAll(".starter-chip").forEach((chip) => {
      chip.addEventListener("click", () => {
        dom.starterInput.value = chip.dataset.tag;
      });
    });
  }

  // ═══════════════════════════════════════════
  // Game Logic
  // ═══════════════════════════════════════════
  function startGame() {
    let starterTag = dom.starterInput.value.trim();
    if (!starterTag) {
      starterTag = STARTER_TAGS[Math.floor(Math.random() * STARTER_TAGS.length)];
    }

    // Init state
    chain = [starterTag];
    chainCounts = [];
    usedTags = new Set([starterTag.toLowerCase()]);
    gameActive = true;
    isValidating = false;

    // Show game screen
    showScreen("game");
    renderChain();
    updateStats();
    dom.tagInput.value = "";
    dom.errorMsg.textContent = "";
    dom.milestoneMsg.textContent = "";
    dom.tagInput.focus();

    // Personal best display in-game
    const best = getBest();
    const key = `d${threshold}`;
    dom.currentBest.textContent = best[key] || "—";
  }

  async function addTag(tagName) {
    if (!gameActive || !tagName || isValidating) return;

    dom.errorMsg.textContent = "";

    // Check if already used (instant, no API call)
    if (usedTags.has(tagName.toLowerCase())) {
      dom.errorMsg.textContent = `"${tagName}" is already in your chain!`;
      shakeInput();
      return;
    }

    // ── Enter loading state ──
    isValidating = true;
    setInputLoading(true);
    dom.addBtn.textContent = "Checking...";

    // Must co-occur with ALL previous tags in the chain
    const allTags = [...chain, tagName];

    try {
      const coCount = await AO3.getCoOccurrence(allTags);

      if (coCount === 0) {
        dom.errorMsg.textContent = `"${tagName}" doesn't co-occur with all ${chain.length} tags in your chain.`;
        shakeInput();
      } else if (coCount < threshold) {
        dom.errorMsg.textContent = `"${tagName}" + your chain only has ${formatCount(coCount)} works together (need ${formatCount(threshold)}+).`;
        shakeInput();
      } else {
        // ✅ Valid! Add to chain
        chain.push(tagName);
        chainCounts.push(coCount);
        usedTags.add(tagName.toLowerCase());

        dom.tagInput.value = "";
        dom.autocompleteList.classList.remove("open");

        renderChain();
        updateStats();
        checkMilestone();
      }
    } catch (err) {
      if (err.message === "RATE_LIMITED") {
        dom.errorMsg.textContent = "⏳ AO3 rate limit — wait a few seconds and try again.";
      } else {
        dom.errorMsg.textContent = "Could not reach AO3. Check your connection.";
      }
    } finally {
      isValidating = false;
      setInputLoading(false);
      dom.addBtn.textContent = "Add →";
      dom.tagInput.focus();
    }
  }

  function setInputLoading(loading) {
    const wrap = dom.tagInput.closest(".tag-input-wrap");
    wrap.classList.toggle("loading", loading);
    dom.tagInput.disabled = loading;
    dom.addBtn.disabled = loading;
  }

  function shakeInput() {
    dom.tagInput.style.animation = "none";
    dom.tagInput.offsetHeight; // reflow
    dom.tagInput.style.animation = "shake 0.4s ease";
    setTimeout(() => (dom.tagInput.style.animation = ""), 400);
  }

  // Inject shake keyframes
  if (!document.querySelector("#shake-style")) {
    const style = document.createElement("style");
    style.id = "shake-style";
    style.textContent = `
      @keyframes shake {
        0%, 100% { transform: translateX(0); }
        20% { transform: translateX(-6px); }
        40% { transform: translateX(6px); }
        60% { transform: translateX(-4px); }
        80% { transform: translateX(4px); }
      }
    `;
    document.head.appendChild(style);
  }

  function renderChain() {
    let html = "";
    chain.forEach((tag, i) => {
      const classes = ["chain-tag"];
      if (i === 0) classes.push("starter");
      if (i === chain.length - 1 && i > 0) classes.push("latest");

      html += `<span class="${classes.join(" ")}">${escapeHtml(tag)}</span>`;

      if (i < chain.length - 1) {
        const count = chainCounts[i];
        html += `<span class="chain-connector">
          <span class="arrow">→</span>
          <span class="co-label">${formatCount(count)}</span>
        </span>`;
      }
    });

    dom.chainDisplay.innerHTML = html;
    dom.chainDisplay.scrollTop = dom.chainDisplay.scrollHeight;
  }

  function updateStats() {
    dom.chainLength.textContent = chain.length;

    if (chainCounts.length > 0) {
      const lastCount = chainCounts[chainCounts.length - 1];
      dom.lastLink.textContent = formatCount(lastCount);
    } else {
      dom.lastLink.textContent = "—";
    }
  }

  function checkMilestone() {
    const len = chain.length;
    const milestones = {
      5: { text: "Getting started! 🔥", color: "var(--success)" },
      10: { text: "On a roll! 🎉", color: "var(--warning)" },
      15: { text: "Tag master! ⚡", color: "#ff6b81" },
      20: { text: "ABSOLUTE LEGEND 🏆", color: "var(--accent)" },
      25: { text: "You ARE the Archive 📚", color: "#a78bfa" },
      30: { text: "Touch grass? Never heard of it 🌿", color: "#34d399" },
    };

    if (milestones[len]) {
      dom.milestoneMsg.textContent = milestones[len].text;
      dom.milestoneMsg.style.color = milestones[len].color;
      dom.milestoneMsg.style.animation = "none";
      dom.milestoneMsg.offsetHeight;
      dom.milestoneMsg.style.animation = "milestoneFlash 0.6s ease";
    }
  }

  // ═══════════════════════════════════════════
  // End Game
  // ═══════════════════════════════════════════
  function endGame() {
    gameActive = false;
    saveBest(chain.length, threshold);
    showScreen("end");

    dom.endTitle.textContent =
      chain.length >= 15 ? "Legendary Chain!" : "Chain Complete!";
    dom.endSubtitle.textContent = getEndMessage(chain.length);

    dom.finalLength.textContent = chain.length;

    if (chainCounts.length > 0) {
      dom.finalWeakest.textContent = formatCount(Math.min(...chainCounts));
      dom.finalStrongest.textContent = formatCount(Math.max(...chainCounts));
    } else {
      dom.finalWeakest.textContent = "—";
      dom.finalStrongest.textContent = "—";
    }

    // Render final chain
    let html = "";
    chain.forEach((tag, i) => {
      const classes = ["chain-tag"];
      if (i === 0) classes.push("starter");
      html += `<span class="${classes.join(" ")}">${escapeHtml(tag)}</span>`;
      if (i < chain.length - 1) {
        html += `<span class="chain-connector">
          <span class="arrow">→</span>
          <span class="co-label">${formatCount(chainCounts[i])}</span>
        </span>`;
      }
    });
    dom.finalChain.innerHTML = html;
  }

  function getEndMessage(len) {
    if (len >= 25) return "You've transcended mortal tagging. The Archive bows to you.";
    if (len >= 20) return "You've seen things no tag should see.";
    if (len >= 15) return "That's a chain worthy of the front page.";
    if (len >= 10) return "Solid chain! You know your tags.";
    if (len >= 5) return "Not bad! Room to grow though.";
    return "Short but sweet. Try again?";
  }

  // ═══════════════════════════════════════════
  // Share
  // ═══════════════════════════════════════════
  function shareChain() {
    const diffLabels = { 100: "Casual", 500: "Normal", 2000: "Hard", 5000: "Unhinged" };
    const diffLabel = diffLabels[threshold] || threshold;
    let text = `🔗 Tag Chain (${diffLabel}) — ${chain.length} tags!\n\n`;
    text += chain.join(" → ");

    navigator.clipboard.writeText(text).then(() => {
      showToast();
    }).catch(() => {
      const ta = document.createElement("textarea");
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
      showToast();
    });
  }

  function showToast() {
    dom.copyToast.classList.add("show");
    setTimeout(() => dom.copyToast.classList.remove("show"), 2000);
  }

  // ═══════════════════════════════════════════
  // Initialize
  // ═══════════════════════════════════════════
  function init() {
    initStartScreen();

    // Game autocomplete — shows ALL matching AO3 tags, marks used ones
    setupAsyncAutocomplete(
      dom.tagInput,
      dom.autocompleteList,
      async (text) => {
        if (!gameActive) return [];
        const results = await AO3.autocomplete(text);
        return results.map((r) => ({
          name: r.name,
          used: usedTags.has(r.name.toLowerCase()),
        }));
      },
      (tag) => addTag(tag)
    );

    // Add button
    dom.addBtn.addEventListener("click", () => {
      addTag(dom.tagInput.value.trim());
    });

    // Give up
    dom.giveUpBtn.addEventListener("click", () => {
      if (gameActive) endGame();
    });

    // Share
    dom.shareBtn.addEventListener("click", shareChain);

    // Restart
    dom.restartBtn.addEventListener("click", () => {
      dom.starterInput.value = "";
      showScreen("start");
      displayPersonalBest();
      renderStarterChips();
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
