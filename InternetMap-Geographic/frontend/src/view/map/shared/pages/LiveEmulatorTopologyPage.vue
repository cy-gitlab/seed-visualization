<script setup lang="ts">
import { computed, nextTick, onActivated, onBeforeUnmount, onDeactivated, onMounted, ref, shallowRef, watch } from 'vue'
import { ElMessage } from 'element-plus'
import Map3DGlobe from '@/components/Map3DGlobe/index.vue'
import EmulatorTopologyDock from '@/view/map/shared/components/EmulatorTopologyDock.vue'
import LoadingOverlay from '@/view/map/shared/components/LoadingOverlay.vue'
import TopologyNodeHoverCard from '@/view/map/shared/components/TopologyNodeHoverCard.vue'
import { useEmulatorTopologyGraph } from '@/view/map/shared/composables/useEmulatorTopologyGraph'
import type { EmulatorNetwork, EmulatorNode } from '@/utils/types'
import { reqGetContainersList, reqGetNetworksList } from '@/api/map'
import {
  remapEmulatorTopologyPacketReplayEvent,
  type EmulatorTopologyPacketReplayEvent,
} from '@/view/map/shared/services/packetReplayFileService'
import type { PacketFlowPathStep } from '@/view/map/shared/services/packetFlowAnalyzer'
import { PacketFlowWorkerClient } from '@/view/map/shared/services/packetFlowWorkerClient'
import type { Map3DSceneMode } from '@/view/map/shared/services/cesiumScene'
import {
  fetchTrafficObserverFilter,
  setTrafficObserverFilter,
  TrafficObserverClient,
} from '@/view/map/shared/services/trafficObserverService'
import { WindowManager } from '@/utils/window-manager'

const LIVE_FLOW_IDLE_RESET_MS = 2500
const LIVE_FLOW_STALE_MS = 3000
const MIN_REPLAY_TIMER_DELAY_MS = 4
const MIN_PACKET_VISUAL_DURATION_MS = 16
const DEFAULT_TIMELINE_WINDOW_MS = 50
const LIVE_PACKET_FLASH_INTERVAL_MS = 180
const LIVE_PACKET_FLASH_DURATION_MS = 420
const LIVE_PACKET_HOP_DELAY_MS = 80
const LIVE_PACKET_ANIMATION_QUEUE_LIMIT = 96
const MAX_RECORDED_PACKET_EVENTS = 100_000
const MAX_CONSECUTIVE_FLOW_FAILURES = 6
const FLOW_FAILURE_GRACE_MS = 15_000
const LIVE_FLOW_ANALYSIS_TIMEOUT_MS = 3_000
const REPLAY_FLOW_ANALYSIS_TIMEOUT_MS = 10_000
const RECORDING_UI_UPDATE_INTERVAL_MS = 250
const MAX_TIMELINE_VISUALS_PER_WINDOW = 8
const MAX_TIMELINE_VISUAL_SCAN_PER_WINDOW = 512

type PacketReplayTimingMode = 'interval' | 'timeline'
type LivePacketAnimationJob = {
  event: EmulatorTopologyPacketReplayEvent
  pathNodeIds: string[]
  mode: 'highlight' | 'path'
}

const props = withDefaults(defineProps<{
  sceneMode?: Map3DSceneMode
  title?: string
}>(), {
  sceneMode: 'globe',
  title: 'Live Emulator Topology Globe',
})

const topologyLoaded = ref(false)
const activeDockPage = ref<'overview' | 'settings' | 'traffic'>('overview')
const packetReplayEvents = shallowRef<EmulatorTopologyPacketReplayEvent[]>([])
const recordedPacketCount = ref(0)
const packetReplayPlaylist = ref<EmulatorTopologyPacketReplayEvent[]>([])
const packetReplayFlowPath = ref<string[]>([])
const packetReplayFlowSegments = ref<string[][]>([])
const packetReplayPathSteps = ref<PacketFlowPathStep[]>([])
const packetReplayPathByFlowKey = new Map<string, string[]>()
const packetReplayDirectPathCache = new Map<string, string[]>()
const packetReplayAnimatedPathCache = new Map<string, string[]>()
const packetReplayFlowResolved = ref(false)
const liveFlowEvents = ref<EmulatorTopologyPacketReplayEvent[]>([])
const liveFlowPath = ref<string[]>([])
const liveFlowSegments = ref<string[][]>([])
const liveFlowPathSteps = ref<PacketFlowPathStep[]>([])
const packetReplayIndex = ref(0)
const packetReplayPlaying = ref(false)
const packetReplayPaused = ref(false)
const packetReplayPreparing = ref(false)
const packetReplayTimingMode = ref<PacketReplayTimingMode>('interval')
const packetReplayIntervalMs = ref(1200)
const packetReplayTimelineWindowMs = ref(DEFAULT_TIMELINE_WINDOW_MS)
const packetReplayTimelineSpeed = ref(1)
const packetReplayTimelineCursorMs = ref<number>()
const packetReplayStatus = ref('Submit a filter, then record live packets for replay.')
const packetRecordingEnabled = ref(false)
const showOnlyPacketLinks = ref(false)
const flowAnimationEnabled = ref(false)
const globeRef = ref<InstanceType<typeof Map3DGlobe>>()
const topologyLoadError = ref('')
const trafficFilterInput = ref('')
const trafficFilterStatus = ref('Submit a filter to start live capture.')
const trafficFilterError = ref('')
const trafficFilterSubmitting = ref(false)
const trafficCaptureActive = ref(false)
let packetReplayTimerId: number | undefined
let consoleWindowManager: WindowManager | undefined
let packetReplayGeneration = 0
let packetReplayPreparationGeneration = 0
let trafficObserverClient: TrafficObserverClient | undefined
let lastLivePacketReceivedAtMs = 0
const livePacketAnimationQueue: LivePacketAnimationJob[] = []
const liveFlowObservationSignatures = new Map<string, string>()
const liveFlowLastSeenAtMs = new Map<string, number>()
let livePacketFlasherTimerId: number | undefined
let liveFlowIdleTimerId: number | undefined
let liveVisualizationSuspended = false
let liveFlowAnalysisGeneration = 0
let packetReplayFlowAnalysisGeneration = 0
let liveFlowAnalysisRunning = false
let liveFlowAnalysisPending = false
let packetReplayFlowAnalysisRunning = false
let packetReplayFlowAnalysisPending = false
let packetReplayFlowAnalysisPromise: Promise<void> | undefined
let pendingPacketReplayEvents: EmulatorTopologyPacketReplayEvent[] = []
let consecutiveLiveFlowFailures = 0
let liveFlowFailureStartedAtMs = 0
let hoverCardCloseTimerId: number | undefined
let lastRecordingUiUpdateAtMs = 0
const packetFlowWorker = new PacketFlowWorkerClient()

const {
  graph,
  baseGraph,
  containers,
  networks,
  loadingVisible,
  waitingForGraphRender,
  orientToInitialNode,
  nodeScale,
  showNodeLabels,
  showHoverDetails,
  hoveredNode,
  hoverPosition,
  keyword,
  selectedAsns,
  selectedIxNames,
  selectedAsnValues,
  selectedIxNameValues,
  showAsDetails,
  expandedParentIds,
  selectedNode,
  stats,
  visibleTypes,
  selectedNodeSummary,
  ixSummaries,
  asSummaries,
  asDetailsByAsn,
  resetTopologyState,
  setTopologyData: setTopologyGraphData,
  refreshDisplayGraph,
  applySearch,
  submitSearchFromKeyboard,
  clearSearch,
  querySearchSuggestions,
  selectSearchSuggestion,
  onNodeClick,
  onNodeHover: setHoveredNode,
  onGlobeRendered,
  clearTopologyFilters,
} = useEmulatorTopologyGraph({
  getPathFilterEnabled: () => showOnlyPacketLinks.value,
  getPathFilterNodes: () => {
    if (packetReplayPlaying.value || packetReplayPaused.value) return packetReplayFlowSegments.value
    return trafficCaptureActive.value ? liveFlowSegments.value : []
  },
  orientToNode: (nodeId) => globeRef.value?.orientToNode(nodeId),
})
const packetFlowTopologyEdges = computed(() =>
  baseGraph.value.edges.map(({ from, to }) => ({ from, to })),
)
const graphNodeIdByAlias = computed(() => {
  const aliases = new Map<string, string>()
  baseGraph.value.nodes.forEach((node) => {
    const values = [node.id, node.sourceId, node.label]
    values.forEach((value) => {
      const key = value?.trim().toLowerCase()
      if (key && !aliases.has(key)) aliases.set(key, node.id)
    })
  })
  return aliases
})
const graphSearchEntries = computed(() => baseGraph.value.nodes.map((node) => ({
  id: node.id,
  searchText: node.searchText?.toLowerCase() ?? '',
})))
const graphEdgeKeys = computed(() => {
  const keys = new Set<string>()
  baseGraph.value.edges.forEach((edge) => {
    keys.add(makeGraphEdgeKey(edge.from, edge.to))
  })
  return keys
})
const packetReplayProgress = computed({
  get: () => packetReplayIndex.value,
  set: (value: number) => showPacketReplayEventAt(Number(value)),
})
const packetReplayStepCount = computed(() => recordedPacketCount.value)

function cancelHoverCardClose() {
  if (hoverCardCloseTimerId === undefined) return
  window.clearTimeout(hoverCardCloseTimerId)
  hoverCardCloseTimerId = undefined
}

function onNodeHover(node: Parameters<typeof setHoveredNode>[0], position: { x: number; y: number }) {
  cancelHoverCardClose()
  if (node) {
    setHoveredNode(node, position)
    return
  }
  hoverCardCloseTimerId = window.setTimeout(() => {
    hoverCardCloseTimerId = undefined
    setHoveredNode(undefined, position)
  }, 1000)
}

function onHoverCardLeave() {
  onNodeHover(undefined, hoverPosition.value)
}

function initConsoleWindowManager() {
  if (consoleWindowManager) return
  consoleWindowManager = new WindowManager('globe-console-area', 'globe-console-taskbar')
}

function launchContainerConsole(nodeId: string, title: string) {
  initConsoleWindowManager()
  consoleWindowManager?.createWindow(nodeId.slice(0, 12), title, { cmd: '' }, true)
}

async function setTopologyData(value: { nodes: EmulatorNode[]; nets: EmulatorNetwork[] }) {
  topologyLoaded.value = true
  await setTopologyGraphData(value)
}

async function loadDockerTopology() {
  loadingVisible.value = true
  topologyLoadError.value = ''
  try {
    const [containerResponse, networkResponse] = await Promise.all([
      reqGetContainersList({}),
      reqGetNetworksList({}),
    ])
    if (!containerResponse.ok) throw new Error('Failed to load emulator containers.')
    if (!networkResponse.ok) throw new Error('Failed to load emulator networks.')
    await setTopologyData({
      nodes: containerResponse.result as EmulatorNode[],
      nets: networkResponse.result as EmulatorNetwork[],
    })
  } catch (error) {
    topologyLoadError.value = error instanceof Error ? error.message : String(error)
    ElMessage.error(topologyLoadError.value)
    loadingVisible.value = false
    waitingForGraphRender.value = false
  }
}

async function reloadDockerTopology() {
  stopPacketReplay()
  clearPacketReplay()
  resetTopologyState()
  lastLivePacketReceivedAtMs = 0
  await loadDockerTopology()
}

function showPacketReplayEventAt(index: number) {
  const events = packetReplayTimingMode.value === 'timeline'
    ? ensureTimelinePacketReplayEvents()
    : packetReplayEvents.value
  if (!events.length) return
  packetReplayIndex.value = Math.max(0, Math.min(events.length, Math.round(index)))
  if (packetReplayTimingMode.value === 'timeline') {
    packetReplayTimelineCursorMs.value = packetReplayEvents.value[packetReplayIndex.value]
      ? getPacketTimestampMs(packetReplayEvents.value[packetReplayIndex.value]!)
      : undefined
    playPacketReplayPacket(packetReplayIndex.value)
    return
  }
  playPacketReplayIntervalEvent(packetReplayIndex.value)
}

function jumpPacketReplay(direction: number) {
  showPacketReplayEventAt(packetReplayIndex.value + direction)
}

function playNextPacketReplayEvent() {
  if (!packetReplayPlaying.value) return
  if (packetReplayTimingMode.value === 'timeline') {
    if (isTimelineSpeedMode()) {
      playNextPacketReplaySpeedEvent()
      return
    }
    playNextPacketReplayWindow()
    return
  }

  const events = packetReplayEvents.value
  if (packetReplayIndex.value >= events.length) {
    packetReplayPlaying.value = false
    packetReplayPaused.value = false
    return
  }

  packetReplayIndex.value += 1
  playPacketReplayIntervalEvent(packetReplayIndex.value)
  scheduleNextPacketReplay(playNextPacketReplayEvent, Math.max(0, getNextPacketReplayDelayMs(packetReplayIndex.value)))
}

function playNextPacketReplaySpeedEvent() {
  const events = packetReplayEvents.value
  if (!events.length || packetReplayIndex.value >= events.length) {
    packetReplayPlaying.value = false
    packetReplayPaused.value = false
    return
  }

  packetReplayIndex.value += 1
  playPacketReplayPacket(packetReplayIndex.value)
  scheduleNextPacketReplay(playNextPacketReplayEvent, Math.max(0, getNextPacketReplayDelayMs(packetReplayIndex.value)))
}

async function togglePacketReplay() {
  if (packetRecordingEnabled.value || packetReplayPreparing.value) return
  if (packetReplayPlaying.value) {
    packetReplayPlaying.value = false
    packetReplayPaused.value = true
    cancelPacketReplayQueue()
    return
  }

  if (
    packetReplayTimingMode.value === 'timeline' &&
    flowAnimationEnabled.value &&
    packetReplayEvents.value.length > 0 &&
    !packetReplayFlowResolved.value
  ) {
    const preparationGeneration = ++packetReplayPreparationGeneration
    packetReplayPreparing.value = true
    packetReplayStatus.value = `Calculating packet paths for ${packetReplayEvents.value.length.toLocaleString()} recorded packets...`
    try {
      await rebuildPacketReplayFlow(packetReplayEvents.value)
    } finally {
      if (preparationGeneration === packetReplayPreparationGeneration) {
        packetReplayPreparing.value = false
      }
    }
    if (preparationGeneration !== packetReplayPreparationGeneration) return
  }
  const events = packetReplayTimingMode.value === 'timeline'
    ? ensureTimelinePacketReplayEvents()
    : packetReplayEvents.value
  if (!events.length) return

  if (packetReplayIndex.value >= events.length) {
    packetReplayIndex.value = 0
  }
  cancelPacketReplayQueue()
  packetReplayTimelineCursorMs.value = undefined
  packetReplayPaused.value = false
  packetReplayPlaying.value = true
  playNextPacketReplayEvent()
}

function stopPacketReplay() {
  packetReplayPreparationGeneration += 1
  packetReplayPreparing.value = false
  packetReplayPlaying.value = false
  packetReplayPaused.value = false
  cancelPacketReplayQueue()
  packetReplayIndex.value = 0
  packetReplayPlaylist.value = []
  packetReplayFlowPath.value = []
  packetReplayFlowSegments.value = []
  packetReplayPathSteps.value = []
  packetReplayPathByFlowKey.clear()
  clearPacketReplayPathCaches()
  packetReplayFlowResolved.value = false
  resetLiveFlowState()
  packetReplayTimelineCursorMs.value = undefined
  clearReplayFlash()
  refreshDisplayGraph()
}

function cancelPacketReplayQueue() {
  packetReplayGeneration += 1
  clearPacketReplayTimers()
}

function clearPacketReplayTimers() {
  if (packetReplayTimerId !== undefined) {
    window.clearTimeout(packetReplayTimerId)
    packetReplayTimerId = undefined
  }
}

function scheduleNextPacketReplay(callback: () => void, delayMs: number) {
  const generation = packetReplayGeneration
  packetReplayTimerId = window.setTimeout(() => {
    packetReplayTimerId = undefined
    if (generation !== packetReplayGeneration || !packetReplayPlaying.value) return
    callback()
  }, Math.max(0, delayMs))
}

function clearPacketReplay() {
  if (packetRecordingEnabled.value) return
  stopPacketReplay()
  packetReplayIndex.value = 0
  packetReplayTimelineCursorMs.value = undefined
  packetReplayEvents.value = []
  recordedPacketCount.value = 0
  packetReplayPlaylist.value = []
  packetReplayFlowPath.value = []
  packetReplayFlowSegments.value = []
  packetReplayPathSteps.value = []
  packetReplayPathByFlowKey.clear()
  clearPacketReplayPathCaches()
  packetReplayFlowResolved.value = false
  resetLiveFlowState()
  packetReplayStatus.value = 'Submit a filter, then record live packets for replay.'
  refreshDisplayGraph()
}

async function handleLivePacket(packet: EmulatorTopologyPacketReplayEvent) {
  if (
    !trafficCaptureActive.value ||
    packetReplayPlaying.value ||
    packetReplayPaused.value
  ) {
    return
  }

  if (isPageHidden()) {
    suspendLiveVisualization()
    return
  }

  const now = Date.now()
  if (lastLivePacketReceivedAtMs > 0 && now - lastLivePacketReceivedAtMs > LIVE_FLOW_IDLE_RESET_MS) {
    resetLiveFlowState()
    clearLivePacketAnimationQueues()
  }
  lastLivePacketReceivedAtMs = now
  scheduleLiveFlowIdleReset()

  const remappedPacket = remapEmulatorTopologyPacketReplayEvent(packet, containers.value, networks.value)
  const flowKey = getLiveFlowKey(remappedPacket)
  if (flowKey) {
    liveFlowLastSeenAtMs.set(flowKey, now)
  }
  if (flowAnimationEnabled.value) {
    pruneStaleLiveFlows(now)
  }

  if (flowAnimationEnabled.value && !shouldSkipLivePacketAnimation(remappedPacket)) {
    await updateLiveFlowPathIfNeeded(remappedPacket)
  }

  if (packetRecordingEnabled.value) {
    packetReplayEvents.value.push(remappedPacket)
    const reachedRecordingLimit = packetReplayEvents.value.length >= MAX_RECORDED_PACKET_EVENTS
    const shouldUpdateRecordingUi = reachedRecordingLimit || now - lastRecordingUiUpdateAtMs >= RECORDING_UI_UPDATE_INTERVAL_MS
    if (shouldUpdateRecordingUi) {
      lastRecordingUiUpdateAtMs = now
      recordedPacketCount.value = packetReplayEvents.value.length
      packetReplayIndex.value = recordedPacketCount.value
    }
    if (reachedRecordingLimit) {
      packetRecordingEnabled.value = false
      packetReplayIndex.value = 0
      packetReplayTimelineCursorMs.value = undefined
      packetReplayStatus.value = `Recording stopped at the ${MAX_RECORDED_PACKET_EVENTS.toLocaleString()} packet limit. Clear the recording before starting again.`
      ElMessage.warning({
        message: `Recording reached the ${MAX_RECORDED_PACKET_EVENTS.toLocaleString()} packet limit and was stopped.`,
        duration: 15_000,
        showClose: true,
      })
    } else if (shouldUpdateRecordingUi) {
      packetReplayStatus.value = flowAnimationEnabled.value
        ? `Recording live flow: ${liveFlowPath.value.length.toLocaleString()} flow steps from ${recordedPacketCount.value.toLocaleString()} packets.`
        : `Recording live packets: ${recordedPacketCount.value.toLocaleString()} captured.`
    }
  } else {
    packetReplayStatus.value = flowAnimationEnabled.value
      ? `Live capture active. Click record to save packets for replay. Current live flow has ${liveFlowPath.value.length.toLocaleString()} steps.`
      : 'Live capture active. Click record to save packets for replay.'
  }

  playLivePacketAnimation(remappedPacket)
}

function resetLiveFlowState() {
  liveFlowAnalysisGeneration += 1
  clearLiveFlowIdleResetTimer()
  liveFlowObservationSignatures.clear()
  liveFlowLastSeenAtMs.clear()
  liveFlowEvents.value = []
  liveFlowPath.value = []
  liveFlowSegments.value = []
  liveFlowPathSteps.value = []
  liveFlowAnalysisPending = false
  consecutiveLiveFlowFailures = 0
  liveFlowFailureStartedAtMs = 0
}

async function rebuildLiveFlowFromEvents() {
  if (liveFlowAnalysisRunning) {
    liveFlowAnalysisPending = true
    return
  }
  liveFlowAnalysisRunning = true
  try {
    do {
      liveFlowAnalysisPending = false
      await runLiveFlowAnalysis()
    } while (liveFlowAnalysisPending && flowAnimationEnabled.value)
  } finally {
    liveFlowAnalysisRunning = false
  }
}

async function runLiveFlowAnalysis() {
  if (!liveFlowEvents.value.length) {
    liveFlowPath.value = []
    liveFlowSegments.value = []
    liveFlowPathSteps.value = []
    refreshDisplayGraph()
    return
  }

  const generation = ++liveFlowAnalysisGeneration
  const result = await packetFlowWorker.analyze(liveFlowEvents.value, {
    appendDestinationEndpoint: false,
    topologyEdges: packetFlowTopologyEdges.value,
  }, LIVE_FLOW_ANALYSIS_TIMEOUT_MS)
  if (generation !== liveFlowAnalysisGeneration) return
  if (result.status === 'unresolved') {
    liveFlowPath.value = []
    liveFlowSegments.value = []
    liveFlowPathSteps.value = []
    refreshDisplayGraph()
    recordLiveFlowFailure(result.reason)
    return
  }

  const liveAnalysis = result.analysis
  const liveSegments = buildLiveFlowSegmentsWithObservedDestinations(liveAnalysis.pathSteps)
  if (!liveSegments.length) {
    recordLiveFlowFailure('The computed path did not match its source, destination, or topology links.')
    return
  }
  consecutiveLiveFlowFailures = 0
  liveFlowFailureStartedAtMs = 0
  logComputedPacketFlowPath('live', liveSegments)
  liveFlowPath.value = uniquePathNodes(liveSegments.flat())
  liveFlowSegments.value = liveSegments
  liveFlowPathSteps.value = liveAnalysis.pathSteps
  refreshDisplayGraph()
}

function recordLiveFlowFailure(reason: string) {
  if (!flowAnimationEnabled.value) return
  const now = Date.now()
  if (consecutiveLiveFlowFailures === 0) liveFlowFailureStartedAtMs = now
  consecutiveLiveFlowFailures += 1
  if (
    consecutiveLiveFlowFailures < MAX_CONSECUTIVE_FLOW_FAILURES ||
    now - liveFlowFailureStartedAtMs < FLOW_FAILURE_GRACE_MS
  ) return

  flowAnimationEnabled.value = false
  clearLivePacketAnimationQueues()
  globeRef.value?.clearPacketAnimations()
  packetReplayStatus.value = 'Flow animation was disabled after repeated path-analysis failures. Live packets will use node highlights.'
  ElMessage.warning({
    message: `Flow animation was disabled because packet paths could not be resolved repeatedly. ${reason}`,
    duration: 15_000,
    showClose: true,
  })
}

function pruneStaleLiveFlows(nowMs: number) {
  const staleFlowKeys = Array.from(liveFlowLastSeenAtMs.entries())
    .filter(([, lastSeenAtMs]) => nowMs - lastSeenAtMs > LIVE_FLOW_STALE_MS)
    .map(([flowKey]) => flowKey)

  if (staleFlowKeys.length === 0) return

  staleFlowKeys.forEach((flowKey) => {
    liveFlowLastSeenAtMs.delete(flowKey)
    Array.from(liveFlowObservationSignatures.keys())
      .filter((observationKey) => observationKey.startsWith(`${flowKey}|`))
      .forEach((observationKey) => liveFlowObservationSignatures.delete(observationKey))
  })

  const staleFlowKeySet = new Set(staleFlowKeys)
  const nextEvents = liveFlowEvents.value.filter((event) => !staleFlowKeySet.has(getLiveFlowKey(event)))
  if (nextEvents.length === liveFlowEvents.value.length) return

  liveFlowEvents.value = nextEvents
  void rebuildLiveFlowFromEvents()
}

function scheduleLiveFlowIdleReset() {
  clearLiveFlowIdleResetTimer()
  liveFlowIdleTimerId = window.setTimeout(() => {
    liveFlowIdleTimerId = undefined
    if (!trafficCaptureActive.value) return
    if (lastLivePacketReceivedAtMs <= 0) return
    if (Date.now() - lastLivePacketReceivedAtMs < LIVE_FLOW_IDLE_RESET_MS) {
      scheduleLiveFlowIdleReset()
      return
    }

    resetLiveFlowState()
    clearReplayFlash()
    lastLivePacketReceivedAtMs = 0
    packetReplayStatus.value = packetRecordingEnabled.value
      ? `Recording paused at ${packetReplayEvents.value.length.toLocaleString()} packets.`
      : 'Live capture active. Waiting for packets...'
    refreshDisplayGraph()
  }, LIVE_FLOW_IDLE_RESET_MS)
}

function clearLiveFlowIdleResetTimer() {
  if (liveFlowIdleTimerId === undefined) return
  window.clearTimeout(liveFlowIdleTimerId)
  liveFlowIdleTimerId = undefined
}

async function updateLiveFlowPathIfNeeded(event: EmulatorTopologyPacketReplayEvent) {
  const observationKey = getLiveFlowObservationKey(event)
  const observationSignature = getLiveFlowObservationSignature(event)
  if (!observationKey || !observationSignature) return false
  const signatureUnchanged = liveFlowObservationSignatures.get(observationKey) === observationSignature
  if (signatureUnchanged && canReuseLiveFlowPathForPacket(event)) return false

  liveFlowObservationSignatures.set(observationKey, observationSignature)
  liveFlowEvents.value.push(event)
  await rebuildLiveFlowFromEvents()
  return true
}

function canReuseLiveFlowPathForPacket(event: EmulatorTopologyPacketReplayEvent) {
  const completePath = getCompleteLiveFlowPathForPacket(event)
  if (!completePath.length) return false
  return getPacketLocalPathFromCompletePath(event, completePath).length > 1
}

function getLiveFlowObservationKey(event: EmulatorTopologyPacketReplayEvent) {
  return [
    getLiveFlowKey(event),
    makeObservationPart(event.containerName, event.containerId, event.nodeLabel, event.nodeName, event.nodeIp),
    makeObservationPart(event.networkId, event.networkName, event.networkLabel, event.ifName),
  ].join('|')
}

function getLiveFlowObservationSignature(event: EmulatorTopologyPacketReplayEvent) {
  return [
    getLiveFlowKey(event),
    event.containerId,
    event.containerName,
    event.ifName,
    event.nodeLabel,
    event.nodeName,
    event.nodeIp,
    event.networkId,
    event.networkName,
    event.networkLabel,
    event.sourceIp,
    event.destIp,
    event.ipProtocol,
    event.ipProtocolNumber,
    event.sourcePort,
    event.destPort,
    event.packetRole,
    event.packetKind,
    event.sourceContainerId,
    event.sourceContainerName,
    event.sourceNodeName,
    event.sourceNodeIp,
    event.destContainerId,
    event.destContainerName,
    event.destNodeName,
    event.destNodeIp,
  ].map((value) => String(value ?? '')).join('|')
}

function getLiveFlowKey(event: EmulatorTopologyPacketReplayEvent) {
  if (event.flowId) return event.flowId
  const protocol = (event.ipProtocol || String(event.ipProtocolNumber ?? '') || 'unknown').toLowerCase()
  const sourceEndpoint = makeLiveEndpointKey(event.sourceIp, event.sourcePort)
  const destEndpoint = makeLiveEndpointKey(event.destIp, event.destPort)
  if (!sourceEndpoint && !destEndpoint) {
    return `${protocol}|${event.containerId}`
  }
  return `${protocol}|${sourceEndpoint}|${destEndpoint}`
}

function getReplayAnalysisFlowKey(event: EmulatorTopologyPacketReplayEvent) {
  const protocol = (event.ipProtocol || String(event.ipProtocolNumber ?? '') || 'unknown').toLowerCase()
  const sourceEndpoint = makeLiveEndpointKey(event.sourceIp, event.sourcePort)
  const destEndpoint = makeLiveEndpointKey(event.destIp, event.destPort)
  if (!sourceEndpoint && !destEndpoint) {
    return `${protocol}|${event.containerId}`
  }
  return `${protocol}|${sourceEndpoint}|${destEndpoint}`
}

function getReplayAnalysisObservationKey(event: EmulatorTopologyPacketReplayEvent) {
  return [
    getReplayAnalysisFlowKey(event),
    makeObservationPart(event.containerId, event.containerName, event.nodeName, event.nodeIp, event.nodeLabel),
    makeObservationPart(event.networkId, event.networkName, event.networkLabel, event.ifName),
    event.packetRole,
  ].map((value) => String(value ?? '')).join('|')
}

function makeLiveEndpointKey(ip: string | undefined, port: number | undefined) {
  return `${ip || ''}:${port ?? 0}`
}

function makeObservationPart(...values: Array<string | number | undefined>) {
  return values
    .map((value) => String(value ?? '').trim())
    .filter(Boolean)
    .join('/')
}

function playNextPacketReplayWindow() {
  const events = packetReplayEvents.value
  if (!events.length || packetReplayIndex.value >= events.length) {
    packetReplayPlaying.value = false
    packetReplayPaused.value = false
    packetReplayTimelineCursorMs.value = undefined
    return
  }

  const windowMs = Math.max(1, packetReplayTimelineWindowMs.value)
  const startIndex = Math.max(0, packetReplayIndex.value)
  const startMs = getPacketTimestampMs(events[startIndex]!)
  const endMs = startMs + windowMs
  let nextIndex = findTimelineWindowEndIndex(events, startIndex, endMs)
  const visualIndexes = new Map<string, number>()

  const visualScanEndIndex = Math.min(
    nextIndex,
    startIndex + MAX_TIMELINE_VISUAL_SCAN_PER_WINDOW,
  )
  for (
    let visualIndex = startIndex;
    visualIndex < visualScanEndIndex && visualIndexes.size < MAX_TIMELINE_VISUALS_PER_WINDOW;
    visualIndex += 1
  ) {
    const event = events[visualIndex]!
    visualIndexes.set(getReplayAnalysisObservationKey(event), visualIndex)
  }
  if (nextIndex === startIndex) {
    const event = events[nextIndex]!
    visualIndexes.set(getReplayAnalysisObservationKey(event), nextIndex)
    nextIndex += 1
  }

  packetReplayIndex.value = nextIndex
  const currentWindowEndMs = getPacketTimestampMs(events[nextIndex - 1]!)
  const safeSpeed = Math.max(0.0001, packetReplayTimelineSpeed.value)
  const windowVisualDurationMs = Math.max(
    MIN_PACKET_VISUAL_DURATION_MS,
    (currentWindowEndMs - startMs) / safeSpeed,
  )
  visualIndexes.forEach((packetIndex) => {
    playPacketReplayPacketAtIndex(packetIndex, windowVisualDurationMs)
  })
  const nextWindowStartMs = nextIndex < events.length ? getPacketTimestampMs(events[nextIndex]!) : endMs
  packetReplayTimelineCursorMs.value = nextIndex < events.length ? nextWindowStartMs : undefined

  scheduleNextPacketReplay(
    playNextPacketReplayEvent,
    Math.max(
      MIN_REPLAY_TIMER_DELAY_MS,
      nextIndex < events.length
        ? (nextWindowStartMs - currentWindowEndMs) / safeSpeed
        : windowVisualDurationMs,
    ),
  )
}

function findTimelineWindowEndIndex(
  events: EmulatorTopologyPacketReplayEvent[],
  startIndex: number,
  endMs: number,
) {
  let low = startIndex
  let high = events.length
  while (low < high) {
    const middle = low + Math.floor((high - low) / 2)
    if (getPacketTimestampMs(events[middle]!) <= endMs) {
      low = middle + 1
    } else {
      high = middle
    }
  }
  return low
}

function playLivePacketAnimation(event: EmulatorTopologyPacketReplayEvent) {
  if (shouldSkipLivePacketAnimation(event)) return

  if (!flowAnimationEnabled.value) {
    enqueueLivePacketAnimation(event, getCapturedPacketNodePath(event), 'highlight')
    return
  }

  const completePath = getCompleteLiveFlowPathForPacket(event)
  if (!completePath.length) {
    enqueueLivePacketAnimation(event, getCapturedPacketNodePath(event), 'highlight')
    return
  }

  const localPath = getPacketLocalPathFromCompletePath(event, completePath)
  if (localPath.length > 1) {
    enqueueLivePacketAnimation(event, localPath, 'path')
  } else {
    enqueueLivePacketAnimation(event, getCapturedPacketNodePath(event), 'highlight')
  }
}

function enqueueLivePacketAnimation(
  event: EmulatorTopologyPacketReplayEvent,
  pathNodeIds: string[],
  mode: LivePacketAnimationJob['mode'],
) {
  if (!trafficCaptureActive.value) return
  const normalizedPath = getExistingLinkPath(pathNodeIds)
  if (mode === 'path' && normalizedPath.length < 2) return

  const queuedPath = mode === 'path' ? normalizedPath : uniquePathNodes(pathNodeIds)
  if (!queuedPath.length) return

  livePacketAnimationQueue.push({ event, pathNodeIds: queuedPath, mode })
  if (livePacketAnimationQueue.length > LIVE_PACKET_ANIMATION_QUEUE_LIMIT) {
    livePacketAnimationQueue.splice(0, livePacketAnimationQueue.length - LIVE_PACKET_ANIMATION_QUEUE_LIMIT)
  }
}

function startLivePacketFlasher() {
  if (livePacketFlasherTimerId !== undefined) return
  livePacketFlasherTimerId = window.setInterval(() => {
    flashNextLivePacketAnimation()
  }, LIVE_PACKET_FLASH_INTERVAL_MS)
}

function stopLivePacketFlasher() {
  if (livePacketFlasherTimerId === undefined) return
  window.clearInterval(livePacketFlasherTimerId)
  livePacketFlasherTimerId = undefined
}

function flashNextLivePacketAnimation() {
  if (!trafficCaptureActive.value) {
    clearLivePacketAnimationQueues()
    return
  }

  const flashingJobs = livePacketAnimationQueue.splice(0)
  if (flashingJobs.length === 0) return

  flashLivePacketJobs(flashingJobs)
}

function flashLivePacketJobs(jobs: LivePacketAnimationJob[]) {
  const highlightedNodeIds = new Set<string>()
  const packetPaths: string[][] = []

  jobs.forEach((job) => {
    if (job.mode === 'path' && job.pathNodeIds.length > 1) {
      // logLivePacketPath(job.pathNodeIds, job.event)
      packetPaths.push(job.pathNodeIds)
    } else {
      job.pathNodeIds.forEach((nodeId) => highlightedNodeIds.add(nodeId))
    }
  })

  if (highlightedNodeIds.size > 0) {
    globeRef.value?.flashNodes(Array.from(highlightedNodeIds), LIVE_PACKET_FLASH_DURATION_MS)
  }

  if (packetPaths.length > 0) {
    globeRef.value?.animatePacketPaths(packetPaths, LIVE_PACKET_FLASH_DURATION_MS, LIVE_PACKET_HOP_DELAY_MS)
  }
}

function clearLivePacketAnimationQueues() {
  livePacketAnimationQueue.splice(0)
}

// function logLivePacketPath(pathNodeIds: string[], event: EmulatorTopologyPacketReplayEvent) {
//   if (!import.meta.env.DEV) return
//   console.debug(`[packet live] ${pathNodeIds.map(getGraphNodeLabel).join(' -> ')}`, {
//     protocol: event.ipProtocol || event.ipProtocolNumber || '-',
//     packetRole: event.packetRole || '-',
//     packetKind: event.packetKind || '-',
//     sourceIp: event.sourceIp || '-',
//     destIp: event.destIp || '-',
//   })
// }

function getCompleteLiveFlowPathForPacket(event: EmulatorTopologyPacketReplayEvent) {
  const flowKey = event.flowId
  if (!flowKey) return liveFlowSegments.value[0] ?? []
  const segment = liveFlowSegments.value.find((path) => {
    const destNodeId = resolveGraphNodeId(event.destContainerId, event.destContainerName, event.destNodeName, event.destNodeIp)
    return Boolean(destNodeId && path.includes(destNodeId))
  })
  return segment ?? []
}

function buildLiveFlowSegmentsWithObservedDestinations(steps: PacketFlowPathStep[]) {
  const stepsByFlow = new Map<string, PacketFlowPathStep[]>()
  steps.forEach((step) => {
    const flowSteps = stepsByFlow.get(step.flowKey) ?? []
    flowSteps.push(step)
    stepsByFlow.set(step.flowKey, flowSteps)
  })

  return Array.from(stepsByFlow.values())
    .map((flowSteps) => {
      const event = flowSteps[flowSteps.length - 1]?.event
      const path = appendObservedDestinationEndpoint(pathFromLiveFlowSteps(flowSteps), event)
      return event && isCompleteGraphFlowPath(path, event) ? path : []
    })
    .filter((segment) => segment.length > 0)
}

function pathFromLiveFlowSteps(steps: PacketFlowPathStep[]) {
  const nodeIds: string[] = []
  steps.forEach((step) => {
    if (step.previousNodeId && !nodeIds.includes(step.previousNodeId)) {
      nodeIds.push(step.previousNodeId)
    }
    if (!nodeIds.includes(step.nodeId)) {
      nodeIds.push(step.nodeId)
    }
  })
  return nodeIds
}

function appendObservedDestinationEndpoint(pathNodeIds: string[], event: EmulatorTopologyPacketReplayEvent | undefined) {
  if (!event || pathNodeIds.length === 0) return pathNodeIds

  const networkNodeId = resolveGraphNodeId(event.networkId, event.networkName, event.networkLabel)
  const destNodeId = resolveGraphNodeId(event.destContainerId, event.destContainerName, event.destNodeName, event.destNodeIp)
  if (!networkNodeId || !destNodeId || pathNodeIds.includes(destNodeId)) return pathNodeIds
  if (!pathNodeIds.includes(networkNodeId) || !hasGraphEdge(networkNodeId, destNodeId)) return pathNodeIds

  return uniquePathNodes([
    ...pathNodeIds,
    networkNodeId,
    destNodeId,
  ])
}

function hasGraphEdge(leftNodeId: string, rightNodeId: string) {
  return graphEdgeKeys.value.has(makeGraphEdgeKey(leftNodeId, rightNodeId))
}

function makeGraphEdgeKey(leftNodeId: string, rightNodeId: string) {
  return leftNodeId < rightNodeId
    ? `${leftNodeId}\u0000${rightNodeId}`
    : `${rightNodeId}\u0000${leftNodeId}`
}

function isCompleteGraphFlowPath(pathNodeIds: string[], event: EmulatorTopologyPacketReplayEvent) {
  if (pathNodeIds.length < 2) return false
  const sourceNodeId = resolveGraphNodeId(event.sourceContainerId, event.sourceContainerName, event.sourceNodeName, event.sourceNodeIp)
  const destNodeId = resolveGraphNodeId(event.destContainerId, event.destContainerName, event.destNodeName, event.destNodeIp)
  if (!sourceNodeId || !destNodeId) return false
  if (pathNodeIds[0] !== sourceNodeId || pathNodeIds[pathNodeIds.length - 1] !== destNodeId) return false
  return pathNodeIds.every((nodeId, index) => index === 0 || hasGraphEdge(pathNodeIds[index - 1]!, nodeId))
}

function areComputedFlowSegmentsValid(
  segments: string[][],
  events: EmulatorTopologyPacketReplayEvent[],
) {
  const forwardEvents = events.filter((event) => !(
    event.ipProtocol?.toLowerCase() === 'icmp' && event.packetRole?.toLowerCase() === 'reply'
  ))
  return segments.length > 0 && segments.every((segment) =>
    forwardEvents.some((event) => isCompleteGraphFlowPath(segment, event)),
  )
}

function getPacketLocalPathFromCompletePath(
  event: EmulatorTopologyPacketReplayEvent,
  completePath: string[],
) {
  const containerNodeId = resolveGraphNodeId(event.containerId, event.containerName, event.nodeName, event.nodeIp, event.nodeLabel)
  const networkNodeId = resolveGraphNodeId(event.networkId, event.networkName, event.networkLabel)
  if (!containerNodeId || !networkNodeId) return []

  const networkIndex = completePath.indexOf(networkNodeId)
  const containerIndex = completePath.indexOf(containerNodeId)
  if (networkIndex < 0 || containerIndex < 0) return []

  if (containerIndex === networkIndex - 1) {
    const nextNodeId = completePath[networkIndex + 1]
    return getExistingLinkPath([containerNodeId, networkNodeId, nextNodeId])
  }

  if (containerIndex === networkIndex + 1) {
    const previousNodeId = completePath[networkIndex - 1]
    return getExistingLinkPath([previousNodeId, networkNodeId, containerNodeId])
  }

  return []
}

function getExistingLinkPath(nodeIds: Array<string | undefined>) {
  const path = uniquePathNodes(nodeIds.filter(Boolean) as string[])
  if (path.length < 2) return []
  for (let index = 1; index < path.length; index += 1) {
    if (!hasGraphEdge(path[index - 1]!, path[index]!)) return []
  }
  return path
}

function getCapturedPacketNodePath(event: EmulatorTopologyPacketReplayEvent) {
  const containerNodeId = resolveGraphNodeId(event.containerId, event.containerName, event.nodeName, event.nodeIp, event.nodeLabel)
  const networkNodeId = resolveGraphNodeId(event.networkId, event.networkName, event.networkLabel)
  const destNodeId = resolveGraphNodeId(
    event.destContainerId,
    event.destContainerName,
    event.destNodeName,
    event.destNodeIp,
    event.destIp,
  )
  return uniquePathNodes([containerNodeId, networkNodeId, destNodeId].filter(Boolean) as string[])
}

function shouldSkipLivePacketAnimation(event: EmulatorTopologyPacketReplayEvent) {
  return event.ipProtocol?.toLowerCase() === 'icmp' && event.packetRole?.toLowerCase() === 'reply'
}

function logPacketReplayHop(_fromNodeId: string, _toNodeId: string, _event: EmulatorTopologyPacketReplayEvent) {
  // console.log(
  //   `[packet replay] ${getGraphNodeLabel(fromNodeId)} -> ${getGraphNodeLabel(toNodeId)}`,
  //   {
  //     fromNodeId,
  //     toNodeId,
  //     protocol: event.ipProtocol || event.ipProtocolNumber || '-',
  //     packetRole: event.packetRole || '-',
  //     packetKind: event.packetKind || '-',
  //     sourceIp: event.sourceIp || '-',
  //     destIp: event.destIp || '-',
  //   },
  // )
}

function getGraphNodeLabel(nodeId: string) {
  const normalizedNodeId = nodeId.trim().toLowerCase()
  const node = baseGraph.value.nodes.find((item) =>
    item.id.toLowerCase() === normalizedNodeId ||
    item.sourceId?.toLowerCase() === normalizedNodeId ||
    item.label.toLowerCase() === normalizedNodeId ||
    item.searchText?.toLowerCase().includes(normalizedNodeId),
  )
  return node?.label || nodeId
}

function logComputedPacketFlowPath(source: 'live' | 'replay', segments: string[][]) {
  if (!import.meta.env.DEV) return
  const labeledSegments = segments.map((segment) => segment.map(getGraphNodeLabel))
  console.debug(`[packet flow path:${source}]`, labeledSegments.map((segment) => segment.join(' -> ')))
}

function playPacketReplayPacket(position: number) {
  playPacketReplayPacketAtIndex(Math.max(0, position - 1))
}

function playPacketReplayIntervalEvent(position: number) {
  const packetIndex = Math.max(0, position - 1)
  const event = packetReplayEvents.value[packetIndex]
  if (!event) return
  flashPacketReplayEventNodes(event, packetIndex)
}

function playPacketReplayPacketAtIndex(packetIndex: number, visualDurationMs?: number) {
  const event = packetReplayEvents.value[packetIndex]
  if (!event) return

  if (!flowAnimationEnabled.value) {
    flashPacketReplayEventNodes(event, packetIndex, visualDurationMs)
    return
  }
  if (!packetReplayFlowResolved.value) {
    flashPacketReplayEventNodes(event, packetIndex, visualDurationMs)
    return
  }

  const observationKey = getReplayAnalysisObservationKey(event)
  let localPath = packetReplayAnimatedPathCache.get(observationKey)
  if (!localPath) {
    const completePath = packetReplayPathByFlowKey.get(getReplayAnalysisFlowKey(event))
    localPath = completePath ? getPacketLocalPathFromCompletePath(event, completePath) : []
    packetReplayAnimatedPathCache.set(observationKey, localPath)
  }
  if (localPath.length > 1) {
    playPacketDirectPath(event, localPath, packetIndex, visualDurationMs)
    return
  }

  const directPath = getPacketDirectPath(event)
  if (directPath.length === 0) return

  playPacketDirectPath(event, directPath, packetIndex, visualDurationMs)
}

function playPacketDirectPath(
  event: EmulatorTopologyPacketReplayEvent,
  pathNodeIds: string[],
  packetIndex: number,
  visualDurationMs = getCurrentReplayVisualDurationMs(packetIndex + 1),
) {
  const stepCount = Math.max(1, pathNodeIds.length - 1)
  const stepDelayMs = Math.max(1, visualDurationMs / Math.max(2, stepCount + 1))

  if (pathNodeIds.length === 1) {
    const nodeId = pathNodeIds[0]!
    console.log(`[packet replay] ${getGraphNodeLabel(nodeId)}`, {
      nodeId,
      protocol: event.ipProtocol || event.ipProtocolNumber || '-',
      packetRole: event.packetRole || '-',
      packetKind: event.packetKind || '-',
      sourceIp: event.sourceIp || '-',
      destIp: event.destIp || '-',
    })
    globeRef.value?.flashNode(nodeId, Math.min(1200, Math.max(16, visualDurationMs * 0.65)))
    return
  }

  for (let index = 1; index < pathNodeIds.length; index += 1) {
    logPacketReplayHop(pathNodeIds[index - 1]!, pathNodeIds[index]!, event)
  }
  globeRef.value?.animatePacketPath(
    pathNodeIds,
    Math.max(1, visualDurationMs),
    stepDelayMs,
  )
}

function getPacketDirectPath(event: EmulatorTopologyPacketReplayEvent) {
  const key = getReplayAnalysisObservationKey(event)
  const cached = packetReplayDirectPathCache.get(key)
  if (cached) return cached
  const path = uniquePathNodes([
    resolveGraphNodeId(event.sourceContainerId, event.sourceContainerName, event.sourceNodeName, event.sourceNodeIp),
    resolveGraphNodeId(event.networkId, event.networkName, event.networkLabel),
    resolveGraphNodeId(event.destContainerId, event.destContainerName, event.destNodeName, event.destNodeIp),
  ].filter(Boolean) as string[])
  packetReplayDirectPathCache.set(key, path)
  return path
}

function clearPacketReplayPathCaches() {
  packetReplayDirectPathCache.clear()
  packetReplayAnimatedPathCache.clear()
}

function flashPacketReplayEventNodes(
  event: EmulatorTopologyPacketReplayEvent,
  packetIndex: number,
  visualDurationMs = getCurrentReplayVisualDurationMs(packetIndex + 1),
) {
  const nodeIds = getPacketDirectPath(event)
  if (!nodeIds.length) return
  globeRef.value?.flashNodes(
    nodeIds,
    Math.min(1200, Math.max(16, visualDurationMs * 0.65)),
  )
}

function uniquePathNodes(nodeIds: string[]) {
  return nodeIds.filter((nodeId, index) => index === 0 || nodeIds[index - 1] !== nodeId)
}

function resolveGraphNodeId(...candidates: Array<string | undefined>) {
  for (const candidate of candidates) {
    const normalizedCandidate = candidate?.trim().toLowerCase()
    if (!normalizedCandidate) continue

    const exactNodeId = graphNodeIdByAlias.value.get(normalizedCandidate)
    if (exactNodeId) return exactNodeId

    const searchable = graphSearchEntries.value.find((node) => node.searchText.includes(normalizedCandidate))
    if (searchable) return searchable.id
  }

  return undefined
}

function getNextPacketReplayDelayMs(currentPosition: number) {
  if (packetReplayTimingMode.value === 'interval') {
    return packetReplayIntervalMs.value
  }
  if (packetReplayTimingMode.value === 'timeline') {
    if (isTimelineSpeedMode()) {
      const current = packetReplayEvents.value[currentPosition - 1]
      const next = packetReplayEvents.value[currentPosition]
      if (!current || !next) return 0
      return Math.max(MIN_REPLAY_TIMER_DELAY_MS, getSpeedAdjustedPacketDurationMs(current, next, packetReplayTimelineSpeed.value))
    }
    return Math.max(
      MIN_REPLAY_TIMER_DELAY_MS,
      Math.max(1, packetReplayTimelineWindowMs.value) / Math.max(0.0001, packetReplayTimelineSpeed.value),
    )
  }

  const current = packetReplayPlaylist.value[currentPosition - 1]
  const next = packetReplayPlaylist.value[currentPosition]
  if (!current || !next) {
    return 0
  }

  return Math.max(MIN_REPLAY_TIMER_DELAY_MS, getSpeedAdjustedPacketDurationMs(current, next, packetReplayTimelineSpeed.value))
}

function getCurrentReplayVisualDurationMs(position: number) {
  if (packetReplayTimingMode.value === 'interval') {
    return packetReplayIntervalMs.value
  }
  if (packetReplayTimingMode.value === 'timeline') {
    if (isTimelineSpeedMode()) {
      const previous = packetReplayEvents.value[Math.max(0, position - 2)]
      const current = packetReplayEvents.value[Math.max(0, position - 1)]
      if (!previous || !current) {
        return Math.min(650, Math.max(120, packetReplayIntervalMs.value))
      }
      return Math.max(MIN_PACKET_VISUAL_DURATION_MS, getSpeedAdjustedPacketDurationMs(previous, current, packetReplayTimelineSpeed.value))
    }
    return Math.max(
      MIN_PACKET_VISUAL_DURATION_MS,
      Math.max(1, packetReplayTimelineWindowMs.value) / Math.max(0.0001, packetReplayTimelineSpeed.value),
    )
  }

  const currentIndex = Math.max(0, position - 1)
  const previous = packetReplayPlaylist.value[Math.max(0, currentIndex - 1)]
  const current = packetReplayPlaylist.value[currentIndex]
  if (!previous || !current) {
    return Math.min(650, Math.max(120, packetReplayIntervalMs.value))
  }

  return Math.max(MIN_PACKET_VISUAL_DURATION_MS, getSpeedAdjustedPacketDurationMs(previous, current, packetReplayTimelineSpeed.value))
}

function getSpeedAdjustedPacketDurationMs(
  previous: EmulatorTopologyPacketReplayEvent,
  current: EmulatorTopologyPacketReplayEvent,
  speed: number,
) {
  const rawDeltaMs = Math.max(0, getPacketTimestampMs(current) - getPacketTimestampMs(previous))
  return rawDeltaMs / Math.max(0.0001, speed)
}

function isTimelineSpeedMode() {
  return packetReplayTimingMode.value === 'timeline' && packetReplayTimelineWindowMs.value <= 0
}

function getPacketTimestampMs(event: EmulatorTopologyPacketReplayEvent) {
  if (event.timestampNs !== undefined) {
    const timestampNs = Number(event.timestampNs)
    if (Number.isFinite(timestampNs)) {
      return timestampNs / 1_000_000
    }
  }
  return event.timestampMs
}

async function rebuildPacketReplayFlow(events: EmulatorTopologyPacketReplayEvent[]) {
  pendingPacketReplayEvents = events
  if (packetReplayFlowAnalysisRunning) {
    packetReplayFlowAnalysisPending = true
    return packetReplayFlowAnalysisPromise
  }
  packetReplayFlowAnalysisRunning = true
  packetReplayFlowAnalysisPromise = (async () => {
    do {
      packetReplayFlowAnalysisPending = false
      await runPacketReplayFlowAnalysis(pendingPacketReplayEvents)
    } while (packetReplayFlowAnalysisPending && flowAnimationEnabled.value)
  })()
  try {
    await packetReplayFlowAnalysisPromise
  } finally {
    packetReplayFlowAnalysisRunning = false
    packetReplayFlowAnalysisPromise = undefined
  }
}

async function runPacketReplayFlowAnalysis(events: EmulatorTopologyPacketReplayEvent[]) {
  const generation = ++packetReplayFlowAnalysisGeneration
  const result = await packetFlowWorker.analyze(events, {
    topologyEdges: packetFlowTopologyEdges.value,
    compactObservations: true,
  }, REPLAY_FLOW_ANALYSIS_TIMEOUT_MS)
  if (generation !== packetReplayFlowAnalysisGeneration) return
  if (result.status === 'unresolved') {
    packetReplayPlaylist.value = events
    packetReplayFlowPath.value = []
    packetReplayFlowSegments.value = []
    packetReplayPathSteps.value = []
    packetReplayPathByFlowKey.clear()
    clearPacketReplayPathCaches()
    packetReplayFlowResolved.value = false
    packetReplayStatus.value = `${result.reason} Replaying packets with node highlights only.`
    refreshDisplayGraph()
    return
  }

  const analysis = result.analysis
  if (!areComputedFlowSegmentsValid(analysis.pathSegments, analysis.events)) {
    packetReplayPlaylist.value = events
    packetReplayFlowPath.value = []
    packetReplayFlowSegments.value = []
    packetReplayPathSteps.value = []
    packetReplayPathByFlowKey.clear()
    clearPacketReplayPathCaches()
    packetReplayFlowResolved.value = false
    packetReplayStatus.value = 'Computed flow did not match its source, destination, or topology links. Replaying packets with node highlights only.'
    refreshDisplayGraph()
    return
  }
  logComputedPacketFlowPath('replay', analysis.pathSegments)
  packetReplayPlaylist.value = analysis.pathEvents
  packetReplayFlowPath.value = analysis.nodePath
  packetReplayFlowSegments.value = analysis.pathSegments
  packetReplayPathSteps.value = analysis.pathSteps
  packetReplayPathByFlowKey.clear()
  clearPacketReplayPathCaches()
  analysis.pathSteps.forEach((step) => {
    const path = packetReplayPathByFlowKey.get(step.flowKey) ?? []
    if (path[path.length - 1] !== step.nodeId) path.push(step.nodeId)
    packetReplayPathByFlowKey.set(step.flowKey, path)
  })
  packetReplayFlowResolved.value = true
  refreshDisplayGraph()
}

function ensureTimelinePacketReplayEvents() {
  const events = packetReplayEvents.value
  const alreadySorted = events.every((event, index) => (
    index === 0 || getPacketTimestampMs(events[index - 1]!) <= getPacketTimestampMs(event)
  ))
  if (!alreadySorted) {
    packetReplayEvents.value = [...events].sort((left, right) =>
      getPacketTimestampMs(left) - getPacketTimestampMs(right),
    )
  }
  return packetReplayEvents.value
}

function clearReplayFlash() {
  globeRef.value?.flashNode('', 0)
  globeRef.value?.clearPacketAnimations()
  clearLivePacketAnimationQueues()
}

function isPageHidden() {
  return typeof document !== 'undefined' && document.hidden
}

function suspendLiveVisualization() {
  if (liveVisualizationSuspended) return
  liveVisualizationSuspended = true
  if (packetReplayPlaying.value) {
    packetReplayPlaying.value = false
    cancelPacketReplayQueue()
  }
  resetLiveFlowState()
  clearReplayFlash()
  lastLivePacketReceivedAtMs = 0
  refreshDisplayGraph()
}

function deactivateLiveVisualization() {
  suspendLiveVisualization()
  disconnectTrafficObserver()
}

function resumeLiveVisualization() {
  if (!liveVisualizationSuspended) return
  liveVisualizationSuspended = false
  resetLiveFlowState()
  clearReplayFlash()
  lastLivePacketReceivedAtMs = 0
  if (trafficCaptureActive.value) {
    packetReplayStatus.value = packetRecordingEnabled.value
      ? `Recording paused at ${packetReplayEvents.value.length.toLocaleString()} packets. Waiting for new packets...`
      : 'Live capture active. Waiting for packets...'
    startLivePacketFlasher()
  }
  refreshDisplayGraph()
}

function handleVisibilityChange() {
  if (isPageHidden()) {
    suspendLiveVisualization()
  } else {
    resumeLiveVisualization()
  }
}

function togglePacketRecording() {
  if (!trafficCaptureActive.value || packetReplayPlaying.value || packetReplayPaused.value || packetReplayPreparing.value) return

  if (packetRecordingEnabled.value) {
    packetRecordingEnabled.value = false
    recordedPacketCount.value = packetReplayEvents.value.length
    packetReplayIndex.value = 0
    packetReplayTimelineCursorMs.value = undefined
    packetReplayStatus.value = `Recording paused at ${packetReplayEvents.value.length.toLocaleString()} packets.`
    return
  }

  packetReplayEvents.value = []
  recordedPacketCount.value = 0
  lastRecordingUiUpdateAtMs = 0
  packetReplayFlowAnalysisGeneration += 1
  packetReplayFlowAnalysisPending = false
  packetReplayPlaylist.value = []
  packetReplayFlowPath.value = []
  packetReplayFlowSegments.value = []
  packetReplayPathSteps.value = []
  packetReplayPathByFlowKey.clear()
  clearPacketReplayPathCaches()
  packetReplayFlowResolved.value = false
  packetReplayIndex.value = 0
  packetRecordingEnabled.value = true
  packetReplayStatus.value = 'Recording live packets from now on...'
}

function connectTrafficObserver() {
  if (!trafficObserverClient) {
    trafficObserverClient = new TrafficObserverClient(
      handleLivePacket,
      () => {
        trafficFilterError.value = 'Traffic observer websocket connection failed.'
      },
    )
  }
  startLivePacketFlasher()
  trafficObserverClient.connect()
}

function disconnectTrafficObserver() {
  stopLivePacketFlasher()
  trafficObserverClient?.disconnect()
}

async function loadTrafficFilter() {
  try {
    const response = await fetchTrafficObserverFilter()
    trafficFilterInput.value = response.filter ?? ''
    trafficCaptureActive.value = Boolean(trafficFilterInput.value.trim())
    trafficFilterStatus.value = trafficCaptureActive.value
      ? `Live capture active: ${trafficFilterInput.value}`
      : 'Submit a filter to start live capture.'
    if (trafficCaptureActive.value) connectTrafficObserver()
  } catch {
    trafficFilterStatus.value = 'Traffic filter status unavailable.'
  }
}

async function submitTrafficFilter() {
  trafficFilterSubmitting.value = true
  trafficFilterError.value = ''
  try {
    const filter = trafficFilterInput.value.trim()
    const response = await setTrafficObserverFilter(filter)
    trafficFilterInput.value = response.filter ?? filter
    trafficCaptureActive.value = Boolean(trafficFilterInput.value)
    trafficFilterStatus.value = trafficCaptureActive.value
      ? `Live capture active: ${trafficFilterInput.value}`
      : 'Live capture stopped.'
    if (trafficCaptureActive.value) {
      packetReplayEvents.value = []
      recordedPacketCount.value = 0
      lastRecordingUiUpdateAtMs = 0
      packetReplayPlaylist.value = []
      packetReplayFlowPath.value = []
      packetReplayFlowSegments.value = []
      packetReplayPathSteps.value = []
      packetReplayPathByFlowKey.clear()
      clearPacketReplayPathCaches()
      packetReplayFlowResolved.value = false
      resetLiveFlowState()
      packetReplayIndex.value = 0
      packetRecordingEnabled.value = false
      clearReplayFlash()
      lastLivePacketReceivedAtMs = 0
      packetReplayStatus.value = 'Live capture is active. Click record to save packets for replay.'
      refreshDisplayGraph()
      connectTrafficObserver()
    } else {
      stopPacketReplay()
      packetRecordingEnabled.value = false
      resetLiveFlowState()
      packetReplayFlowResolved.value = false
      clearReplayFlash()
      lastLivePacketReceivedAtMs = 0
      packetReplayStatus.value = 'Submit a filter, then record live packets for replay.'
      refreshDisplayGraph()
      disconnectTrafficObserver()
    }
  } catch (error) {
    trafficFilterError.value = error instanceof Error ? error.message : String(error)
  } finally {
    trafficFilterSubmitting.value = false
  }
}

watch(
  () => [
    visibleTypes.value.ix,
    visibleTypes.value.network,
    visibleTypes.value.router,
    visibleTypes.value.host,
  ],
  () => {
    if (!topologyLoaded.value) return
    selectedNode.value = undefined
  },
)

watch(showOnlyPacketLinks, () => {
  refreshDisplayGraph()
})

watch(flowAnimationEnabled, (enabled) => {
  packetReplayFlowAnalysisGeneration += 1
  packetReplayFlowAnalysisPending = false
  resetLiveFlowState()
  clearLivePacketAnimationQueues()
  if (enabled && !packetRecordingEnabled.value && packetReplayEvents.value.length > 0) {
    void rebuildPacketReplayFlow(packetReplayEvents.value)
  } else {
    packetReplayFlowPath.value = []
    packetReplayFlowSegments.value = []
    packetReplayPathSteps.value = []
    packetReplayPathByFlowKey.clear()
    clearPacketReplayPathCaches()
    packetReplayFlowResolved.value = false
  }
  refreshDisplayGraph()
})

watch(
  () => visibleTypes.value.router,
  (routerVisible) => {
    if (!routerVisible) {
      visibleTypes.value.network = false
    }
  },
)

onBeforeUnmount(() => {
  cancelHoverCardClose()
  document.removeEventListener('visibilitychange', handleVisibilityChange)
  packetFlowWorker.terminate()
  packetRecordingEnabled.value = false
  stopPacketReplay()
  clearReplayFlash()
  disconnectTrafficObserver()
  loadingVisible.value = false
})

onDeactivated(() => {
  deactivateLiveVisualization()
})

onActivated(() => {
  if (!trafficCaptureActive.value) return
  resumeLiveVisualization()
  connectTrafficObserver()
})

onMounted(async () => {
  document.addEventListener('visibilitychange', handleVisibilityChange)
  await nextTick()
  initConsoleWindowManager()
  await Promise.all([
    loadTrafficFilter(),
    loadDockerTopology(),
  ])
})
</script>

<template>
  <main class="emulator-topology-3d-page" data-testid="live-emulator-topology-3d-page">
    <Map3DGlobe
      ref="globeRef"
      :graph="graph"
      :hover-enabled="showHoverDetails"
      :visible-types="visibleTypes"
      :node-scale="nodeScale"
      :show-router-labels="showNodeLabels"
      :show-node-labels="showNodeLabels"
      :expanded-router-parent-ids="expandedParentIds"
      :orient-to-graph="orientToInitialNode"
      :scene-mode="props.sceneMode"
      @rendered="onGlobeRendered"
      @node-click="onNodeClick"
      @node-hover="onNodeHover"
    />
    <TopologyNodeHoverCard
      v-if="showHoverDetails && hoveredNode"
      :node="hoveredNode"
      :position="hoverPosition"
      actions-enabled
      @pointerenter="cancelHoverCardClose"
      @pointerleave="onHoverCardLeave"
      @refresh="loadDockerTopology"
      @launch-console="launchContainerConsole"
    />

    <EmulatorTopologyDock
      v-model:active-page="activeDockPage"
      v-model:selected-asn-values="selectedAsnValues"
      v-model:selected-ix-name-values="selectedIxNameValues"
      v-model:keyword="keyword"
      v-model:visible-types="visibleTypes"
      v-model:node-scale="nodeScale"
      v-model:show-node-labels="showNodeLabels"
      v-model:show-hover-details="showHoverDetails"
      v-model:show-as-details="showAsDetails"
      bottom-offset="58px"
      :title="props.title"
      :stats="stats"
      :as-summaries="asSummaries"
      :ix-summaries="ixSummaries"
      :as-details-by-asn="asDetailsByAsn"
      :selected-asns="selectedAsns"
      :selected-ix-names="selectedIxNames"
      :selected-node-summary="selectedNodeSummary"
      :query-search-suggestions="querySearchSuggestions"
      traffic-mode="live"
      v-model:traffic-filter-input="trafficFilterInput"
      v-model:traffic-playback-timing-mode="packetReplayTimingMode"
      v-model:traffic-playback-interval-ms="packetReplayIntervalMs"
      v-model:traffic-timeline-window-ms="packetReplayTimelineWindowMs"
      v-model:traffic-timeline-speed="packetReplayTimelineSpeed"
      v-model:traffic-show-only-packet-links="showOnlyPacketLinks"
      v-model:traffic-flow-animation-enabled="flowAnimationEnabled"
      v-model:traffic-seek-position="packetReplayProgress"
      :traffic-filter-submitting="trafficFilterSubmitting"
      :traffic-filter-error="trafficFilterError"
      :traffic-filter-status-text="trafficFilterStatus"
      :traffic-capture-active="trafficCaptureActive"
      :traffic-recording-enabled="packetRecordingEnabled"
      :traffic-packet-count="packetReplayStepCount"
      :traffic-playback-enabled="packetReplayPlaying || packetReplayPaused"
      :traffic-playback-paused="packetReplayPaused"
      :traffic-playback-preparing="packetReplayPreparing"
      @refresh="reloadDockerTopology"
      @clear-topology-filters="clearTopologyFilters"
      @apply-search="applySearch"
      @clear-search="clearSearch"
      @submit-search-from-keyboard="submitSearchFromKeyboard"
      @select-search-suggestion="selectSearchSuggestion"
      @traffic-submit-filter="submitTrafficFilter"
      @traffic-toggle-recording="togglePacketRecording"
      @traffic-toggle-playback="togglePacketReplay"
      @traffic-stop-playback="stopPacketReplay"
      @traffic-clear-playback="clearPacketReplay"
      @traffic-jump-playback="jumpPacketReplay"
      @traffic-update-seek-position="showPacketReplayEventAt"
      @traffic-seek-position="showPacketReplayEventAt"
    >
      <template #after-header>
        <p v-if="topologyLoadError" class="emulator-topology-3d-error">
          {{ topologyLoadError }}
        </p>
      </template>
    </EmulatorTopologyDock>

    <LoadingOverlay :visible="loadingVisible" />
    <div id="globe-console-area" class="console-area"></div>
    <div id="globe-console-taskbar" class="taskbar hide"></div>
  </main>
</template>

<style scoped lang="scss" src="../styles/live-emulator-topology-page.scss"></style>
<style lang="scss">
@use '@/style/common/window-manager.css' as *;

.console-area {
  position: fixed;
  inset: 0;
  z-index: 90000;
  pointer-events: none;
}

.console-area .console-window {
  pointer-events: auto;
}
</style>
