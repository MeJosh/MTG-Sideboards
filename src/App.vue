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
  const value = source.trim();
  const id = /^[\w-]+$/.test(value) ? value : value.match(/moxfield\.com\/decks\/([\w-]+)/i)?.[1];
  if (!id) throw new Error("A valid Moxfield deck URL or deck ID is required.");
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
  await importMoxfieldDeck(deckUrl.value);
}
async function importMoxfieldDeck(source: string) {
  loading.value = true;
  error.value = "";
  try {
    const imported = await fetchMoxfieldDeck(source);
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

  const url = new URL(window.location.href);
  const sharedDeckUrl = url.searchParams.get("moxfield");
  if (!sharedDeckUrl) return;

  url.searchParams.delete("moxfield");
  window.history.replaceState(window.history.state, "", `${url.pathname}${url.search}${url.hash}`);
  deckUrl.value = sharedDeckUrl;
  void importMoxfieldDeck(sharedDeckUrl);
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
  <main
    class="grid min-h-screen grid-cols-1 bg-[#151719] md:h-screen md:min-h-0 md:grid-cols-[276px_1fr] md:overflow-hidden"
  >
    <aside
      class="flex flex-col border-b border-[#292c2e] bg-[#0e1012] p-5 md:h-screen md:min-h-0 md:overflow-y-auto md:border-r md:border-b-0 md:px-5 md:pt-[29px] md:pb-5"
    >
      <div class="flex items-center gap-2.5 px-2 pb-[18px] md:pb-[29px]">
        <b
          class="grid size-[30px] place-items-center rounded-lg bg-[#d26a3b] font-display text-[20px] font-bold text-[#1c120e]"
          >S</b
        ><span
          ><strong class="block text-[15px]">Sideboard Lab</strong
          ><small class="block text-[11px] text-[#868a85]">MTG matchup planner</small></span
        >
      </div>
      <div class="border-y border-[#292c2e] py-[17px]">
        <label class="font-mono text-[10px] font-medium tracking-[.1em] text-[#8d918b]"
          >Moxfield deck URL</label
        >
        <div class="mt-2 flex">
          <input
            class="min-w-0 w-full rounded-l-md border border-r-0 border-[#303438] bg-[#1b1e20] px-2 py-[9px] text-[11px] text-[#eee] outline-none focus:border-[#d26a3b]"
            v-model="deckUrl"
            @keyup.enter="importDeck"
            placeholder="moxfield.com/decks/..."
          /><button
            class="cursor-pointer rounded-r-md bg-[#d26a3b] px-[9px] text-[11px] font-bold disabled:cursor-default"
            @click="importDeck"
            :disabled="loading"
          >
            {{ loading ? "..." : "Import" }}
          </button>
        </div>
        <p v-if="error" class="mt-[9px] mx-0.5 text-[11px] text-[#ef8b71]">{{ error }}</p>
        <details class="mt-[11px] text-[11px] text-[#a9ada7]">
          <summary class="cursor-pointer text-[#d98a66]">Paste decklist instead</summary>
          <textarea
            class="mt-2 block min-h-[100px] w-full resize-y rounded-md border border-[#303438] bg-[#1b1e20] p-2 font-mono text-[10px] text-[#eee]"
            v-model="deckText"
            placeholder="4 Lightning Bolt&#10;...&#10;Sideboard&#10;2 Red Elemental Blast"
          ></textarea
          ><button
            class="mt-[7px] cursor-pointer rounded-[5px] bg-[#34383a] px-[9px] py-[7px] text-[11px] text-[#ddd]"
            @click="parseDeckText"
          >
            Import pasted list
          </button>
        </details>
      </div>
      <label
        class="px-2 pt-[23px] pb-[9px] font-mono text-[10px] font-medium tracking-[.1em] text-[#8d918b]"
        >MATCH PLANS</label
      >
      <nav class="grid gap-[3px]">
        <div
          v-for="plan in plans"
          :key="plan.id"
          :class="[
            'group flex items-center rounded-md',
            { 'bg-[#282b2d]': plan.id === selectedId },
          ]"
        >
          <button
            :class="[
              'min-w-0 flex-1 cursor-pointer rounded-md bg-transparent px-[9px] py-[10px] text-left text-[13px] text-[#c0c3bc] hover:bg-[#1b1e20]',
              {
                '!bg-transparent font-semibold text-white hover:bg-transparent':
                  plan.id === selectedId,
              },
            ]"
            @click="selectedId = plan.id"
          >
            <i
              :class="[
                'mr-[9px] mb-px inline-block size-1.5 rounded-full bg-[#686d68]',
                { 'bg-[#d26a3b]': plan.id === selectedId },
              ]"
            ></i
            >{{ plan.name }}</button
          ><button
            v-if="plan.id !== 'base'"
            :class="[
              plan.id === selectedId ? 'block' : 'hidden group-hover:block',
              'w-7 cursor-pointer bg-transparent px-[6px] py-[7px] text-center text-[18px] leading-none text-[#aeb1ab] hover:text-[#f2906d]',
            ]"
            :aria-label="`Delete ${plan.name}`"
            @click="pendingDeletion = plan"
          >
            ×
          </button>
        </div>
        <button
          class="mt-[3px] w-full cursor-pointer rounded-md bg-transparent px-[9px] py-[10px] text-left text-[13px] text-[#d8845f] hover:bg-[#1b1e20]"
          :disabled="!base"
          @click="addMatchup"
        >
          ＋ Add Matchup
        </button>
      </nav>
      <div class="mt-auto border-t border-[#292c2e] px-2 pt-[15px]">
        <small class="mb-[10px] block p-0 font-mono text-[10px] text-[#747872] max-md:hidden">{{
          base
            ? `${total(base.mainboard)} main · ${total(base.sideboard)} sideboard`
            : "Import a 60/15 deck to begin"
        }}</small>
        <div class="grid grid-cols-2 gap-1.5">
          <input
            ref="fileInput"
            class="hidden"
            type="file"
            accept=".md,text/markdown"
            @change="loadMarkdownFile"
          /><button
            class="cursor-pointer rounded-[5px] border border-[#454946] bg-transparent p-[7px] text-[11px] text-[#c6c9c3] hover:border-[#d26a3b] hover:text-[#eea17c] disabled:cursor-default disabled:opacity-45"
            @click="openImportModal"
          >
            Import</button
          ><button
            class="cursor-pointer rounded-[5px] border border-[#454946] bg-transparent p-[7px] text-[11px] text-[#c6c9c3] hover:border-[#d26a3b] hover:text-[#eea17c] disabled:cursor-default disabled:opacity-45"
            :disabled="!base"
            @click="openExportPreview"
          >
            Export
          </button>
        </div>
      </div>
    </aside>
    <section class="w-full max-w-[1380px] md:h-screen md:overflow-y-auto">
      <div
        class="sticky top-0 z-5 flex min-h-[53px] items-center gap-[11px] border-b border-[#303335] bg-[#151719ef] px-5 backdrop-blur-[10px] md:fixed md:left-[276px] md:right-0 md:px-[clamp(24px,5vw,72px)]"
      >
        <span class="font-mono text-[10px] font-medium tracking-[.11em] text-[#c97147]">DECK</span
        ><button
          class="cursor-pointer overflow-hidden border-0 bg-transparent p-0 text-ellipsis whitespace-nowrap text-[13px] font-bold text-[#e9e8e1] hover:enabled:text-[#f0a17b] hover:enabled:underline hover:enabled:underline-offset-[3px] disabled:cursor-default"
          :disabled="!selected || isBase"
          @click="selectedId = 'base'"
        >
          {{ selected ? deckName : "No deck loaded" }}</button
        ><template v-if="selected && !isBase"
          ><span class="font-mono text-[10px] font-medium tracking-[.11em] text-[#75a7bd]">VS</span
          ><strong
            class="overflow-hidden text-ellipsis whitespace-nowrap text-[13px] text-[#d8e5e9]"
            >{{ selected.name }}</strong
          ></template
        >
      </div>
      <div class="px-5 pt-[35px] pb-[50px] md:px-[clamp(24px,5vw,72px)] md:pt-[91px] md:pb-[70px]">
        <div v-if="!selected" class="mx-auto my-[17vh] max-w-[570px] text-center">
          <label class="font-mono text-[10px] font-medium tracking-[.1em] text-[#8d918b]"
            >SIDEBOARD LAB</label
          >
          <h1 class="my-2 font-display text-[46px] font-semibold tracking-[-.04em]">
            Plan every post-board game.
          </h1>
          <p class="mt-0 leading-[1.6] text-[#a0a49e]">
            Import a Moxfield deck with a 60-card main deck and 15-card sideboard to map your
            matchup plans.
          </p>
        </div>
        <template v-else
          ><div
            v-if="isBase"
            class="mb-[31px] -mt-3 border-l-2 border-[#d26a3b] bg-[#1d211f] px-[13px] py-[11px] text-[12px] text-[#aaada8]"
          >
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
            class="mt-[46px]"
            :cards="selected.sideboard"
            :total="total(selected.sideboard)"
            :disabled="isBase"
            :moved-names="isBase ? [] : (base?.mainboard.map((card) => card.name) ?? [])"
            moved-class="moved-out"
            @move="move($event, 'sideboard')"
          />
          <footer
            v-if="!isBase"
            class="mt-[60px] grid gap-[14px] rounded-lg border border-[#383b3a] bg-[#1a1d1e] px-6 py-[22px] md:grid-cols-[180px_1fr] md:gap-[25px]"
          >
            <div>
              <label class="font-mono text-[10px] font-medium tracking-[.1em] text-[#8d918b]"
                >SIDEBOARD GUIDE</label
              >
              <h2 class="m-0 font-display text-[19px] font-semibold">{{ selected.name }}</h2>
            </div>
            <div class="grid grid-cols-2 gap-[18px]">
              <div class="min-w-0">
                <p
                  v-for="c in delta('out')"
                  :key="`o${c.name}`"
                  class="my-[3px] font-mono text-[13px] text-[#e9ad94]"
                >
                  −{{ c.quantity }} {{ c.name }}
                </p>
              </div>
              <div class="min-w-0">
                <p
                  v-for="c in delta('in')"
                  :key="`i${c.name}`"
                  class="my-[3px] font-mono text-[13px] text-[#a6cf9f]"
                >
                  +{{ c.quantity }} {{ c.name }}
                </p>
              </div>
              <p
                v-if="!delta('out').length && !delta('in').length"
                class="col-span-full my-[3px] font-mono text-[13px] text-[#858984]"
              >
                No swaps yet — click cards to build your plan.
              </p>
            </div>
          </footer></template
        >
      </div>
    </section>
  </main>
  <div
    v-if="pendingDeletion"
    class="fixed inset-0 z-20 grid place-items-center bg-[#040505bd] p-5 backdrop-blur-[3px]"
    @click.self="pendingDeletion = null"
  >
    <section
      class="w-full max-w-[390px] rounded-[9px] border border-[#4a4d4b] bg-[#202325] p-[25px] shadow-[0_18px_55px_#0008]"
      role="dialog"
      aria-modal="true"
      aria-labelledby="delete-title"
    >
      <p class="font-mono text-[10px] font-medium tracking-[.1em] text-[#8d918b]">DELETE MATCHUP</p>
      <h2 id="delete-title" class="mb-[10px] mt-0 font-display text-[25px] font-semibold">
        Remove {{ pendingDeletion.name }}?
      </h2>
      <p class="m-0 text-[13px] leading-[1.55] text-[#b7bbb4]">
        This deletes its sideboard plan permanently. This action can’t be undone.
      </p>
      <div class="mt-6 flex justify-end gap-[9px]">
        <button
          class="cursor-pointer rounded-md border border-[#4a4d4b] bg-transparent px-3 py-[9px] text-[12px] text-[#d1d3ce]"
          @click="pendingDeletion = null"
        >
          Cancel</button
        ><button
          class="cursor-pointer rounded-md border border-[#e07152] bg-[#c9583b] px-3 py-[9px] text-[12px] font-bold text-white"
          @click="deleteMatchup"
        >
          Delete matchup
        </button>
      </div>
    </section>
  </div>
  <div
    v-if="exportPreview"
    class="fixed inset-0 z-20 grid place-items-center bg-[#040505bd] p-5 backdrop-blur-[3px]"
    @click.self="exportPreview = ''"
  >
    <section
      class="max-h-[90vh] w-[min(94vw,1200px)] rounded-[9px] border border-[#4a4d4b] bg-[#202325] p-[25px] shadow-[0_18px_55px_#0008]"
      role="dialog"
      aria-modal="true"
      aria-labelledby="export-title"
    >
      <p class="font-mono text-[10px] font-medium tracking-[.1em] text-[#8d918b]">
        MARKDOWN EXPORT
      </p>
      <pre
        id="export-title"
        class="mt-4 block max-h-[min(72vh,820px)] w-full overflow-auto rounded-md border border-[#3b3f3d] bg-[#111315] p-[13px] font-mono text-[12px] leading-[1.55] text-[#d9dbd5] whitespace-pre"
        aria-label="Markdown export preview"
        >{{ exportPreview }}</pre>
      <div class="mt-6 flex justify-end gap-[9px]">
        <button
          class="cursor-pointer rounded-md border border-[#4a4d4b] bg-transparent px-3 py-[9px] text-[12px] text-[#d1d3ce]"
          @click="exportPreview = ''"
        >
          Close
        </button>
        <button
          class="cursor-pointer rounded-md border border-[#527b92] bg-[#243943] px-3 py-[9px] text-[12px] font-bold text-[#d7edf5]"
          @click="copyExport"
        >
          {{ copiedExport ? "Copied" : "Copy" }}
        </button>
        <button
          class="cursor-pointer rounded-md border border-[#e07152] bg-[#c9583b] px-3 py-[9px] text-[12px] font-bold text-white"
          @click="saveExport"
        >
          Save file
        </button>
      </div>
    </section>
  </div>
  <div
    v-if="importModalOpen"
    class="fixed inset-0 z-20 grid place-items-center bg-[#040505bd] p-5 backdrop-blur-[3px]"
    @click.self="importModalOpen = false"
  >
    <section
      class="w-[min(94vw,1000px)] rounded-[9px] border border-[#4a4d4b] bg-[#202325] p-[25px] shadow-[0_18px_55px_#0008]"
      role="dialog"
      aria-modal="true"
      aria-labelledby="import-title"
    >
      <p id="import-title" class="font-mono text-[10px] font-medium tracking-[.1em] text-[#8d918b]">
        MARKDOWN IMPORT
      </p>
      <textarea
        v-model="importPreview"
        class="mt-4 block h-[min(58vh,650px)] w-full resize-none rounded-md border border-[#3b3f3d] bg-[#111315] p-[13px] font-mono text-[12px] leading-[1.55] text-[#d9dbd5]"
        aria-label="Markdown import content"
        placeholder="Paste your sideboard Markdown here, or upload a .md file."
      ></textarea>
      <p v-if="importError" class="mb-0 mt-[10px] text-[13px] leading-[1.55] text-[#ed9073]">
        {{ importError }}
      </p>
      <div class="mt-6 flex justify-end gap-[9px]">
        <button
          class="cursor-pointer rounded-md border border-[#4a4d4b] bg-transparent px-3 py-[9px] text-[12px] text-[#d1d3ce]"
          @click="importModalOpen = false"
        >
          Close
        </button>
        <button
          class="cursor-pointer rounded-md border border-[#527b92] bg-[#243943] px-3 py-[9px] text-[12px] font-bold text-[#d7edf5]"
          @click="fileInput?.click()"
        >
          Upload file
        </button>
        <button
          class="cursor-pointer rounded-md border border-[#e07152] bg-[#c9583b] px-3 py-[9px] text-[12px] font-bold text-white disabled:opacity-50"
          :disabled="loading"
          @click="applyMarkdownImport"
        >
          {{ loading ? "Importing…" : "Import" }}
        </button>
      </div>
    </section>
  </div>
</template>
