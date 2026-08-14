<script setup lang="ts">
import type { Plan } from "../types";

defineProps<{
  deckUrl: string;
  deckText: string;
  loading: boolean;
  error: string;
  plans: Plan[];
  selectedId: string;
  deckCount: string;
  hasBase: boolean;
}>();

defineEmits<{
  "update:deckUrl": [value: string];
  "update:deckText": [value: string];
  "update:selectedId": [value: string];
  importDeck: [];
  importText: [];
  addMatchup: [];
  deleteMatchup: [plan: Plan];
  openImport: [];
  openExport: [];
}>();
</script>

<template>
  <aside
    class="flex flex-col border-b border-[#292c2e] bg-[#0e1012] p-5 md:h-screen md:min-h-0 md:overflow-y-auto md:border-r md:border-b-0 md:px-5 md:pt-[29px] md:pb-5"
  >
    <div class="flex items-center gap-2.5 px-2 pb-[18px] md:pb-[29px]">
      <b
        class="grid size-[30px] place-items-center rounded-lg bg-[#d26a3b] font-display text-[20px] font-bold text-[#1c120e]"
        >S</b
      >
      <span
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
          :value="deckUrl"
          placeholder="moxfield.com/decks/..."
          @input="$emit('update:deckUrl', ($event.target as HTMLInputElement).value)"
          @keyup.enter="$emit('importDeck')"
        />
        <button
          class="cursor-pointer rounded-r-md bg-[#d26a3b] px-[9px] text-[11px] font-bold disabled:cursor-default"
          :disabled="loading"
          @click="$emit('importDeck')"
        >
          {{ loading ? "..." : "Import" }}
        </button>
      </div>
      <p v-if="error" class="mt-[9px] mx-0.5 text-[11px] text-[#ef8b71]">{{ error }}</p>
      <details class="mt-[11px] text-[11px] text-[#a9ada7]">
        <summary class="cursor-pointer text-[#d98a66]">Paste decklist instead</summary>
        <textarea
          class="mt-2 block min-h-[100px] w-full resize-y rounded-md border border-[#303438] bg-[#1b1e20] p-2 font-mono text-[10px] text-[#eee]"
          :value="deckText"
          placeholder="4 Lightning Bolt&#10;...&#10;Sideboard&#10;2 Red Elemental Blast"
          @input="$emit('update:deckText', ($event.target as HTMLTextAreaElement).value)"
        ></textarea>
        <button
          class="mt-[7px] cursor-pointer rounded-[5px] bg-[#34383a] px-[9px] py-[7px] text-[11px] text-[#ddd]"
          @click="$emit('importText')"
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
        :class="['group flex items-center rounded-md', { 'bg-[#282b2d]': plan.id === selectedId }]"
      >
        <button
          :class="[
            'min-w-0 flex-1 cursor-pointer rounded-md bg-transparent px-[9px] py-[10px] text-left text-[13px] text-[#c0c3bc] hover:bg-[#1b1e20]',
            {
              '!bg-transparent font-semibold text-white hover:bg-transparent':
                plan.id === selectedId,
            },
          ]"
          @click="$emit('update:selectedId', plan.id)"
        >
          <i
            :class="[
              'mr-[9px] mb-px inline-block size-1.5 rounded-full bg-[#686d68]',
              { 'bg-[#d26a3b]': plan.id === selectedId },
            ]"
          />{{ plan.name }}
        </button>
        <button
          v-if="plan.id !== 'base'"
          :class="[
            plan.id === selectedId ? 'block' : 'hidden group-hover:block',
            'w-7 cursor-pointer bg-transparent px-[6px] py-[7px] text-center text-[18px] leading-none text-[#aeb1ab] hover:text-[#f2906d]',
          ]"
          :aria-label="`Delete ${plan.name}`"
          @click="$emit('deleteMatchup', plan)"
        >
          ×
        </button>
      </div>
      <button
        class="mt-[3px] w-full cursor-pointer rounded-md bg-transparent px-[9px] py-[10px] text-left text-[13px] text-[#d8845f] hover:bg-[#1b1e20]"
        :disabled="!hasBase"
        @click="$emit('addMatchup')"
      >
        ＋ Add Matchup
      </button>
    </nav>
    <div class="mt-auto border-t border-[#292c2e] px-2 pt-[15px]">
      <small class="mb-[10px] block p-0 font-mono text-[10px] text-[#747872] max-md:hidden">{{
        deckCount
      }}</small>
      <div class="grid grid-cols-2 gap-1.5">
        <button
          class="cursor-pointer rounded-[5px] border border-[#454946] bg-transparent p-[7px] text-[11px] text-[#c6c9c3] hover:border-[#d26a3b] hover:text-[#eea17c]"
          @click="$emit('openImport')"
        >
          Import
        </button>
        <button
          class="cursor-pointer rounded-[5px] border border-[#454946] bg-transparent p-[7px] text-[11px] text-[#c6c9c3] hover:border-[#d26a3b] hover:text-[#eea17c] disabled:cursor-default disabled:opacity-45"
          :disabled="!hasBase"
          @click="$emit('openExport')"
        >
          Export
        </button>
      </div>
    </div>
  </aside>
</template>
