<script setup lang="ts">
import { computed, onMounted, ref, watch } from "vue";
import DeckPile from "./components/DeckPile.vue";
type Card = { name: string; quantity: number; image?: string; scryfallId?: string };
type Plan = { id: string; name: string; mainboard: Card[]; sideboard: Card[] };
const URL_KEY = "sideboard-lab-v1";
const deckUrl = ref("");
const deckText = ref("");
const deckName = ref("Untitled deck");
const deckSourceUrl = ref("");
const plans = ref<Plan[]>([]);
const selectedId = ref("base");
const pendingDeletion = ref<Plan | null>(null);
const exportPreview = ref("");
const copiedExport = ref(false);
const importModalOpen = ref(false);
const importPreview = ref("");
const importError = ref("");
const fileInput = ref<HTMLInputElement | null>(null);
const loading = ref(false);
const error = ref("");
const selected = computed(() => plans.value.find((p) => p.id === selectedId.value));
const base = computed(() => plans.value[0]);
const isBase = computed(() => selected.value?.id === "base");
const copy = (cards: Card[]) => cards.map((c) => ({ ...c }));
function cards(raw: unknown): Card[] {
  if (!raw || typeof raw !== "object") return [];
  const list = Array.isArray(raw)
    ? raw.map((x, i) => [String(i), x])
    : Object.entries(raw as Record<string, unknown>);
  const parsed: Array<Card | null> = list.map(([fallback, x]) => {
    const item = x as Record<string, unknown>,
      card = (item.card ?? item) as Record<string, unknown>;
    const name = String(card.name ?? item.name ?? fallback);
    const quantity = Number(item.quantity ?? item.count ?? 1);
    const scryfallId = typeof card.scryfall_id === "string" ? card.scryfall_id : undefined;
    const image =
      typeof card.image_uri === "string"
        ? card.image_uri
        : scryfallId
          ? `https://api.scryfall.com/cards/${scryfallId}?format=image&version=art_crop`
          : undefined;
    return name ? { name, quantity, image, scryfallId } : null;
  });
  return parsed.filter((c): c is Card => c !== null);
}
async function fetchMoxfieldDeck(source: string) {
  const id = source.match(/moxfield\.com\/decks\/([\w-]+)/i)?.[1];
  if (!id) throw new Error("A valid Moxfield deck URL is required.");
  const res = await fetch(`/api/moxfield/decks/all/${id}`);
  if (!res.ok) throw new Error("Moxfield could not find that deck.");
  const data = await res.json(),
    mainboard = cards(data.boards?.mainboard?.cards ?? data.mainboard),
    sideboard = cards(data.boards?.sideboard?.cards ?? data.sideboard);
  if (!mainboard.length) throw new Error("This deck has no main deck to import.");
  return {
    name: data.name || "Imported deck",
    sourceUrl: `https://www.moxfield.com/decks/${id}`,
    plan: { id: "base", name: "Base Decklist", mainboard, sideboard } satisfies Plan,
  };
}
async function importDeck() {
  loading.value = true;
  error.value = "";
  try {
    const imported = await fetchMoxfieldDeck(deckUrl.value);
    deckName.value = imported.name;
    deckSourceUrl.value = imported.sourceUrl;
    plans.value = [imported.plan];
    selectedId.value = "base";
    await loadArt();
  } catch (e) {
    error.value = e instanceof Error ? e.message : "Could not import this deck.";
  } finally {
    loading.value = false;
  }
}
function parseDeckText() {
  const mainboard: Card[] = [],
    sideboard: Card[] = [];
  let inSideboard = false;
  for (const line of deckText.value.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || /^deck$/i.test(trimmed)) continue;
    if (/^sideboard\b/i.test(trimmed)) {
      inSideboard = true;
      continue;
    }
    const match = trimmed.match(/^(\d+)\s*x?\s+(.+?)(?:\s+\([A-Za-z0-9]{2,6}\)\s+\d+)?$/);
    if (!match) continue;
    (inSideboard ? sideboard : mainboard).push({
      quantity: Number(match[1]),
      name: match[2].trim(),
    });
  }
  if (!mainboard.length) {
    error.value =
      "No cards found. Use Moxfield’s Export → Copy for Moxfield, then paste the full list.";
    return;
  }
  deckName.value = "Imported deck";
  deckSourceUrl.value = "";
  plans.value = [{ id: "base", name: "Base Decklist", mainboard, sideboard }];
  selectedId.value = "base";
  error.value = "";
  void loadArt();
}
async function loadArt() {
  const unique = new Set(
    plans.value
      .flatMap((p) => [...p.mainboard, ...p.sideboard])
      .filter((c) => !c.image)
      .map((c) => c.name),
  );
  for (const name of unique) {
    try {
      const r = await fetch(
          `https://api.scryfall.com/cards/named?exact=${encodeURIComponent(name)}`,
        ),
        data = await r.json(),
        image = data.image_uris?.art_crop ?? data.card_faces?.[0]?.image_uris?.art_crop;
      if (image)
        plans.value.forEach((p) =>
          [...p.mainboard, ...p.sideboard]
            .filter((c) => c.name === name)
            .forEach((c) => (c.image = image)),
        );
    } catch {
      /* card remains text-only */
    }
    await new Promise((resolve) => setTimeout(resolve, 75));
  }
}
function addMatchup() {
  if (!base.value) return;
  const name = window.prompt("Matchup name", "");
  if (!name?.trim()) return;
  const id = crypto.randomUUID();
  plans.value.push({
    id,
    name: name.trim(),
    mainboard: copy(base.value.mainboard),
    sideboard: copy(base.value.sideboard),
  });
  selectedId.value = id;
}
function move(card: Card, from: "mainboard" | "sideboard") {
  const plan = selected.value;
  if (!plan || isBase.value) return;
  const origin = plan[from],
    destination = plan[from === "mainboard" ? "sideboard" : "mainboard"],
    source = origin.find((c) => c.name === card.name)!;
  source.quantity--;
  if (!source.quantity) origin.splice(origin.indexOf(source), 1);
  const exists = destination.find((c) => c.name === card.name);
  if (exists) exists.quantity++;
  else destination.push({ ...card, quantity: 1 });
}
function delta(kind: "out" | "in") {
  const original = kind === "out" ? base.value?.mainboard : base.value?.sideboard,
    current = kind === "out" ? selected.value?.mainboard : selected.value?.sideboard;
  return (original ?? [])
    .map((c) => ({
      name: c.name,
      quantity: c.quantity - (current?.find((x) => x.name === c.name)?.quantity ?? 0),
    }))
    .filter((c) => c.quantity > 0);
}
function reset() {
  if (selected.value && base.value && !isBase.value) {
    selected.value.mainboard = copy(base.value.mainboard);
    selected.value.sideboard = copy(base.value.sideboard);
  }
}
function deleteMatchup() {
  const plan = pendingDeletion.value;
  if (!plan || plan.id === "base") return;
  plans.value = plans.value.filter((item) => item.id !== plan.id);
  if (selectedId.value === plan.id) selectedId.value = "base";
  pendingDeletion.value = null;
}
function yamlCards(cards: Card[]) {
  return cards
    .map(
      (card) =>
        `    - ${JSON.stringify(`${card.quantity} ${card.name}`)}${card.scryfallId ? ` # scryfall: ${card.scryfallId}` : ""}`,
    )
    .join("\n");
}
function exportFilename() {
  return `${
    deckName.value
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "") || "sideboard-plan"
  }.md`;
}
function openExportPreview() {
  if (!base.value) return;
  const sections = plans.value.slice(1).map((plan) => {
    const out = changesFor(plan, "out").map((card) => `-${card.quantity} ${card.name}`);
    const incoming = changesFor(plan, "in").map((card) => `+${card.quantity} ${card.name}`);
    return `### ${plan.name}\n\n${[...out, ...incoming].join("\n") || "No swaps."}`;
  });
  const source = deckSourceUrl.value ? `source: ${JSON.stringify(deckSourceUrl.value)}\n` : "";
  exportPreview.value = `---\ntitle: ${JSON.stringify(deckName.value)}\n${source}---\n\n## Sideboarding\n${sections.length ? `\n${sections.join("\n\n")}` : ""}\n`;
  copiedExport.value = false;
}
function saveExport() {
  const blob = new Blob([exportPreview.value], { type: "text/markdown" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = exportFilename();
  link.click();
  URL.revokeObjectURL(link.href);
}
async function copyExport() {
  await navigator.clipboard.writeText(exportPreview.value);
  copiedExport.value = true;
}
function readDeckLine(line: string): Card | null {
  const value = line.replace(/^\s*-\s*/, "").trim();
  const scryfallId = /\s+#\s*scryfall:\s*([A-Za-z0-9-]+)/i.exec(value)?.[1];
  const deckLine = value.replace(/\s+#\s*scryfall:\s*[A-Za-z0-9-]+\s*$/i, "");
  let decoded = deckLine;
  try {
    decoded = JSON.parse(deckLine);
  } catch {
    /* accept unquoted readable lines */
  }
  const match = /^(\d+)\s+(.+)$/.exec(decoded);
  return match
    ? {
        quantity: Number(match[1]),
        name: match[2],
        scryfallId,
        image: scryfallId
          ? `https://api.scryfall.com/cards/${scryfallId}?format=image&version=art_crop`
          : undefined,
      }
    : null;
}
function changesFor(plan: Plan, kind: "out" | "in") {
  const original = kind === "out" ? base.value?.mainboard : base.value?.sideboard,
    current = kind === "out" ? plan.mainboard : plan.sideboard;
  return (original ?? [])
    .map((c) => ({
      name: c.name,
      quantity: c.quantity - (current.find((x) => x.name === c.name)?.quantity ?? 0),
    }))
    .filter((c) => c.quantity > 0);
}
async function importMarkdown(markdown: string) {
  const frontmatter = /^---\s*\n([\s\S]*?)\n---/.exec(markdown)?.[1];
  if (!frontmatter) throw new Error("This file needs YAML frontmatter.");
  let sourceUrl = "";
  for (const line of frontmatter.split(/\r?\n/)) {
    const sourceMatch = /^source:\s*(.+)$/.exec(line);
    if (sourceMatch) {
      try {
        sourceUrl = JSON.parse(sourceMatch[1]);
      } catch {
        sourceUrl = sourceMatch[1].trim();
      }
    }
  }
  const imported = sourceUrl
    ? await fetchMoxfieldDeck(sourceUrl)
    : base.value
      ? { name: deckName.value, sourceUrl: deckSourceUrl.value, plan: copyPlan(base.value) }
      : (() => {
          throw new Error("Load a deck first, or import Markdown with a Moxfield source URL.");
        })();
  const importedPlans: Plan[] = [imported.plan];
  const matchupPattern = /^###\s+(.+?)\s*$([\s\S]*?)(?=^###\s+|(?![\s\S]))/gm;
  for (const match of markdown.matchAll(matchupPattern)) {
    const plan: Plan = {
      id: crypto.randomUUID(),
      name: match[1].trim(),
      mainboard: copy(imported.plan.mainboard),
      sideboard: copy(imported.plan.sideboard),
    };
    for (const line of match[2].split(/\r?\n/)) {
      const swap = /^([+-])(\d+)\s+(.+?)\s*$/.exec(line);
      if (!swap) continue;
      const from = swap[1] === "-" ? "mainboard" : "sideboard",
        to = from === "mainboard" ? "sideboard" : "mainboard";
      for (let count = 0; count < Number(swap[2]); count++) {
        const source = plan[from].find((card) => card.name === swap[3]);
        if (!source) break;
        source.quantity--;
        if (!source.quantity) plan[from].splice(plan[from].indexOf(source), 1);
        const target = plan[to].find((card) => card.name === swap[3]);
        if (target) target.quantity++;
        else plan[to].push({ ...source, quantity: 1 });
      }
    }
    importedPlans.push(plan);
  }
  plans.value = importedPlans;
  deckName.value = imported.name;
  deckSourceUrl.value = imported.sourceUrl;
  selectedId.value = "base";
  error.value = "";
  await loadArt();
}
function copyPlan(plan: Plan): Plan {
  return {
    ...plan,
    mainboard: copy(plan.mainboard),
    sideboard: copy(plan.sideboard),
  };
}
function openImportModal() {
  importModalOpen.value = true;
  importPreview.value = "";
  importError.value = "";
}
async function loadMarkdownFile(event: Event) {
  const file = (event.target as HTMLInputElement).files?.[0];
  if (!file) return;
  try {
    importPreview.value = await file.text();
    importError.value = "";
  } catch (cause) {
    importError.value =
      cause instanceof Error ? cause.message : "Could not read that Markdown file.";
  } finally {
    (event.target as HTMLInputElement).value = "";
  }
}
async function applyMarkdownImport() {
  if (!importPreview.value.trim()) {
    importError.value = "Paste Markdown or choose a file first.";
    return;
  }
  loading.value = true;
  try {
    await importMarkdown(importPreview.value);
    importPreview.value = "";
    importError.value = "";
    importModalOpen.value = false;
  } catch (cause) {
    importError.value =
      cause instanceof Error ? cause.message : "Could not import that Markdown file.";
  } finally {
    loading.value = false;
  }
}
const total = (pile?: Card[]) => pile?.reduce((sum, c) => sum + c.quantity, 0) ?? 0;
onMounted(() => {
  try {
    const saved = JSON.parse(localStorage.getItem(URL_KEY) || "{}");
    if (saved.plans?.length) {
      plans.value = saved.plans;
      deckName.value = saved.deckName || deckName.value;
      deckSourceUrl.value = saved.deckSourceUrl || "";
      selectedId.value = saved.selectedId || "base";
    }
  } catch {
    /* ignore stale storage */
  }
});
watch(
  [plans, deckName, deckSourceUrl, selectedId],
  () =>
    localStorage.setItem(
      URL_KEY,
      JSON.stringify({
        plans: plans.value,
        deckName: deckName.value,
        deckSourceUrl: deckSourceUrl.value,
        selectedId: selectedId.value,
      }),
    ),
  { deep: true },
);
</script>

<template>
  <main>
    <aside>
      <div class="brand">
        <b>S</b><span><strong>Sideboard Lab</strong><small>MTG matchup planner</small></span>
      </div>
      <div class="import">
        <label>Moxfield deck URL</label>
        <div>
          <input
            v-model="deckUrl"
            @keyup.enter="importDeck"
            placeholder="moxfield.com/decks/..."
          /><button @click="importDeck" :disabled="loading">
            {{ loading ? "..." : "Import" }}
          </button>
        </div>
        <p v-if="error">{{ error }}</p>
        <details>
          <summary>Paste decklist instead</summary>
          <textarea
            v-model="deckText"
            placeholder="4 Lightning Bolt&#10;...&#10;Sideboard&#10;2 Red Elemental Blast"
          ></textarea
          ><button class="text-import" @click="parseDeckText">Import pasted list</button>
        </details>
      </div>
      <label class="plans-label">MATCH PLANS</label>
      <nav>
        <div
          v-for="plan in plans"
          :key="plan.id"
          class="match-row"
          :class="{ active: plan.id === selectedId }"
        >
          <button class="match-select" @click="selectedId = plan.id"><i></i>{{ plan.name }}</button
          ><button
            v-if="plan.id !== 'base'"
            class="delete-match"
            :aria-label="`Delete ${plan.name}`"
            @click="pendingDeletion = plan"
          >
            ×
          </button>
        </div>
        <button class="add" :disabled="!base" @click="addMatchup">＋ Add Matchup</button>
      </nav>
      <div class="sidebar-tools">
        <small class="count">{{
          base
            ? `${total(base.mainboard)} main · ${total(base.sideboard)} sideboard`
            : "Import a 60/15 deck to begin"
        }}</small>
        <div>
          <input
            ref="fileInput"
            class="file-input"
            type="file"
            accept=".md,text/markdown"
            @change="loadMarkdownFile"
          /><button class="tool-button" @click="openImportModal">Import</button
          ><button class="tool-button" :disabled="!base" @click="openExportPreview">Export</button>
        </div>
      </div>
    </aside>
    <section class="workspace">
      <div class="deck-bar">
        <span>DECK</span
        ><button class="deck-link" :disabled="!selected || isBase" @click="selectedId = 'base'">
          {{ selected ? deckName : "No deck loaded" }}</button
        ><template v-if="selected && !isBase"
          ><span class="versus">VS</span><strong class="matchup-crumb">{{ selected.name }}</strong
          ><button class="header-reset" @click="reset">Reset plan</button></template
        >
      </div>
      <div class="workspace-content">
        <div v-if="!selected" class="empty">
          <label>SIDEBOARD LAB</label>
          <h1>Plan every post-board game.</h1>
          <p>
            Import a Moxfield deck with a 60-card main deck and 15-card sideboard to map your
            matchup plans.
          </p>
        </div>
        <template v-else
          ><div v-if="isBase" class="hint">
            Create a matchup plan to start moving cards between your main deck and sideboard.
          </div>
          <DeckPile
            title="Main Deck"
            :cards="selected.mainboard"
            :total="total(selected.mainboard)"
            :disabled="isBase"
            :moved-names="isBase ? [] : (base?.sideboard.map((card) => card.name) ?? [])"
            moved-class="brought-in"
            @move="move($event, 'mainboard')"
          /><DeckPile
            title="Sideboard"
            class="side"
            :cards="selected.sideboard"
            :total="total(selected.sideboard)"
            :disabled="isBase"
            :moved-names="isBase ? [] : (base?.mainboard.map((card) => card.name) ?? [])"
            moved-class="moved-out"
            @move="move($event, 'sideboard')"
          />
          <footer v-if="!isBase">
            <div>
              <label>SIDEBOARD GUIDE</label>
              <h2>{{ selected.name }}</h2>
            </div>
            <div class="changes">
              <div class="removals">
                <p v-for="c in delta('out')" :key="`o${c.name}`" class="out">
                  −{{ c.quantity }} {{ c.name }}
                </p>
              </div>
              <div class="additions">
                <p v-for="c in delta('in')" :key="`i${c.name}`" class="in">
                  +{{ c.quantity }} {{ c.name }}
                </p>
              </div>
              <p v-if="!delta('out').length && !delta('in').length" class="muted">
                No swaps yet — click cards to build your plan.
              </p>
            </div>
          </footer></template
        >
      </div>
    </section>
  </main>
  <div v-if="pendingDeletion" class="modal-backdrop" @click.self="pendingDeletion = null">
    <section class="modal" role="dialog" aria-modal="true" aria-labelledby="delete-title">
      <p class="eyebrow">DELETE MATCHUP</p>
      <h2 id="delete-title">Remove {{ pendingDeletion.name }}?</h2>
      <p>This deletes its sideboard plan permanently. This action can’t be undone.</p>
      <div class="modal-actions">
        <button class="cancel" @click="pendingDeletion = null">Cancel</button
        ><button class="confirm-delete" @click="deleteMatchup">Delete matchup</button>
      </div>
    </section>
  </div>
  <div v-if="exportPreview" class="modal-backdrop" @click.self="exportPreview = ''">
    <section
      class="modal export-modal"
      role="dialog"
      aria-modal="true"
      aria-labelledby="export-title"
    >
      <p class="eyebrow">MARKDOWN EXPORT</p>
      <pre id="export-title" class="export-preview" aria-label="Markdown export preview">{{
        exportPreview
      }}</pre>
      <div class="modal-actions">
        <button class="cancel" @click="exportPreview = ''">Close</button>
        <button class="copy-export" @click="copyExport">
          {{ copiedExport ? "Copied" : "Copy" }}
        </button>
        <button class="confirm-delete" @click="saveExport">Save file</button>
      </div>
    </section>
  </div>
  <div v-if="importModalOpen" class="modal-backdrop" @click.self="importModalOpen = false">
    <section
      class="modal import-modal"
      role="dialog"
      aria-modal="true"
      aria-labelledby="import-title"
    >
      <p id="import-title" class="eyebrow">MARKDOWN IMPORT</p>
      <textarea
        v-model="importPreview"
        class="import-preview"
        aria-label="Markdown import content"
        placeholder="Paste your sideboard Markdown here, or upload a .md file."
      ></textarea>
      <p v-if="importError" class="import-error">{{ importError }}</p>
      <div class="modal-actions">
        <button class="cancel" @click="importModalOpen = false">Close</button>
        <button class="copy-export" @click="fileInput?.click()">Upload file</button>
        <button class="confirm-delete" :disabled="loading" @click="applyMarkdownImport">
          {{ loading ? "Importing…" : "Import" }}
        </button>
      </div>
    </section>
  </div>
</template>
