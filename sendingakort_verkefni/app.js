"use strict";

// Fyrsta útgáfa: gögn vistast í localStorage í þessum vafra.
const STORAGE_KEY = "leid_sendningar_v1";
const GEOCODE_CACHE_KEY = "leid_geocode_cache_v1";
const DEFAULT_VIEW = [64.113, -21.865];
const DEFAULT_ZOOM = 11;
const CONFIG = {
  tileUrl: "https://tile.openstreetmap.org/{z}/{x}/{y}.png",
  // Tilraunaþjónusta fyrir litla prófun. Skipta út fyrir leyfisbundna
  // heimilisfangaþjónustu áður en kerfið fer í notkun hjá fyrirtæki.
  geocodeUrl: "https://nominatim.openstreetmap.org/search"
};

const $ = (selector) => document.querySelector(selector);
const state = loadState();
const geocodeCache = loadJSON(GEOCODE_CACHE_KEY, {});
const map = L.map("map", { zoomControl: false }).setView(DEFAULT_VIEW, DEFAULT_ZOOM);
L.tileLayer(CONFIG.tileUrl, {
  maxZoom: 19,
  attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a> contributors'
}).addTo(map);
L.control.zoom({ position: "bottomright" }).addTo(map);

const markerLayer = L.layerGroup().addTo(map);
let routeLine = null;
let startMarker = null;
let mapMode = null; // null | "start" | "pin"
let pendingPin = null;
let draggedId = null;
let selectedId = null;
let lastGeocodeTime = 0;
let requestQueue = Promise.resolve();
let notifyTimer = null;

function loadJSON(key, fallback) {
  try { const stored = JSON.parse(localStorage.getItem(key)); return stored ?? fallback; }
  catch { return fallback; }
}

function loadState() {
  const value = loadJSON(STORAGE_KEY, null);
  if (!value || !Array.isArray(value.deliveries)) return { deliveries: [], start: null };
  return {
    deliveries: value.deliveries.filter((d) => d && typeof d.id === "string" && typeof d.address === "string" && Number.isFinite(d.lat) && Number.isFinite(d.lng)).slice(0, 400),
    start: value.start && Number.isFinite(value.start.lat) && Number.isFinite(value.start.lng) ? value.start : null
  };
}

function save() {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); }
  catch { notify("Ekki tókst að vista í vafranum.", true); }
}

function notify(message, error = false) {
  const box = $("#notification");
  box.textContent = message;
  box.classList.toggle("error", error);
  box.hidden = false;
  clearTimeout(notifyTimer);
  notifyTimer = setTimeout(() => { box.hidden = true; }, 4200);
}

function pinIcon(number, kind = "pending") {
  const type = kind === "done" ? "done" : kind === "start" ? "start" : "";
  return L.divIcon({
    className: "",
    html: `<div class="custom-pin ${type}">${kind === "start" ? "⌂" : number}</div>`,
    iconSize: [32, 32], iconAnchor: [16, 16], popupAnchor: [0, -16]
  });
}

function render() {
  const done = state.deliveries.filter((d) => d.done).length;
  $("#totalCount").textContent = state.deliveries.length;
  $("#pendingCount").textContent = state.deliveries.length - done;
  $("#doneCount").textContent = done;
  $("#listCount").textContent = state.deliveries.length;
  $("#sortButton").disabled = state.deliveries.filter((d) => !d.done).length < 2;
  $("#clearButton").disabled = !state.deliveries.length;
  renderList();
  renderMap();
}

function renderList() {
  const container = $("#deliveryList");
  container.replaceChildren();
  const visible = state.deliveries.filter((d) => !$("#hideDelivered").checked || !d.done);
  if (!visible.length) {
    const empty = document.createElement("div");
    empty.className = "empty-state";
    empty.innerHTML = '<div class="empty-icon">◇</div><strong>Engar sendingar á listanum</strong><p>Skráðu heimilisfang hér að ofan eða veldu „Setja pinna“ á kortinu.</p>';
    container.append(empty);
    return;
  }
  visible.forEach((delivery) => {
    const index = state.deliveries.findIndex((d) => d.id === delivery.id);
    const item = document.createElement("article");
    item.className = `delivery-item${delivery.done ? " done" : ""}${selectedId === delivery.id ? " selected" : ""}`;
    item.draggable = true;
    item.dataset.id = delivery.id;
    item.setAttribute("aria-label", `Sending ${index + 1}: ${delivery.address}`);

    const num = document.createElement("div");
    num.className = "order-index";
    num.textContent = String(index + 1);

    const copy = document.createElement("div");
    copy.className = "delivery-text";
    copy.title = "Sýna á kortinu";
    const address = document.createElement("div");
    address.className = "delivery-address";
    address.textContent = delivery.address;
    copy.append(address);
    if (delivery.note) {
      const note = document.createElement("div");
      note.className = "delivery-note";
      note.textContent = delivery.note;
      copy.append(note);
    }
    const status = document.createElement("div");
    status.className = "delivery-status";
    status.textContent = delivery.done ? "✓ Afhent" : "○ Bíður afhendingar";
    copy.append(status);
    copy.addEventListener("click", () => {
      selectedId = delivery.id;
      map.flyTo([delivery.lat, delivery.lng], Math.max(map.getZoom(), 14), { duration: .5 });
      render();
      const marker = markerById.get(delivery.id);
      if (marker) marker.openPopup();
    });

    const actions = document.createElement("div");
    actions.className = "delivery-actions";
    actions.append(
      makeAction(delivery.done ? "↶" : "✓", delivery.done ? "Merkja óafhent" : "Merkja afhent", () => {
        delivery.done = !delivery.done; save(); render();
      }),
      makeAction("↑", "Færa ofar", () => moveDelivery(delivery.id, -1), index === 0),
      makeAction("↓", "Færa neðar", () => moveDelivery(delivery.id, 1), index === state.deliveries.length - 1),
      makeAction("×", "Eyða sendingu", () => {
        state.deliveries.splice(index, 1);
        if (selectedId === delivery.id) selectedId = null;
        save(); render();
        notify("Sending fjarlægð.");
      }, false, "delete")
    );
    item.append(num, copy, actions);
    item.addEventListener("dragstart", (event) => {
      draggedId = delivery.id;
      event.dataTransfer.effectAllowed = "move";
      event.dataTransfer.setData("text/plain", delivery.id);
    });
    item.addEventListener("dragover", (event) => {
      event.preventDefault();
      event.dataTransfer.dropEffect = "move";
      item.classList.add("drag-over");
    });
    item.addEventListener("dragleave", () => item.classList.remove("drag-over"));
    item.addEventListener("drop", (event) => {
      event.preventDefault();
      const source = draggedId || event.dataTransfer.getData("text/plain");
      reorder(source, delivery.id);
    });
    item.addEventListener("dragend", () => { draggedId = null; document.querySelectorAll(".drag-over").forEach((el) => el.classList.remove("drag-over")); });
    container.append(item);
  });
}

function makeAction(symbol, label, action, disabled = false, extraClass = "") {
  const button = document.createElement("button");
  button.type = "button";
  button.className = `icon-btn ${extraClass}`;
  button.title = label;
  button.setAttribute("aria-label", label);
  button.textContent = symbol;
  button.disabled = disabled;
  button.addEventListener("click", action);
  return button;
}

function moveDelivery(id, step) {
  const source = state.deliveries.findIndex((d) => d.id === id);
  const target = source + step;
  if (source < 0 || target < 0 || target >= state.deliveries.length) return;
  const [item] = state.deliveries.splice(source, 1);
  state.deliveries.splice(target, 0, item);
  save(); render();
}

function reorder(from, to) {
  const source = state.deliveries.findIndex((d) => d.id === from);
  const target = state.deliveries.findIndex((d) => d.id === to);
  if (source < 0 || target < 0 || source === target) return;
  const [item] = state.deliveries.splice(source, 1);
  state.deliveries.splice(target, 0, item);
  draggedId = null;
  save(); render();
}

const markerById = new Map();
function renderMap() {
  markerLayer.clearLayers();
  markerById.clear();
  if (routeLine) { map.removeLayer(routeLine); routeLine = null; }
  if (startMarker) { map.removeLayer(startMarker); startMarker = null; }

  const routeCoords = [];
  if (state.start) {
    routeCoords.push([state.start.lat, state.start.lng]);
    startMarker = L.marker([state.start.lat, state.start.lng], { icon: pinIcon("", "start") })
      .bindPopup("<strong>Upphafsstaður</strong><div class='popup-muted'>Byrjun á röðun sendinga</div>")
      .addTo(map);
  }
  state.deliveries.forEach((d, i) => {
    const marker = L.marker([d.lat, d.lng], { icon: pinIcon(i + 1, d.done ? "done" : "pending") }).addTo(markerLayer);
    const contents = document.createElement("div");
    const heading = document.createElement("strong");
    heading.textContent = `${i + 1}. ${d.address}`;
    contents.append(heading);
    if (d.note) {
      const desc = document.createElement("div"); desc.className = "popup-muted"; desc.textContent = d.note; contents.append(desc);
    }
    const desc = document.createElement("div");
    desc.textContent = d.done ? "Afhent" : "Óafhent";
    contents.append(desc);
    marker.bindPopup(contents);
    marker.on("click", () => { selectedId = d.id; renderList(); });
    markerById.set(d.id, marker);
    if (!d.done) routeCoords.push([d.lat, d.lng]);
  });
  if (routeCoords.length >= 2) {
    routeLine = L.polyline(routeCoords, { color: "#ef783c", weight: 4, opacity: .8, dashArray: "8, 9" }).addTo(map);
    routeLine.bringToBack();
  }
}

function fitAll() {
  const points = state.deliveries.map((d) => [d.lat, d.lng]);
  if (state.start) points.push([state.start.lat, state.start.lng]);
  if (!points.length) { map.setView(DEFAULT_VIEW, DEFAULT_ZOOM); return; }
  if (points.length === 1) { map.setView(points[0], 14); return; }
  map.fitBounds(L.latLngBounds(points).pad(.16), { maxZoom: 15, animate: true });
}

function distanceKm(a, b) {
  const R = 6371;
  const toRad = (degrees) => degrees * Math.PI / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const x = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(x)));
}

function sortByNearest() {
  const pending = state.deliveries.filter((d) => !d.done);
  if (pending.length < 2) return;
  const remaining = pending.slice();
  const finished = state.deliveries.filter((d) => d.done);
  let current = state.start || { lat: DEFAULT_VIEW[0], lng: DEFAULT_VIEW[1] };
  const sorted = [];
  while (remaining.length) {
    let nearestIndex = 0;
    for (let i = 1; i < remaining.length; i++) {
      if (distanceKm(current, remaining[i]) < distanceKm(current, remaining[nearestIndex])) nearestIndex = i;
    }
    const [next] = remaining.splice(nearestIndex, 1);
    sorted.push(next);
    current = next;
  }
  state.deliveries = sorted.concat(finished);
  save(); render(); fitAll();
  notify("Óafhentar sendingar raðaðar eftir nálægð (loftlínu), ekki akstursvegalengd.");
}

function addDelivery(address, note, lat, lng) {
  state.deliveries.push({ id: globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random()}`, address, note, lat, lng, done: false });
  save(); render();
  map.flyTo([lat, lng], 14, { duration: .6 });
  notify("Sendingu bætt við listann og kortið.");
}

function geocode(address) {
  // Serialises queries, waits >= 1.1 seconds between public API requests,
  // and caches identical searches in localStorage.
  const key = address.trim().toLowerCase();
  if (geocodeCache[key]) return Promise.resolve(geocodeCache[key]);
  const job = async () => {
    const waitMs = Math.max(0, 1150 - (Date.now() - lastGeocodeTime));
    if (waitMs) await new Promise((resolve) => setTimeout(resolve, waitMs));
    lastGeocodeTime = Date.now();

    // Python server offers /api/geocode; Live Server uses browser fetch directly.
    let response;
    if (location.port === "5000") {
      response = await fetch(`/api/geocode?q=${encodeURIComponent(address)}`);
    } else {
      const query = `${address}, Ísland`;
      const url = new URL(CONFIG.geocodeUrl);
      url.searchParams.set("q", query);
      url.searchParams.set("format", "jsonv2");
      url.searchParams.set("limit", "1");
      url.searchParams.set("countrycodes", "is");
      response = await fetch(url, { headers: { Accept: "application/json" } });
    }
    if (!response.ok) throw new Error("Leitarþjónustan svaraði ekki.");
    const data = await response.json();
    const found = Array.isArray(data) ? data[0] : data;
    if (!found || !Number.isFinite(Number(found.lat)) || !Number.isFinite(Number(found.lon ?? found.lng))) {
      throw new Error("Heimilisfang fannst ekki. Prófaðu götu, húsnúmer og bæjarfélag eða settu pinna á kortið.");
    }
    const result = { lat: Number(found.lat), lng: Number(found.lon ?? found.lng) };
    geocodeCache[key] = result;
    try { localStorage.setItem(GEOCODE_CACHE_KEY, JSON.stringify(geocodeCache)); } catch {}
    return result;
  };
  const next = requestQueue.then(job, job);
  requestQueue = next.catch(() => {});
  return next;
}

function setMode(mode) {
  mapMode = mode;
  $("#startButton").classList.toggle("active", mode === "start");
  $("#pinButton").classList.toggle("active", mode === "pin");
  $("#mapModeBanner").hidden = !mode;
  $("#mapModeBanner").firstChild.textContent = mode === "start"
    ? "Smelltu á kortið til að velja hvar aksturinn hefst. "
    : "Smelltu á kortið til að setja sendingu á staðinn. ";
  map.getContainer().style.cursor = mode ? "crosshair" : "";
}

$("#deliveryForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  const address = $("#addressInput").value.trim();
  const note = $("#noteInput").value.trim();
  if (!address) return;
  const button = $("#addButton");
  button.disabled = true;
  button.textContent = "Leita að heimilisfangi…";
  try {
    const position = await geocode(address);
    addDelivery(address, note, position.lat, position.lng);
    $("#deliveryForm").reset();
  } catch (error) {
    notify(error.message || "Villa við leit að heimilisfangi.", true);
  } finally {
    button.disabled = false;
    button.innerHTML = "<span aria-hidden='true'>+</span> Skrá heimilisfang";
  }
});

$("#sortButton").addEventListener("click", sortByNearest);
$("#hideDelivered").addEventListener("change", renderList);
$("#fitButton").addEventListener("click", fitAll);
$("#startButton").addEventListener("click", () => setMode(mapMode === "start" ? null : "start"));
$("#pinButton").addEventListener("click", () => setMode(mapMode === "pin" ? null : "pin"));
$("#cancelModeButton").addEventListener("click", () => setMode(null));
$("#clearButton").addEventListener("click", () => {
  if (!state.deliveries.length || !confirm("Viltu eyða öllum sendingum af þessum lista?")) return;
  state.deliveries = [];
  selectedId = null;
  save(); render(); notify("Allar sendingar voru fjarlægðar.");
});

map.on("click", (event) => {
  if (mapMode === "start") {
    state.start = { lat: event.latlng.lat, lng: event.latlng.lng };
    save(); render(); setMode(null);
    notify("Upphafsstaður valinn. Nú geturðu raðað sendingunum frá honum.");
  } else if (mapMode === "pin") {
    pendingPin = event.latlng;
    setMode(null);
    $("#pinModal").hidden = false;
    $("#pinLabelInput").focus();
  }
});

$("#pinForm").addEventListener("submit", (event) => {
  event.preventDefault();
  if (!pendingPin) return;
  const label = $("#pinLabelInput").value.trim();
  if (!label) return;
  addDelivery(label, $("#pinNoteInput").value.trim(), pendingPin.lat, pendingPin.lng);
  pendingPin = null;
  $("#pinModal").hidden = true;
  $("#pinForm").reset();
});
$("#pinCancel").addEventListener("click", () => { pendingPin = null; $("#pinModal").hidden = true; });
$("#welcomeAdd").addEventListener("click", () => { $("#welcomeModal").hidden = true; $("#addressInput").focus(); });
$("#welcomeSkip").addEventListener("click", () => { $("#welcomeModal").hidden = true; });

render();
if (!state.deliveries.length) $("#welcomeModal").hidden = false;
else fitAll();
setTimeout(() => map.invalidateSize(), 100);
