export function initDashboard(config) {
  const TAG_CLASS = {
    Leadership: "tag-leadership",
    Strategy: "tag-strategy",
    Product: "tag-product",
    Regulatory: "tag-regulatory",
    Earnings: "tag-earnings",
    Press: "tag-press",
  };

  const TAG_COLOR = {
    Leadership: "var(--tag-leadership)",
    Strategy: "var(--tag-strategy)",
    Product: "var(--tag-product)",
    Regulatory: "var(--tag-regulatory)",
    Earnings: "var(--tag-earnings)",
    Press: "var(--tag-press)",
  };

  const MOBILE_QUERY = window.matchMedia("(max-width: 720px)");
  let activeRegionId = null;
  let lastData = null;

  function escapeHtml(text) {
    return String(text ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function formatTime(iso, timezone) {
    if (!iso) return "";
    return new Date(iso).toLocaleString("en-SG", {
      timeZone: timezone,
      weekday: "short",
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    });
  }

  function shortRegionName(name) {
    return name
      .replace(" & ", " · ")
      .replace("Hong Kong", "HK")
      .replace("Southeast Asia", "SEA")
      .replace("Australia & New Zealand", "ANZ")
      .replace("Japan & Korea", "JP/KR");
  }

  function renderBullet(b, timezone) {
    const tagClass = TAG_CLASS[b.tag] ?? "tag-press";
    const via =
      b.via === "rss"
        ? '<span class="via-rss">RSS</span>'
        : b.via === "sections"
          ? '<span class="via-rss">News</span>'
          : "";
    return `
      <li>
        <span class="tag ${tagClass}">${escapeHtml(b.tag)}</span>
        <div class="bullet-body">
          <a href="${escapeHtml(b.url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(b.headline)}</a>
          ${via}
          <span class="source">${escapeHtml(b.source)}${b.published ? " · " + formatTime(b.published, timezone) : ""}</span>
        </div>
      </li>`;
  }

  function renderCard(sector, timezone, bulletsPerRegion, windowHours, isActive = false) {
    const count = sector.bullets?.length ?? 0;
    const barColor = sector.color ?? "var(--accent)";
    const bullets = count
      ? sector.bullets.map((b) => renderBullet(b, timezone)).join("")
      : `<li class="empty">No headlines in the last ${windowHours} hours.</li>`;

    return `
      <article class="card${isActive ? " active" : ""}" id="region-${escapeHtml(sector.id)}" data-region-id="${escapeHtml(sector.id)}">
        <div class="card-header">
          <span class="sector-bar" style="background:${barColor}"></span>
          <h2>${escapeHtml(sector.name)}</h2>
          <span class="card-count">${count}/${bulletsPerRegion}<br>${sector.sourceCount ?? 0} sources</span>
        </div>
        <ul class="bullets">${bullets}</ul>
      </article>`;
  }

  function renderSummary(data) {
    const all = data.sectors.flatMap((s) => s.bullets ?? []);
    const byTag = {};
    for (const b of all) byTag[b.tag] = (byTag[b.tag] ?? 0) + 1;

    const summary = document.getElementById("summary");
    if (!summary) return;
    if (!all.length) {
      summary.hidden = true;
      return;
    }

    const tagBits = Object.entries(byTag)
      .sort((a, b) => b[1] - a[1])
      .map(([tag, n]) => `<span><i class="dot" style="background:${TAG_COLOR[tag] ?? "var(--tag-press)"}"></i>${n} ${tag}</span>`)
      .join("");

    summary.innerHTML = `
      <span class="summary-count">${all.length} headlines · ${data.totalSourceDomains ?? 0} domains · last ${data.windowHours ?? 48}h</span>
      <span class="summary-tags">${tagBits}</span>`;
    summary.hidden = false;
  }

  function syncHeaderHeight() {
    const topBar = document.getElementById("top-bar");
    if (topBar) {
      document.documentElement.style.setProperty("--header-h", `${topBar.offsetHeight}px`);
    }
  }

  function setActiveRegion(regionId) {
    activeRegionId = regionId;
    const isMobile = MOBILE_QUERY.matches;

    document.querySelectorAll(".region-tab").forEach((tab) => {
      const active = tab.dataset.regionId === regionId;
      tab.classList.toggle("active", active);
      tab.setAttribute("aria-selected", active ? "true" : "false");
      if (active) {
        tab.style.background = tab.dataset.color ?? "var(--accent)";
      } else {
        tab.style.background = "";
      }
    });

    document.querySelectorAll(".card").forEach((card) => {
      card.classList.toggle("active", !isMobile || card.dataset.regionId === regionId);
    });
  }

  function renderRegionNav(sectors) {
    const nav = document.getElementById("region-nav");
    const inner = document.getElementById("region-nav-inner");
    if (!nav || !inner) return;

    if (!MOBILE_QUERY.matches) {
      nav.hidden = true;
      return;
    }

    inner.innerHTML = sectors
      .map((sector) => {
        const label = shortRegionName(sector.name);
        const count = sector.bullets?.length ?? 0;
        return `<button type="button" class="region-tab" data-region-id="${escapeHtml(sector.id)}" data-color="${escapeHtml(sector.color ?? "#1a4a6e")}" role="tab">${escapeHtml(label)} (${count})</button>`;
      })
      .join("");

    nav.hidden = false;

    inner.querySelectorAll(".region-tab").forEach((tab) => {
      tab.addEventListener("click", () => setActiveRegion(tab.dataset.regionId));
    });

    const initial = activeRegionId && sectors.some((s) => s.id === activeRegionId) ? activeRegionId : sectors[0]?.id;
    if (initial) setActiveRegion(initial);
  }

  function renderCards(data) {
    const timezone = data.timezone ?? config.timezone;
    const bulletsPerRegion = data.bulletsPerRegion ?? 5;
    const windowHours = data.windowHours ?? 48;
    const isMobile = MOBILE_QUERY.matches;
    lastData = data;

    const mainEl = document.getElementById("main");
    if (!mainEl) return;

    const cards = data.sectors
      .map((sector) =>
        renderCard(
          sector,
          timezone,
          bulletsPerRegion,
          windowHours,
          !isMobile || sector.id === (activeRegionId ?? data.sectors[0]?.id),
        ),
      )
      .join("");

    mainEl.innerHTML = `<div class="grid${isMobile ? " mobile-tabs" : ""}">${cards}</div>`;
    renderRegionNav(data.sectors);
    syncHeaderHeight();
  }

  function render(data) {
    const timezone = data.timezone ?? config.timezone;
    const bulletsPerRegion = data.bulletsPerRegion ?? 5;
    const windowHours = data.windowHours ?? 48;
    document.title = data.title ?? config.title;

    const titleEl = document.getElementById("dashboard-title");
    if (titleEl) titleEl.textContent = data.title ?? config.title;

    const metaEl = document.getElementById("meta");
    if (metaEl) {
      metaEl.textContent = `Updated ${formatTime(data.generatedAt, timezone)} SGT · Last ${windowHours}h · ${bulletsPerRegion} per region`;
    }

    const footerEl = document.getElementById("footer");
    if (footerEl) {
      footerEl.textContent = `${data.totalSourceDomains ?? 0} source domains · News sections + RSS · Last ${windowHours}h · Auto-refresh daily at 7:00 AM SGT`;
    }

    renderSummary(data);
    renderCards(data);
  }

  function setStatus(message, type = "") {
    const el = document.getElementById("status");
    if (!el) return;
    el.textContent = message;
    el.className = type ? `status ${type}` : "status";
  }

  async function loadDashboard({ refresh = false } = {}) {
    const main = document.getElementById("main");
    const btn = document.getElementById("refresh-btn");
    const summary = document.getElementById("summary");
    if (summary) summary.hidden = true;

    if (btn) btn.disabled = true;
    if (main) {
      main.innerHTML = `<p class="loading">${refresh ? "Pulling latest headlines… (1–2 min)" : "Loading dashboard…"}</p>`;
    }
    setStatus(refresh ? "Fetching latest headlines…" : "");

    try {
      const endpoint = refresh ? "./api/refresh" : "./api/dashboard";
      const res = await fetch(endpoint, {
        method: refresh ? "POST" : "GET",
        cache: "no-store",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to load dashboard");
      render(data);
      setStatus(refresh ? "Dashboard refreshed." : "", refresh ? "success" : "");
    } catch (err) {
      try {
        const fallback = await fetch("./dashboard.json", { cache: "no-store" });
        if (fallback.ok) {
          render(await fallback.json());
          setStatus("Loaded cached snapshot.", "");
          return;
        }
      } catch {
        // ignore
      }
      if (main) main.innerHTML = `<p class="error">${escapeHtml(err.message)}</p>`;
      setStatus(err.message, "error");
    } finally {
      if (btn) btn.disabled = false;
    }
  }

  const refreshBtn = document.getElementById("refresh-btn");
  if (refreshBtn) {
    refreshBtn.addEventListener("click", () => loadDashboard({ refresh: true }));
  }

  const legendToggle = document.getElementById("legend-toggle");
  const legend = document.getElementById("legend");
  if (legendToggle && legend) {
    legendToggle.addEventListener("click", () => {
      const open = legend.classList.toggle("open");
      legendToggle.setAttribute("aria-expanded", open ? "true" : "false");
      legendToggle.textContent = open ? "Hide tag legend" : "Show tag legend";
    });
  }

  MOBILE_QUERY.addEventListener("change", () => {
    if (lastData) renderCards(lastData);
    syncHeaderHeight();
  });

  window.addEventListener("resize", syncHeaderHeight);
  loadDashboard();
}
