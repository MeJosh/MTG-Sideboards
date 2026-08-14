<script setup lang="ts">
type Card = { name: string; quantity: number; image?: string; scryfallId?: string };

defineProps<{
  title: string;
  cards: Card[];
  total: number;
  disabled: boolean;
  movedNames?: string[];
  movedClass?: string;
}>();

defineEmits<{ move: [card: Card] }>();
</script>

<template>
  <section class="pile">
    <div class="pile-title">
      <h2>{{ title }}</h2>
      <span>{{ total }} cards</span>
    </div>
    <div class="grid">
      <button
        v-for="card in cards"
        :key="card.name"
        :class="{ [movedClass ?? '']: movedNames?.includes(card.name) }"
        :disabled="disabled"
        @click="$emit('move', card)"
      >
        <img v-if="card.image" :src="card.image" :alt="card.name" />
        <div v-else class="fallback">{{ card.name[0] }}</div>
        <div>
          <span>{{ card.name }}</span
          ><b>×{{ card.quantity }}</b>
        </div>
      </button>
    </div>
  </section>
</template>
