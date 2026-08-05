<script setup lang="ts" xmlns="http://www.w3.org/1999/html">
import {computed, nextTick, onBeforeUnmount, ref} from 'vue'
import {ElMessage, ElMessageBox} from 'element-plus'
import Upload from '@/components/Upload/index.vue'
import UploadMap3DGlobe from '@/components/UploadMap3DGlobe/index.vue'
import InternetMap3DToolbar from '@/components/InternetMap3DToolbar/index.vue'
import {filterGraphByIXRoutersData} from './services/graphFilters'
import {DataSource} from './datasource'
import {createGlobeGraph, type GlobeGraph, type GlobeNode} from './services/globeGraph'
import {allLoading} from '@/utils/tools'
import type {Edge, Vertex} from '@/utils/map-datasource'
import { augmentAsHighlight, isTransitRouter, waitForBrowserPaint } from '@/view/map/shared/map3dGraph'

const mapData = ref()
const showAllNodes = ref(false)
const nodeScale = ref(2)
const showRouterLabels = ref(true)
const settingsOpen = ref(false)
const baseGlobeGraph = ref<GlobeGraph>({nodes: [], edges: []})
const globeGraph = ref<GlobeGraph>({nodes: [], edges: []})
const globeLoadingVisible = ref(false)
const ixOptions = ref<{ label: string; value: string }[]>([])
const selected3DIxLabels = ref<string[]>([])
const expandedRouterParentIds = ref<string[]>([])
const ixCount = ref(0)
const orientToInitialNode = ref(true)
const waitingForGraphRender = ref(false)
const selectedAsn = ref<string>()
const selectedAsSourceId = ref<string>()
let globeLoading: ReturnType<typeof allLoading> | undefined
let cached3DGraphSource: { vertices: Vertex[]; edges: Edge[] } | undefined

const ixCountMax = computed(() => ixOptions.value.length)

async function chooseNodeScope() {
  try {
    await ElMessageBox.confirm(
        'Do you want to display all the nodes of the Internet Map?',
        'Display Node Scope',
        {
          confirmButtonText: 'All Nodes',
          cancelButtonText: 'Simplified Nodes',
          distinguishCancelAndClose: true,
          type: 'info',
        },
    )
    showAllNodes.value = true
  } catch (action) {
    if (action === 'cancel') {
      showAllNodes.value = false
      return
    }
    throw action
  }
}

function set3DIxOptions(datasource: DataSource) {
  ixOptions.value = datasource.ixs
      .map((ix: any) => ({
        label: ix.meta?.emulatorInfo?.displayname || ix.meta?.emulatorInfo?.name,
        value: ix.meta?.emulatorInfo?.name,
      }))
      .filter((item): item is { label: string; value: string } => Boolean(item.label && item.value))
  selected3DIxLabels.value = ixOptions.value.map((item) => item.value)
  ixCount.value = ixOptions.value.length
}

async function createGraphSource(data: unknown): Promise<{ vertices: Vertex[]; edges: Edge[] }> {
  const datasource = new DataSource()
  datasource.setVisData(data as any)
  await datasource.connect()

  return {
    vertices: datasource.vertices,
    edges: datasource.edges,
  }
}

async function getCached3DGraphSource() {
  if (!cached3DGraphSource) {
    cached3DGraphSource = await createGraphSource(mapData.value)
  }
  return cached3DGraphSource
}

async function renderSelectedAsGraph() {
  if (!selectedAsn.value) {
    globeGraph.value = baseGlobeGraph.value
    return
  }

  const {vertices, edges} = await getCached3DGraphSource()
  globeGraph.value = augmentAsHighlight(
      baseGlobeGraph.value,
      vertices,
      edges,
      selectedAsn.value,
      selectedAsSourceId.value,
  )
}

async function renderSelectedIXGraph() {
  if (!mapData.value) return
  if (selected3DIxLabels.value.length === 0) {
    baseGlobeGraph.value = {nodes: [], edges: []}
    globeGraph.value = {nodes: [], edges: []}
    expandedRouterParentIds.value = []
    selectedAsn.value = undefined
    selectedAsSourceId.value = undefined
    return
  }

  const {vertices, edges} = await getCached3DGraphSource()
  const {filteredNodes, filteredEdges} = filterGraphByIXRoutersData(vertices, edges, selected3DIxLabels.value)
  baseGlobeGraph.value = createGlobeGraph(filteredNodes, filteredEdges)
  await renderSelectedAsGraph()
}

async function renderWithLoading(orientToGraph = true) {
  globeLoadingVisible.value = true
  await nextTick()
  await waitForBrowserPaint()

  try {
    orientToInitialNode.value = orientToGraph
    waitingForGraphRender.value = true
    await renderSelectedIXGraph()
    if (globeGraph.value.nodes.length === 0) {
      ElMessage.warning('No IX nodes with geographic coordinates were found.')
    }
  } catch (error) {
    console.error('3D IX graph calculation failed:', error)
    ElMessage.error('3D IX graph calculation failed.')
    waitingForGraphRender.value = false
    globeLoadingVisible.value = false
  }
}

async function handleParsedMap(value: unknown): Promise<void> {
  try {
    await chooseNodeScope()
    mapData.value = value
    cached3DGraphSource = undefined
    const {vertices, edges} = await getCached3DGraphSource()
    const datasource = new DataSource()
    datasource.setVisData(value as any)
    await datasource.connect()
    set3DIxOptions(datasource)

    if (showAllNodes.value) {
      globeLoading?.close()
      globeLoading = allLoading()
      globeLoadingVisible.value = true
      await nextTick()
      await waitForBrowserPaint()
    }

    settingsOpen.value = false

    baseGlobeGraph.value = {nodes: [], edges: []}
    globeGraph.value = {nodes: [], edges: []}
    expandedRouterParentIds.value = []
    selectedAsn.value = undefined
    selectedAsSourceId.value = undefined
    orientToInitialNode.value = true
    await nextTick()
    await waitForBrowserPaint()

    try {
      await nextTick()
      await waitForBrowserPaint()
      if (showAllNodes.value) {
        baseGlobeGraph.value = createGlobeGraph(vertices, edges)
        await renderSelectedAsGraph()
      } else {
        await renderWithLoading()
      }
      if (globeGraph.value.nodes.length === 0) {
        ElMessage.warning('No IX nodes with geographic coordinates were found.')
      }
    } catch (error) {
      console.error('3D graph calculation failed:', error)
      ElMessage.error('3D graph calculation failed. Please try Simplified Nodes or reload the file.')
      globeLoading?.close()
      globeLoading = undefined
      globeLoadingVisible.value = false
    }
  } catch {
    mapData.value = undefined
    showAllNodes.value = false
    nodeScale.value = 2
    showRouterLabels.value = true
    settingsOpen.value = false
    baseGlobeGraph.value = {nodes: [], edges: []}
    globeGraph.value = {nodes: [], edges: []}
    ixOptions.value = []
    selected3DIxLabels.value = []
    expandedRouterParentIds.value = []
    ixCount.value = 0
    orientToInitialNode.value = true
    waitingForGraphRender.value = false
    selectedAsn.value = undefined
    selectedAsSourceId.value = undefined
    cached3DGraphSource = undefined
    globeLoading?.close()
    globeLoading = undefined
    globeLoadingVisible.value = false
  }
}

function applyIxCount(value: number | undefined) {
  const count = Math.max(0, Math.min(value ?? 0, ixOptions.value.length))
  selected3DIxLabels.value = ixOptions.value.slice(0, count).map((item) => item.value)
  expandedRouterParentIds.value = []
  selectedAsn.value = undefined
  selectedAsSourceId.value = undefined
}

function applyIxSelection() {
  ixCount.value = selected3DIxLabels.value.length
  expandedRouterParentIds.value = []
  selectedAsn.value = undefined
  selectedAsSourceId.value = undefined
}

function onGlobeRendered(renderedGraph: GlobeGraph) {
  if (waitingForGraphRender.value && renderedGraph === globeGraph.value) {
    waitingForGraphRender.value = false
  }
  if (orientToInitialNode.value && renderedGraph.nodes.length > 0) {
    orientToInitialNode.value = false
  }
  globeLoading?.close()
  globeLoading = undefined
  globeLoadingVisible.value = false
}

async function onGlobeNodeClick(node: GlobeNode) {
  if (node.kind === 'star') {
    if (expandedRouterParentIds.value.includes(node.id)) {
      expandedRouterParentIds.value = expandedRouterParentIds.value.filter((id) => id !== node.id)
    } else {
      expandedRouterParentIds.value = [...expandedRouterParentIds.value, node.id]
    }
    return
  }

  if (node.kind !== 'dot' || !node.sourceId) {
    ElMessage.warning('Please select an AS router node.')
    return
  }

  const {vertices} = await getCached3DGraphSource()
  const vertex = vertices.find((item) => item.id === node.sourceId)
  if (!isTransitRouter(vertex)) {
    ElMessage.warning('Please select an AS router node.')
    return
  }

  const asn = vertex?.group
  if (!asn) {
    ElMessage.warning('Please select an AS router node.')
    return
  }

  if (selectedAsn.value === String(asn)) {
    selectedAsn.value = undefined
    selectedAsSourceId.value = undefined
  } else {
    selectedAsn.value = String(asn)
    selectedAsSourceId.value = node.sourceId
  }

  await renderSelectedAsGraph()
}

onBeforeUnmount(() => {
  globeLoading?.close()
  globeLoading = undefined
  globeLoadingVisible.value = false
})

function resetUpload() {
  mapData.value = undefined
  showAllNodes.value = false
  nodeScale.value = 2
  showRouterLabels.value = true
  settingsOpen.value = false
  baseGlobeGraph.value = {nodes: [], edges: []}
  globeGraph.value = {nodes: [], edges: []}
  ixOptions.value = []
  selected3DIxLabels.value = []
  expandedRouterParentIds.value = []
  ixCount.value = 0
  orientToInitialNode.value = true
  waitingForGraphRender.value = false
  selectedAsn.value = undefined
  selectedAsSourceId.value = undefined
  cached3DGraphSource = undefined
  globeLoading?.close()
  globeLoading = undefined
  globeLoadingVisible.value = false
}
</script>

<template>
  <main v-if="mapData" class="upload-map-3d-page">
    <UploadMap3DGlobe
        :graph="globeGraph"
        :node-scale="nodeScale"
        :show-router-labels="showRouterLabels"
        :expanded-router-parent-ids="expandedRouterParentIds"
        :orient-to-graph="orientToInitialNode"
        @rendered="onGlobeRendered"
        @node-click="onGlobeNodeClick"
    />
    <InternetMap3DToolbar
        v-model:node-scale="nodeScale"
        v-model:show-router-labels="showRouterLabels"
        v-model:settings-open="settingsOpen"
        v-model:ix-count="ixCount"
        v-model:selected-ix-labels="selected3DIxLabels"
        title="3D Internet Map"
        :node-count="globeGraph.nodes.length"
        :edge-count="globeGraph.edges.length"
        :ix-options="ixOptions"
        :ix-count-max="ixCountMax"
        :show-ix-controls="true"
        :confirm-disabled="selected3DIxLabels.length === 0"
        @reload="resetUpload"
        @confirm="renderWithLoading"
        @ix-count-change="applyIxCount"
        @ix-selection-change="applyIxSelection"
    />
    <section v-if="globeLoadingVisible" class="upload-map-3d-loading">
      <div class="upload-map-3d-loading-box">
        <span class="upload-map-3d-loading-spinner"/>
        <strong>Loading...</strong>
      </div>
    </section>
  </main>

  <Upload
      v-else
      class="upload-map-3d-upload-panel"
      data-testid="upload-map-3d-upload-panel"
      v-model:map-data="mapData"
      @update:map-data="handleParsedMap"
  />
</template>

<style scoped lang="scss" src="./styles/upload-map-3d.scss"></style>
