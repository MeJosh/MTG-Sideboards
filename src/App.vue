<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";
import DeckBreadcrumb from "./components/DeckBreadcrumb.vue";
import DeckPile from "./components/DeckPile.vue";
import DeckSidebar from "./components/DeckSidebar.vue";
import PlannerModals from "./components/PlannerModals.vue";
import SideboardGuide from "./components/SideboardGuide.vue";
import { useDeckImport } from "./composables/useDeckImport";
import { useMarkdownPlans } from "./composables/useMarkdownPlans";
import { useSharePlans } from "./composables/useSharePlans";
import { useSideboardPlanner } from "./composables/useSideboardPlanner";
import { cardIdentity, type Plan } from "./types";

const deckUrl = ref("");
const deckText = ref("");
const pendingDeletion = ref<Plan | null>(null);
const exportPreview = ref("");
const copiedExport = ref(false);
const shareUrl = ref("");
const copiedShare = ref(false);
const shareError = ref("");
const importModalOpen = ref(false);
const importPreview = ref("");
const importError = ref("");
const moxfieldFallbackOpen = ref(false);
const loading = ref(false);
const error = ref("");
const GREG_MODE_KEY = "sideboard-lab-greg-mode-v1";
const gregMode = ref(localStorage.getItem(GREG_MODE_KEY) === "true");

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
const sharing = useSharePlans(copyCards);
const hasMultiplePrintings = computed(() => {
  if (!selected.value) return false;
  const printingsByName = new Map<string, Set<string>>();
  for (const card of [...selected.value.mainboard, ...selected.value.sideboard]) {
    const key = card.name.toLocaleLowerCase();
    const printings = printingsByName.get(key) ?? new Set<string>();
    printings.add(cardIdentity(card));
    printingsByName.set(key, printings);
    if (printings.size > 1) return true;
  }
  return false;
});

async function importMoxfieldDeck(source: string) {
  loading.value = true;
  error.value = "";
  try {
    const imported = await fetchMoxfieldDeck(source);
    setDeck(imported.name, imported.sourceUrl, imported.plan);
    await loadArt();
  } catch {
    moxfieldFallbackOpen.value = true;
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

async function openExportPreview() {
  if (!base.value) return;
  exportPreview.value = markdown.createExport(
    deckName.value,
    deckSourceUrl.value,
    plans.value,
    changesFor,
  );
  copiedExport.value = false;
  copiedShare.value = false;
  shareError.value = "";
  try {
    shareUrl.value = await sharing.createShareUrl(
      deckName.value,
      deckSourceUrl.value,
      plans.value,
      changesFor,
    );
  } catch (cause) {
    shareUrl.value = "";
    shareError.value = cause instanceof Error ? cause.message : "Could not create a share link.";
  }
}

function saveExport() {
  markdown.save(markdown.exportFilename(deckName.value), exportPreview.value);
}

async function copyText(value: string) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(value);
    return;
  }
  const textarea = document.createElement("textarea");
  textarea.value = value;
  textarea.setAttribute("readonly", "");
  textarea.style.cssText = "position:fixed;opacity:0;pointer-events:none";
  document.body.append(textarea);
  textarea.select();
  const copied = document.execCommand("copy");
  textarea.remove();
  if (!copied) throw new Error("Your browser could not copy this text.");
}

async function copyExport() {
  await copyText(exportPreview.value);
  copiedExport.value = true;
}

async function copyShare() {
  await copyText(shareUrl.value);
  copiedShare.value = true;
}

function openImportModal() {
  importModalOpen.value = true;
  importPreview.value = "";
  importError.value = "";
}

function closeMoxfieldFallback() {
  moxfieldFallbackOpen.value = false;
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

function closeOnEscape(event: KeyboardEvent) {
  if (event.key !== "Escape") return;
  if (importModalOpen.value) importModalOpen.value = false;
  if (exportPreview.value) {
    exportPreview.value = "";
    shareUrl.value = "";
    shareError.value = "";
  }
}

onMounted(async () => {
  window.addEventListener("keydown", closeOnEscape);
  restore();
  const url = new URL(window.location.href);
  const sharedPlan = url.searchParams.get("plan");
  if (sharedPlan) {
    url.searchParams.delete("plan");
    window.history.replaceState(
      window.history.state,
      "",
      `${url.pathname}${url.search}${url.hash}`,
    );
    loading.value = true;
    error.value = "";
    try {
      const shared = await sharing.decodeShare(sharedPlan);
      let imported;
      try {
        imported = shared.sourceUrl ? await fetchMoxfieldDeck(shared.sourceUrl) : undefined;
      } catch {
        imported = undefined;
      }
      const importedPlan = imported?.plan ?? sharing.baseFromShare(shared);
      deckName.value = shared.deckName || imported?.name || "Shared deck";
      deckSourceUrl.value = imported?.sourceUrl ?? shared.sourceUrl;
      plans.value = sharing.plansFromShare(shared, importedPlan);
      selectedId.value = "base";
      await loadArt();
    } catch (cause) {
      error.value = cause instanceof Error ? cause.message : "Could not open this share link.";
    } finally {
      loading.value = false;
    }
    return;
  }
  const sharedDeckUrl = url.searchParams.get("moxfield");
  if (!sharedDeckUrl) return;
  url.searchParams.delete("moxfield");
  window.history.replaceState(window.history.state, "", `${url.pathname}${url.search}${url.hash}`);
  deckUrl.value = sharedDeckUrl;
  void importMoxfieldDeck(sharedDeckUrl);
});

onBeforeUnmount(() => window.removeEventListener("keydown", closeOnEscape));

watch(gregMode, (enabled) => localStorage.setItem(GREG_MODE_KEY, String(enabled)));
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
        :greg-mode="gregMode"
        :show-greg-mode="hasMultiplePrintings"
        :matchup-name="selected && !isBase ? selected.name : undefined"
        @select-base="selectedId = 'base'"
        @toggle-greg-mode="gregMode = !gregMode"
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
            :greg-mode="gregMode"
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
            :greg-mode="gregMode"
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
    :share-url="shareUrl"
    :copied-share="copiedShare"
    :share-error="shareError"
    :import-open="importModalOpen"
    :import-preview="importPreview"
    :import-error="importError"
    :moxfield-fallback-open="moxfieldFallbackOpen"
    :loading="loading"
    @close-delete="pendingDeletion = null"
    @confirm-delete="deleteMatchup"
    @close-export="
      exportPreview = '';
      shareUrl = '';
      shareError = '';
    "
    @copy-export="copyExport"
    @copy-share="copyShare"
    @save-export="saveExport"
    @close-import="importModalOpen = false"
    @update:import-preview="importPreview = $event"
    @file-changed="loadMarkdownFile"
    @apply-import="applyMarkdownImport"
    @close-moxfield-fallback="closeMoxfieldFallback"
  />
</template>
