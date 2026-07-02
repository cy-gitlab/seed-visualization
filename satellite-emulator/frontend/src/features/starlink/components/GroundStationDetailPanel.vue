<template>
  <section
    v-if="visible && station"
    ref="panelRef"
    class="satellite-detail-panel"
    :style="panelStyle"
  >
    <header @pointerdown="startDrag">
      <span>{{ station.name }}</span>
      <button type="button" aria-label="Close station details" @click="$emit('close')">x</button>
    </header>

    <div class="satellite-detail">
      <dl>
        <div v-for="row in rows" :key="row.label">
          <dt>{{ row.label }}</dt>
          <dd>{{ row.value }}</dd>
        </div>
      </dl>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import type { GroundStation, SatelliteDetailRow } from '@/features/starlink/types';

const props = defineProps<{
  visible: boolean;
  station?: GroundStation;
}>();

defineEmits<{
  close: [];
}>();

const panelRef = ref<HTMLElement>();
const position = ref({ x: Math.max(window.innerWidth - 568, 24), y: 600 });
const dragOffset = ref({ x: 0, y: 0 });

const rows = computed<SatelliteDetailRow[]>(() =>
  props.station
    ? [
        { label: 'Station ID', value: props.station.id },
        { label: 'City', value: props.station.city },
        { label: 'Latitude', value: `${props.station.latitude.toFixed(4)}°` },
        { label: 'Longitude', value: `${props.station.longitude.toFixed(4)}°` },
        { label: 'Altitude', value: `${props.station.altitudeMeters.toFixed(1)} m` },
      ]
    : [],
);
const panelStyle = computed(() => ({
  left: `${position.value.x}px`,
  top: `${position.value.y}px`,
}));

function startDrag(event: PointerEvent) {
  if ((event.target as HTMLElement).closest('button')) {
    return;
  }

  const panel = panelRef.value;
  if (!panel) {
    return;
  }

  const rect = panel.getBoundingClientRect();
  dragOffset.value = {
    x: event.clientX - rect.left,
    y: event.clientY - rect.top,
  };
  position.value = { x: rect.left, y: rect.top };

  panel.setPointerCapture(event.pointerId);
  panel.addEventListener('pointermove', movePanel);
  panel.addEventListener('pointerup', stopDrag, { once: true });
  panel.addEventListener('pointercancel', stopDrag, { once: true });
}

function movePanel(event: PointerEvent) {
  const panel = panelRef.value;
  if (!panel) {
    return;
  }

  position.value = {
    x: Math.max(0, Math.min(window.innerWidth - panel.offsetWidth, event.clientX - dragOffset.value.x)),
    y: Math.max(0, Math.min(window.innerHeight - panel.offsetHeight, event.clientY - dragOffset.value.y)),
  };
}

function stopDrag(event: PointerEvent) {
  const panel = panelRef.value;
  if (!panel) {
    return;
  }

  panel.releasePointerCapture(event.pointerId);
  panel.removeEventListener('pointermove', movePanel);
}
</script>

<style scoped lang="scss" src="@/features/starlink/styles/satellite-detail-panel.scss"></style>
