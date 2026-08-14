<script setup lang="ts">
import type { Plan } from "../types";

defineProps<{
  pendingDeletion: Plan | null;
  exportPreview: string;
  copiedExport: boolean;
  importOpen: boolean;
  importPreview: string;
  importError: string;
  moxfieldFallbackOpen: boolean;
  loading: boolean;
}>();

defineEmits<{
  closeDelete: [];
  confirmDelete: [];
  closeExport: [];
  copyExport: [];
  saveExport: [];
  closeImport: [];
  "update:importPreview": [value: string];
  fileChanged: [event: Event];
  applyImport: [];
  closeMoxfieldFallback: [];
}>();
</script>

<template>
  <div
    v-if="moxfieldFallbackOpen"
    class="fixed inset-0 z-20 grid place-items-center bg-[#040505bd] p-5 backdrop-blur-[3px]"
    @click.self="$emit('closeMoxfieldFallback')"
  >
    <section
      class="w-full max-w-[500px] rounded-[9px] border border-[#4a4d4b] bg-[#202325] p-[25px] shadow-[0_18px_55px_#0008]"
      role="dialog"
      aria-modal="true"
      aria-labelledby="moxfield-fallback-title"
    >
      <p class="font-mono text-[10px] font-medium tracking-[.1em] text-[#d98a66]">
        MOXFIELD IMPORT UNAVAILABLE
      </p>
      <h2
        id="moxfield-fallback-title"
        class="mb-[10px] mt-0 font-display text-[25px] font-semibold"
      >
        Import your decklist by pasting it instead
      </h2>
      <p class="m-0 text-[13px] leading-[1.55] text-[#b7bbb4]">
        Automatic Moxfield imports are not available on this site yet. You can still import the
        exact decklist and card printings in a few steps:
      </p>
      <ol class="mb-0 mt-4 list-decimal space-y-2 pl-5 text-[13px] leading-[1.55] text-[#d9dbd5]">
        <li>Open your deck’s page on Moxfield.</li>
        <li>Choose <strong>Export for Moxfield</strong> and copy the decklist.</li>
        <li>
          Open <strong>Paste decklist instead</strong> in the sidebar, paste it, then select
          <strong>Import pasted list</strong>.
        </li>
      </ol>
      <div class="mt-6 flex justify-end">
        <button
          class="cursor-pointer rounded-md border border-[#e07152] bg-[#c9583b] px-3 py-[9px] text-[12px] font-bold text-white"
          @click="$emit('closeMoxfieldFallback')"
        >
          Got it
        </button>
      </div>
    </section>
  </div>
  <div
    v-if="pendingDeletion"
    class="fixed inset-0 z-20 grid place-items-center bg-[#040505bd] p-5 backdrop-blur-[3px]"
    @click.self="$emit('closeDelete')"
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
          @click="$emit('closeDelete')"
        >
          Cancel
        </button>
        <button
          class="cursor-pointer rounded-md border border-[#e07152] bg-[#c9583b] px-3 py-[9px] text-[12px] font-bold text-white"
          @click="$emit('confirmDelete')"
        >
          Delete matchup
        </button>
      </div>
    </section>
  </div>
  <div
    v-if="exportPreview"
    class="fixed inset-0 z-20 grid place-items-center bg-[#040505bd] p-5 backdrop-blur-[3px]"
    @click.self="$emit('closeExport')"
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
          @click="$emit('closeExport')"
        >
          Close
        </button>
        <button
          class="cursor-pointer rounded-md border border-[#527b92] bg-[#243943] px-3 py-[9px] text-[12px] font-bold text-[#d7edf5]"
          @click="$emit('copyExport')"
        >
          {{ copiedExport ? "Copied" : "Copy" }}
        </button>
        <button
          class="cursor-pointer rounded-md border border-[#e07152] bg-[#c9583b] px-3 py-[9px] text-[12px] font-bold text-white"
          @click="$emit('saveExport')"
        >
          Save file
        </button>
      </div>
    </section>
  </div>
  <div
    v-if="importOpen"
    class="fixed inset-0 z-20 grid place-items-center bg-[#040505bd] p-5 backdrop-blur-[3px]"
    @click.self="$emit('closeImport')"
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
        class="mt-4 block h-[min(58vh,650px)] w-full resize-none rounded-md border border-[#3b3f3d] bg-[#111315] p-[13px] font-mono text-[12px] leading-[1.55] text-[#d9dbd5]"
        :value="importPreview"
        aria-label="Markdown import content"
        placeholder="Paste your sideboard Markdown here, or upload a .md file."
        @input="$emit('update:importPreview', ($event.target as HTMLTextAreaElement).value)"
      />
      <p v-if="importError" class="mb-0 mt-[10px] text-[13px] leading-[1.55] text-[#ed9073]">
        {{ importError }}
      </p>
      <div class="mt-6 flex justify-end gap-[9px]">
        <button
          class="cursor-pointer rounded-md border border-[#4a4d4b] bg-transparent px-3 py-[9px] text-[12px] text-[#d1d3ce]"
          @click="$emit('closeImport')"
        >
          Close
        </button>
        <label
          class="cursor-pointer rounded-md border border-[#527b92] bg-[#243943] px-3 py-[9px] text-[12px] font-bold text-[#d7edf5]"
          >Upload file<input
            class="hidden"
            type="file"
            accept=".md,text/markdown"
            @change="$emit('fileChanged', $event)"
        /></label>
        <button
          class="cursor-pointer rounded-md border border-[#e07152] bg-[#c9583b] px-3 py-[9px] text-[12px] font-bold text-white disabled:opacity-50"
          :disabled="loading"
          @click="$emit('applyImport')"
        >
          {{ loading ? "Importing…" : "Import" }}
        </button>
      </div>
    </section>
  </div>
</template>
