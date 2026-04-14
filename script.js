/* =========================
   CONFIG (modifica solo qui)
   ========================= */
const CONFIG = {
  // Source vector tiles: usa TileJSON se disponibile (consigliato).
  // Esempio (MapTiler): "https://api.maptiler.com/tiles/<tilesetId>/tiles.json?key=<KEY>"
  TILEJSON_URL:
    "https://api.maptiler.com/tiles/019d8b11-193c-78e6-b98b-301c2080fa5f/tiles.json?key=2ah8EVymj6w3ASycVKHs",

  // Fallback: template XYZ diretto (PBF). Usalo solo se non hai TileJSON.
  // Esempio: "https://example.com/tiles/{z}/{x}/{y}.pbf"
  TILES_URL: "https://api.maptiler.com/tiles/019d8b11-193c-78e6-b98b-301c2080fa5f/{z}/{x}/{y}.pbf?key=2ah8EVymj6w3ASycVKHs",

  // Dettagli tileset (devono combaciare con il TileJSON: vector_layers[].id e fields)
  SOURCE_ID: "habitat-vt",
  SOURCE_LAYER: "habitat_cml",
  PROPERTY_CODE: "NATURA2K",

  // Vista iniziale (Veneto)
  INITIAL_VIEW: {
    center: [11.9, 45.5], // [lon, lat]
    zoom: 8,
  },

  // Limita navigazione (Nord-Est Italia, circa)
  MAX_BOUNDS: [
    [10.1, 44.3], // SW [lon, lat]
    [13.6, 47.3], // NE [lon, lat]
  ],

  // Codici mostrati in filtro + legenda
  HABITAT_CODES: [
    "1130",
    "1140",
    "1150",
    "1210",
    "1310",
    "1320",
    "1410",
    "1420",
    "2110",
    "2120",
    "2130",
    "2160",
    "2230",
    "2250",
    "2270",
  ],

  // Scoperta automatica codici dai tiles caricati (senza backend: solo ciò che esplori).
  AUTO_DISCOVER_CODES: false,
  MAX_DISCOVERED_CODES: 300,

  // Se hai una proprietà univoca per feature, puoi promuoverla a id (utile per hover via feature-state).
  // Esempio: PROMOTE_ID: "id"
  PROMOTE_ID: null,

  // Fit automatico (best effort). Se conosci i bounds, impostali per un fit preciso:
  // DATA_BOUNDS: [[minLon, minLat], [maxLon, maxLat]]
  DATA_BOUNDS: null,

  // Stile habitat
  FILL_OPACITY: 0.55,
  HOVER_OPACITY: 0.85,
  OUTLINE_COLOR: "rgba(2, 6, 23, 0.95)",
  OUTLINE_WIDTH: 1.2,

  // Transizioni hover
  TRANSITION_MS: 120,

  // Siti marini (GeoJSON) senza cartografia habitat
  MARINE_SITES_GEOJSON_URL: "./data/siti_mare.geojson",
};

/* =========================
   Utilità
   ========================= */
function clampArrayUnique(values) {
  return Array.from(new Set(values.filter(Boolean).map((v) => String(v))));
}

const PALETTE = [
  "#22c55e",
  "#06b6d4",
  "#3b82f6",
  "#a855f7",
  "#f97316",
  "#eab308",
  "#ef4444",
  "#14b8a6",
  "#8b5cf6",
  "#10b981",
  "#f59e0b",
  "#0ea5e9",
  "#84cc16",
  "#ec4899",
  "#fb7185",
  "#38bdf8",
];

function createPaletteManager(seedCodes = []) {
  const map = new Map();
  let cursor = 0;

  const ensure = (code) => {
    const k = String(code);
    if (!k) return null;
    if (!map.has(k)) {
      map.set(k, PALETTE[cursor % PALETTE.length]);
      cursor += 1;
    }
    return map.get(k);
  };

  seedCodes.forEach(ensure);

  return {
    map,
    ensure,
  };
}

function colorExpression(property, paletteMap, fallback = "rgba(148, 163, 184, 0.55)") {
  const expr = ["match", ["get", property]];
  for (const [code, color] of paletteMap.entries()) {
    expr.push(code, color);
  }
  expr.push(fallback);
  return expr;
}

function computeFeaturesBounds(features) {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  const pushCoord = (c) => {
    const x = c[0];
    const y = c[1];
    if (!Number.isFinite(x) || !Number.isFinite(y)) return;
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);
  };

  const walk = (coords) => {
    if (!Array.isArray(coords)) return;
    if (typeof coords[0] === "number" && typeof coords[1] === "number") {
      pushCoord(coords);
      return;
    }
    for (const item of coords) walk(item);
  };

  for (const f of features) {
    if (!f || !f.geometry) continue;
    walk(f.geometry.coordinates);
  }

  if (!Number.isFinite(minX) || !Number.isFinite(minY) || !Number.isFinite(maxX) || !Number.isFinite(maxY)) {
    return null;
  }
  return [
    [minX, minY],
    [maxX, maxY],
  ];
}

function htmlEscape(s) {
  return String(s)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function safeStringifyValue(v) {
  if (v == null) return "—";
  if (typeof v === "string") return v;
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  try {
    return JSON.stringify(v);
  } catch {
    return String(v);
  }
}

function renderPropertiesList(containerEl, properties) {
  containerEl.innerHTML = "";
  if (!properties || typeof properties !== "object") {
    containerEl.innerHTML = `<div class="prop"><div class="prop__key">Nessun attributo</div><div class="prop__value">—</div></div>`;
    return;
  }

  const entries = Object.entries(properties)
    .filter(([k]) => String(k).toLowerCase() !== "path")
    .sort(([a], [b]) => a.localeCompare(b));
  if (!entries.length) {
    containerEl.innerHTML = `<div class="prop"><div class="prop__key">Nessun attributo</div><div class="prop__value">—</div></div>`;
    return;
  }

  for (const [k, v] of entries) {
    const row = document.createElement("div");
    row.className = "prop";

    const keyEl = document.createElement("div");
    keyEl.className = "prop__key";
    keyEl.textContent = String(k);

    const valEl = document.createElement("div");
    valEl.className = "prop__value";
    valEl.textContent = safeStringifyValue(v);

    row.appendChild(keyEl);
    row.appendChild(valEl);
    containerEl.appendChild(row);
  }
}

/* =========================
   UI (dropdown + legend)
   ========================= */
function renderDropdown(selectEl, codes) {
  const existing = new Set(Array.from(selectEl.options).map((o) => o.value));
  for (const code of codes) {
    const value = String(code);
    if (existing.has(value)) continue;
    const opt = document.createElement("option");
    opt.value = value;
    opt.textContent = value;
    selectEl.appendChild(opt);
  }
}

function renderLegend(containerEl, codes, paletteMap) {
  containerEl.innerHTML = "";
  for (const code of codes) {
    const row = document.createElement("div");
    row.className = "legend__item";

    const swatch = document.createElement("span");
    swatch.className = "legend__swatch";
    swatch.style.backgroundColor = paletteMap.get(String(code)) || "rgba(148, 163, 184, 0.55)";

    const label = document.createElement("div");
    label.className = "legend__code";
    label.textContent = String(code);

    row.appendChild(swatch);
    row.appendChild(label);
    containerEl.appendChild(row);
  }
}

function updateHabitatFillPaint(map, paletteMap, baseOpacity, hoverOpacity) {
  map.setPaintProperty(LAYER_IDS.fill, "fill-color", colorExpression(CONFIG.PROPERTY_CODE, paletteMap));
  map.setPaintProperty(LAYER_IDS.fill, "fill-opacity", [
    "case",
    ["boolean", ["feature-state", HOVER_STATE_KEY], false],
    hoverOpacity,
    baseOpacity,
  ]);
  map.setPaintProperty(LAYER_IDS.fill, "fill-opacity-transition", { duration: CONFIG.TRANSITION_MS, delay: 0 });
}

/* =========================
   Map setup
   ========================= */
const LAYER_IDS = {
  satellite: "esri-satellite",
  labels: "esri-labels",
  fill: "habitat-fill",
  outline: "habitat-outline",
  marineSitesFill: "marine-sites-fill",
  marineSitesOutline: "marine-sites-outline",
};

const HOVER_STATE_KEY = "hover";
let hovered = null; // { id, source, sourceLayer }

function buildMapStyleSkeleton() {
  return {
    version: 8,
    name: "Habitat Natura 2000",
    glyphs: "https://demotiles.maplibre.org/font/{fontstack}/{range}.pbf",
    sources: {},
    layers: [],
  };
}

function addEsriBasemap(map) {
  map.addSource("esri-imagery", {
    type: "raster",
    tiles: [
      "https://services.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
    ],
    tileSize: 256,
    attribution:
      'Imagery © <a href="https://www.esri.com/" target="_blank" rel="noreferrer">Esri</a>',
  });

  map.addLayer({
    id: LAYER_IDS.satellite,
    type: "raster",
    source: "esri-imagery",
  });

  map.addSource("esri-labels", {
    type: "raster",
    tiles: [
      "https://services.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}",
    ],
    tileSize: 256,
    attribution:
      'Labels © <a href="https://www.esri.com/" target="_blank" rel="noreferrer">Esri</a>',
  });

  map.addLayer({
    id: LAYER_IDS.labels,
    type: "raster",
    source: "esri-labels",
  });
}

function addHabitatVectorSource(map) {
  const source = { type: "vector" };

  if (CONFIG.TILEJSON_URL) {
    source.url = CONFIG.TILEJSON_URL;
  } else {
    source.tiles = [CONFIG.TILES_URL];
  }

  if (CONFIG.PROMOTE_ID) {
    source.promoteId = CONFIG.PROMOTE_ID;
  }

  map.addSource(CONFIG.SOURCE_ID, source);
}

function addMarineSitesGeoJSON(map) {
  map.addSource("marine-sites", {
    type: "geojson",
    data: CONFIG.MARINE_SITES_GEOJSON_URL,
  });

  map.addLayer({
    id: LAYER_IDS.marineSitesFill,
    type: "fill",
    source: "marine-sites",
    paint: {
      "fill-color": "rgba(56, 189, 248, 0.35)",
      "fill-opacity": 0.25,
      "fill-antialias": true,
    },
  });

  map.addLayer({
    id: LAYER_IDS.marineSitesOutline,
    type: "line",
    source: "marine-sites",
    paint: {
      "line-color": "rgba(56, 189, 248, 0.95)",
      "line-width": 2,
      "line-dasharray": [1.2, 1.2],
      "line-opacity": 0.95,
    },
  });

  map.on("mousemove", LAYER_IDS.marineSitesFill, () => {
    map.getCanvas().style.cursor = "pointer";
  });
  map.on("mouseleave", LAYER_IDS.marineSitesFill, () => {
    map.getCanvas().style.cursor = "";
  });

  const popup = new maplibregl.Popup({
    closeButton: true,
    closeOnClick: true,
    maxWidth: "340px",
  });

  map.on("click", LAYER_IDS.marineSitesFill, (e) => {
    const f = e.features && e.features[0];
    if (!f) return;
    const p = f.properties || {};
    const name = p.FIRST_C_DE ?? p.nome ?? p.name ?? "Sito marino";
    const code = p.A_CODICE ?? p.codice ?? "—";
    const tipo = p.TIPO ?? "—";

    popup
      .setLngLat(e.lngLat)
      .setHTML(
        `<p class="popup__title">${htmlEscape(String(name))}</p>
         <p class="popup__value">${htmlEscape(String(code))}</p>
         <p class="popup__title">Tipo: ${htmlEscape(String(tipo))}</p>`
      )
      .addTo(map);
  });
}

function addHabitatLayers(map, paletteMap) {
  const colorExpr = colorExpression(CONFIG.PROPERTY_CODE, paletteMap);

  map.addLayer({
    id: LAYER_IDS.fill,
    type: "fill",
    source: CONFIG.SOURCE_ID,
    "source-layer": CONFIG.SOURCE_LAYER,
    paint: {
      "fill-color": colorExpr,
      "fill-opacity": [
        "case",
        ["boolean", ["feature-state", HOVER_STATE_KEY], false],
        CONFIG.HOVER_OPACITY,
        CONFIG.FILL_OPACITY,
      ],
      "fill-antialias": true,
      "fill-opacity-transition": { duration: CONFIG.TRANSITION_MS, delay: 0 },
    },
  });

  map.addLayer({
    id: LAYER_IDS.outline,
    type: "line",
    source: CONFIG.SOURCE_ID,
    "source-layer": CONFIG.SOURCE_LAYER,
    paint: {
      "line-color": CONFIG.OUTLINE_COLOR,
      "line-width": CONFIG.OUTLINE_WIDTH,
      "line-opacity": 0.9,
    },
  });
}

function setHoverState(map, feature, isHover) {
  if (!feature) return false;
  if (feature.id === undefined || feature.id === null) return false;

  map.setFeatureState(
    { source: CONFIG.SOURCE_ID, sourceLayer: CONFIG.SOURCE_LAYER, id: feature.id },
    { [HOVER_STATE_KEY]: isHover }
  );
  return true;
}

function clearHover(map) {
  if (!hovered) return;
  map.setFeatureState(
    { source: hovered.source, sourceLayer: hovered.sourceLayer, id: hovered.id },
    { [HOVER_STATE_KEY]: false }
  );
  hovered = null;
}

function wireInteractions(map) {
  map.on("mousemove", LAYER_IDS.fill, (e) => {
    map.getCanvas().style.cursor = "pointer";

    const f = e.features && e.features[0];
    if (!f) return;

    if (hovered && hovered.id !== f.id) clearHover(map);

    const ok = setHoverState(map, f, true);
    if (ok) {
      hovered = { id: f.id, source: CONFIG.SOURCE_ID, sourceLayer: CONFIG.SOURCE_LAYER };
    }
  });

  map.on("mouseleave", LAYER_IDS.fill, () => {
    map.getCanvas().style.cursor = "";
    clearHover(map);
  });

  const popup = new maplibregl.Popup({
    closeButton: true,
    closeOnClick: true,
    maxWidth: "320px",
    className: "habitat-popup",
  });

  map.on("click", LAYER_IDS.fill, (e) => {
    const f = e.features && e.features[0];
    if (!f) return;

    const code = f.properties ? f.properties[CONFIG.PROPERTY_CODE] : undefined;
    const codeText = code == null ? "—" : String(code);

    popup
      .setLngLat(e.lngLat)
      .setHTML(
        `<p class="popup__title">Codice habitat</p>
         <p class="popup__value">${htmlEscape(codeText)}</p>
         <button type="button" class="popup__btn" data-action="details">Dettagli</button>`
      )
      .addTo(map);

    const popupEl = popup.getElement();
    const btn = popupEl ? popupEl.querySelector('[data-action="details"]') : null;
    if (btn) {
      btn.addEventListener(
        "click",
        () => {
          if (typeof window.__openDetailsPanel === "function") {
            window.__openDetailsPanel(f);
          }
        },
        { once: true }
      );
    }
  });
}

function applyFilter(map, selectedValue) {
  if (selectedValue === "__ALL__") {
    map.setFilter(LAYER_IDS.fill, null);
    map.setFilter(LAYER_IDS.outline, null);
    return;
  }
  const v = String(selectedValue);
  const filter = ["==", ["get", CONFIG.PROPERTY_CODE], v];
  map.setFilter(LAYER_IDS.fill, filter);
  map.setFilter(LAYER_IDS.outline, filter);
}

async function tryFitToData(map) {
  if (Array.isArray(CONFIG.DATA_BOUNDS)) {
    map.fitBounds(CONFIG.DATA_BOUNDS, { padding: 40, duration: 700 });
    return;
  }

  // Fit "best effort" sui feature già caricati (approssimato se è caricato solo un sottoinsieme di tile).
  let attempts = 0;
  const maxAttempts = 8;

  const attempt = () => {
    attempts += 1;
    let features = [];
    try {
      features = map.querySourceFeatures(CONFIG.SOURCE_ID, { sourceLayer: CONFIG.SOURCE_LAYER }) || [];
    } catch {
      features = [];
    }

    const bounds = computeFeaturesBounds(features);
    if (bounds) {
      map.fitBounds(bounds, { padding: 40, duration: 700, maxZoom: 12 });
      return true;
    }

    if (attempts < maxAttempts) {
      requestAnimationFrame(attempt);
    }
    return false;
  };

  attempt();
}

/* =========================
   Boot
   ========================= */
(function main() {
  const selectEl = document.getElementById("habitatSelect");
  const legendEl = document.getElementById("legendItems");
  const opacityRangeEl = document.getElementById("opacityRange");
  const opacityValueEl = document.getElementById("opacityValue");
  const panelEl = document.getElementById("detailsPanel");
  const panelCloseEl = document.getElementById("panelClose");
  const panelTitleEl = document.getElementById("panelTitle");
  const panelPropsEl = document.getElementById("panelProps");

  const initialCodes = clampArrayUnique(CONFIG.HABITAT_CODES);
  const paletteMgr = createPaletteManager(initialCodes);
  const paletteMap = paletteMgr.map;
  const discoveredCodes = new Set(initialCodes);

  renderDropdown(selectEl, initialCodes);
  renderLegend(legendEl, initialCodes, paletteMap);

  const map = new maplibregl.Map({
    container: "map",
    style: buildMapStyleSkeleton(),
    center: CONFIG.INITIAL_VIEW.center,
    zoom: CONFIG.INITIAL_VIEW.zoom,
    maxBounds: CONFIG.MAX_BOUNDS,
    hash: true,
  });

  map.addControl(new maplibregl.NavigationControl({ showCompass: true, showZoom: true }), "top-left");
  map.addControl(new maplibregl.ScaleControl({ unit: "metric", maxWidth: 120 }), "bottom-right");

  const openPanel = (feature) => {
    const code = feature && feature.properties ? feature.properties[CONFIG.PROPERTY_CODE] : null;
    const codeText = code == null ? "—" : String(code);
    panelTitleEl.textContent = `Habitat: ${codeText}`;
    renderPropertiesList(panelPropsEl, feature ? feature.properties : null);

    panelEl.classList.remove("panel--hidden");
    panelEl.setAttribute("aria-hidden", "false");
  };

  const closePanel = () => {
    panelEl.classList.add("panel--hidden");
    panelEl.setAttribute("aria-hidden", "true");
  };

  panelCloseEl.addEventListener("click", closePanel);
  document.addEventListener("keydown", (ev) => {
    if (ev.key === "Escape") closePanel();
  });

  // Expose a safe hook for popup button (kept minimal on purpose)
  window.__openDetailsPanel = openPanel;

  map.on("load", () => {
    addEsriBasemap(map);
    addMarineSitesGeoJSON(map);
    addHabitatVectorSource(map);
    addHabitatLayers(map, paletteMap);
    wireInteractions(map);

    // Overlay di caricamento: nascondi al primo render stabile
    const loadingEl = document.getElementById("loading");
    const hideLoading = () => {
      if (!loadingEl) return;
      loadingEl.classList.add("loading--hidden");
      window.setTimeout(() => loadingEl.remove(), 320);
    };
    map.once("idle", hideLoading);

    // Toast errori (tiles/geojson/style)
    const toastEl = document.getElementById("toast");
    let toastTimer = null;
    const showToast = (msg) => {
      if (!toastEl) return;
      toastEl.textContent = msg;
      toastEl.classList.remove("toast--hidden");
      if (toastTimer) window.clearTimeout(toastTimer);
      toastTimer = window.setTimeout(() => toastEl.classList.add("toast--hidden"), 5200);
    };

    map.on("error", (ev) => {
      const message =
        (ev && ev.error && (ev.error.message || ev.error.toString && ev.error.toString())) ||
        "Errore di caricamento risorse mappa.";
      showToast(message);
    });

    // Chiudi pannello dettagli cliccando "nel vuoto" (fuori da layer e UI)
    map.on("click", (e) => {
      if (!panelEl || panelEl.classList.contains("panel--hidden")) return;

      const t = e.originalEvent ? e.originalEvent.target : null;
      if (t && panelEl.contains(t)) return;

      // If user clicks inside any popup, don't auto-close the panel
      const popupRoot = document.querySelector(".maplibregl-popup");
      if (t && popupRoot && popupRoot.contains(t)) return;

      const hits = map.queryRenderedFeatures(e.point, {
        layers: [LAYER_IDS.fill, LAYER_IDS.marineSitesFill],
      });
      if (!hits || hits.length === 0) closePanel();
    });

    // Auto-discovery + best-effort fit after first render
    map.once("idle", () => {
      tryFitToData(map);
    });

    // Keep discovering codes as tiles load while navigating.
    map.on("idle", () => {
      if (!CONFIG.AUTO_DISCOVER_CODES) return;
      if (discoveredCodes.size >= CONFIG.MAX_DISCOVERED_CODES) return;

      let feats = [];
      try {
        feats = map.querySourceFeatures(CONFIG.SOURCE_ID, { sourceLayer: CONFIG.SOURCE_LAYER }) || [];
      } catch {
        feats = [];
      }

      let changed = false;
      for (const f of feats) {
        const code = f && f.properties ? f.properties[CONFIG.PROPERTY_CODE] : null;
        if (code == null) continue;
        const k = String(code);
        if (!k) continue;
        if (discoveredCodes.has(k)) continue;
        discoveredCodes.add(k);
        paletteMgr.ensure(k);
        changed = true;
        if (discoveredCodes.size >= CONFIG.MAX_DISCOVERED_CODES) break;
      }

      if (changed) {
        const allCodes = Array.from(discoveredCodes).sort();
        renderDropdown(selectEl, allCodes);
        renderLegend(legendEl, allCodes, paletteMap);
        updateHabitatFillPaint(map, paletteMap, CONFIG.FILL_OPACITY, CONFIG.HOVER_OPACITY);
      }
    });
  });

  selectEl.addEventListener("change", (e) => {
    applyFilter(map, e.target.value);
  });

  const setOpacityUI = (valuePct) => {
    const pct = Math.max(10, Math.min(95, Number(valuePct)));
    const baseOpacity = pct / 100;
    CONFIG.FILL_OPACITY = baseOpacity;
    opacityValueEl.textContent = `${Math.round(pct)}%`;
    opacityRangeEl.value = String(Math.round(pct));

    if (map && map.isStyleLoaded() && map.getLayer(LAYER_IDS.fill)) {
      updateHabitatFillPaint(map, paletteMap, CONFIG.FILL_OPACITY, CONFIG.HOVER_OPACITY);
    }
  };

  opacityRangeEl.addEventListener("input", (e) => {
    setOpacityUI(e.target.value);
  });

  setOpacityUI(Math.round(CONFIG.FILL_OPACITY * 100));

  selectEl.value = "__ALL__";
})();

