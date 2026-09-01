<template>
  <section class="topology-node-hover-card" :style="cardStyle">
    <header>
      <span>{{ title }}</span>
    </header>
    <dl>
      <template v-for="row in rows" :key="row.label">
        <dt>{{ row.label }}</dt>
        <dd>{{ row.value }}</dd>
      </template>
    </dl>
  </section>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import type { EmulatorNetwork, EmulatorNode } from '@/utils/types'
import type { GlobeNode } from '@/view/map/shared/services/globeGraph'

const props = defineProps<{
  node: GlobeNode
  position: { x: number; y: number }
}>()

function shortId(value: string | undefined) {
  return value ? value.slice(0, 12) : '-'
}

function isEmulatorNode(value: unknown): value is EmulatorNode {
  const node = value as EmulatorNode | undefined
  return Boolean(node?.meta?.emulatorInfo?.nets && Array.isArray(node.meta.emulatorInfo.nets))
}

function isEmulatorNetwork(value: unknown): value is EmulatorNetwork {
  const network = value as EmulatorNetwork | undefined
  return Boolean(network?.meta?.emulatorInfo && 'prefix' in network.meta.emulatorInfo)
}

const title = computed(() => {
  const object = props.node.object
  if (isEmulatorNode(object)) {
    return `${object.meta.emulatorInfo.role || 'Node'}: ${props.node.label}`
  }
  if (isEmulatorNetwork(object)) {
    return `${object.meta.emulatorInfo.type === 'global' ? 'Exchange' : 'Network'}: ${props.node.label}`
  }
  return props.node.label
})

const rows = computed(() => {
  const object = props.node.object
  if (isEmulatorNode(object)) {
    const info = object.meta.emulatorInfo
    const addresses = info.nets.map((net) => `${net.name}: ${net.address}`).join('\n') || '-'
    return [
      { label: 'ID', value: shortId(object.Id) },
      { label: 'ASN', value: String(info.asn ?? '-') },
      { label: 'Name', value: info.name || '-' },
      { label: 'Role', value: info.role || '-' },
      { label: 'IP addresses', value: addresses },
    ]
  }

  if (isEmulatorNetwork(object)) {
    const info = object.meta.emulatorInfo
    return [
      { label: 'ID', value: shortId(object.Id) },
      { label: 'Type', value: info.type || '-' },
      { label: 'Scope', value: info.scope || '-' },
      { label: 'Name', value: info.name || '-' },
      { label: 'Prefix', value: info.prefix || '-' },
    ]
  }

  return [
    { label: 'ID', value: props.node.sourceId ?? props.node.id },
    { label: 'Type', value: props.node.kind },
    { label: 'Group', value: props.node.group || '-' },
    { label: 'Position', value: `${props.node.lat.toFixed(4)}, ${props.node.lon.toFixed(4)}` },
  ]
})

const cardStyle = computed(() => {
  const width = 340
  const height = 260
  const left = Math.min(props.position.x + 16, window.innerWidth - width - 12)
  const top = Math.min(props.position.y + 16, window.innerHeight - height - 12)
  return {
    left: `${Math.max(12, left)}px`,
    top: `${Math.max(12, top)}px`,
  }
})
</script>

<style scoped lang="scss">
.topology-node-hover-card {
  position: fixed;
  z-index: 30;
  width: 340px;
  max-height: 260px;
  overflow: auto;
  padding: 12px 14px;
  pointer-events: none;
  color: #d9f3ff;
  border: 1px solid rgba(70, 190, 255, 0.36);
  border-radius: 12px;
  background: linear-gradient(145deg, rgba(4, 15, 25, 0.96), rgba(7, 29, 43, 0.92));
  box-shadow: 0 18px 42px rgba(0, 0, 0, 0.34), 0 0 22px rgba(48, 188, 255, 0.16);
  backdrop-filter: blur(10px);

  header {
    display: grid;
    gap: 3px;
    margin-bottom: 10px;

    span {
      font-size: 13px;
      font-weight: 800;
      color: #ffffff;
    }

    small {
      font-size: 11px;
      color: rgba(178, 219, 239, 0.78);
    }
  }

  dl {
    display: grid;
    grid-template-columns: 92px minmax(0, 1fr);
    gap: 7px 10px;
    margin: 0;
    font-size: 12px;
  }

  dt {
    color: rgba(166, 205, 225, 0.72);
  }

  dd {
    min-width: 0;
    margin: 0;
    white-space: pre-wrap;
    overflow-wrap: anywhere;
    color: #eaf9ff;
  }
}
</style>
