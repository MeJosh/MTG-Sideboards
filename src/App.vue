<script setup lang="ts">
import { onMounted, ref } from "vue";
import DeckBreadcrumb from "./components/DeckBreadcrumb.vue";
import DeckPile from "./components/DeckPile.vue";
import DeckSidebar from "./components/DeckSidebar.vue";
import PlannerModals from "./components/PlannerModals.vue";
import SideboardGuide from "./components/SideboardGuide.vue";
import { useDeckImport } from "./composables/useDeckImport";
import { useMarkdownPlans } from "./composables/useMarkdownPlans";
import { useSideboardPlanner } from "./composables/useSideboardPlanner";
import { cardIdentity, type Plan } from "./types";

const deckUrl = ref("");
const deckText = ref("");
const pendingDeletion = ref<Plan | null>(null);
const exportPreview = ref("");
const copiedExport = ref(false);
const importModalOpen = ref(false);
const importPreview = ref("");
const importError = ref("");
const loading = ref(false);
const error = ref("");

const planner = useSideboardPlanner();
const {
  deckName,
  deckSourceUrl,
  plans,
  selectedId,
  selected,
  base,
  isBase,
  total,
  setDeck,
  addMatchup: createMatchup,
  move,
  changesFor,
  deleteMatchup: removeMatchup,
  restore,
  copyCards,
} = planner;
const { fetchMoxfieldDeck, parseDeckText: parseDecklist, loadArt } = useDeckImport(plans);
const markdown = useMarkdownPlans(fetchMoxfieldDeck, copyCards);

async function importMoxfieldDeck(source: string) {
  loading.value = true;
  error.value = "";
  try {
    const imported = await fetchMoxfieldDeck(source);
    setDeck(imported.name, imported.sourceUrl, imported.plan);
    await loadArt();
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : "Could not import this deck.";
  } finally {
    loading.value = false;
  }
}

function importDeck() {
  return importMoxfieldDeck(deckUrl.value);
}

function parseDeckText() {
  try {
    setDeck("Imported deck", "", parseDecklist(deckText.value));
    error.value = "";
    void loadArt();
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : "Could not import that decklist.";
  }
}

function addMatchup() {
  const name = window.prompt("Matchup name", "");
  if (name) createMatchup(name);
}

function delta(kind: "out" | "in") {
  return selected.value ? changesFor(selected.value, kind) : [];
}

function deleteMatchup() {
  removeMatchup(pendingDeletion.value);
  pendingDeletion.value = null;
}

function openExportPreview() {
  if (!base.value) return;
  exportPreview.value = markdown.createExport(
    deckName.value,
    deckSourceUrl.value,
    plans.value,
    changesFor,
  );
  copiedExport.value = false;
}

function saveExport() {
  markdown.save(markdown.exportFilename(deckName.value), exportPreview.value);
}

async function copyExport() {
  await navigator.clipboard.writeText(exportPreview.value);
  copiedExport.value = true;
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
    const imported = await markdown.importMarkdown(
      importPreview.value,
      base.value,
      deckName.value,
      deckSourceUrl.value,
    );
    deckName.value = imported.name;
    deckSourceUrl.value = imported.sourceUrl;
    plans.value = imported.plans;
    selectedId.value = "base";
    importModalOpen.value = false;
    importPreview.value = "";
    importError.value = "";
    await loadArt();
  } catch (cause) {
    importError.value =
      cause instanceof Error ? cause.message : "Could not import that Markdown file.";
  } finally {
    loading.value = false;
  }
}

onMounted(() => {
  restore();
  const url = new URL(window.location.href);
  const sharedDeckUrl = url.searchParams.get("moxfield");
  if (!sharedDeckUrl) return;
  url.searchParams.delete("moxfield");
  window.history.replaceState(window.history.state, "", `${url.pathname}${url.search}${url.hash}`);
  deckUrl.value = sharedDeckUrl;
  void importMoxfieldDeck(sharedDeckUrl);
});
</script>

<template>
  <main
    class="grid min-h-screen grid-cols-1 bg-[#151719] md:h-screen md:min-h-0 md:grid-cols-[276px_1fr] md:overflow-hidden"
  >
    <DeckSidebar
      v-model:deck-url="deckUrl"
      v-model:deck-text="deckText"
      v-model:selected-id="selectedId"
      :loading="loading"
      :error="error"
      :plans="plans"
      :deck-count="
        base
          ? `${total(base.mainboard)} main · ${total(base.sideboard)} sideboard`
          : 'Import a 60/15 deck to begin'
      "
      :has-base="Boolean(base)"
      @import-deck="importDeck"
      @import-text="parseDeckText"
      @add-matchup="addMatchup"
      @delete-matchup="pendingDeletion = $event"
      @open-import="openImportModal"
      @open-export="openExportPreview"
    />
    <section class="w-full max-w-[1380px] md:h-screen md:overflow-y-auto">
      <DeckBreadcrumb
        :deck-name="deckName"
        :has-selection="Boolean(selected)"
        :is-base="isBase"
        :matchup-name="selected && !isBase ? selected.name : undefined"
        @select-base="selectedId = 'base'"
      />
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
        <template v-else>
          <div
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
            :moved-keys="isBase ? [] : (base?.sideboard.map(cardIdentity) ?? [])"
            moved-class="brought-in"
            @move="move($event, 'mainboard')"
          />
          <DeckPile
            title="Sideboard"
            class="mt-[46px]"
            :cards="selected.sideboard"
            :total="total(selected.sideboard)"
            :disabled="isBase"
            :moved-keys="isBase ? [] : (base?.mainboard.map(cardIdentity) ?? [])"
            moved-class="moved-out"
            @move="move($event, 'sideboard')"
          />
          <SideboardGuide
            v-if="!isBase"
            :title="selected.name"
            :removals="delta('out')"
            :additions="delta('in')"
          />
        </template>
      </div>
    </section>
  </main>
  <PlannerModals
    :pending-deletion="pendingDeletion"
    :export-preview="exportPreview"
    :copied-export="copiedExport"
    :import-open="importModalOpen"
    :import-preview="importPreview"
    :import-error="importError"
    :loading="loading"
    @close-delete="pendingDeletion = null"
    @confirm-delete="deleteMatchup"
    @close-export="exportPreview = ''"
    @copy-export="copyExport"
    @save-export="saveExport"
    @close-import="importModalOpen = false"
    @update:import-preview="importPreview = $event"
    @file-changed="loadMarkdownFile"
    @apply-import="applyMarkdownImport"
  />
</template>
