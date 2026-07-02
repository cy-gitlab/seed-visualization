<template>
  <main class="starlink-shell">
    <CesiumGlobe
      :satellites="displayedSatellites"
      :orbit-records="visibleOrbitRecords"
      :selected-id="selectedSatelliteId"
      :highlighted-ids="highlightedSatelliteIds"
      :ground-stations="groundStations"
      :ground-links="groundLinks"
      :satellite-links="visibleSatelliteLinks"
      :focused-satellite-id="focusedSatelliteId"
      :focused-station-id="focusedStationId"
      :focus-satellite-zoom="effectiveFocusSatelliteZoom"
      :show-labels="settings.showLabels"
      :current-time="renderTime"
      @select="toggleSatelliteOrbitFromGlobe"
      @select-station="focusGroundStation"
    />

    <section class="overview-panel">
      <span class="panel-kicker">STARLINK SIMULATION</span>
      <h1>Starlink Satellite 3D Globe Simulation</h1>
      <p>{{ renderIsoTime }} UTC</p>
    </section>

    <SatelliteList
      :satellites="filteredSatellites"
      :selected-satellites="selectedOrbitSatellites"
      :orbit-plane-options="orbitPlaneOptions"
      :ground-stations="groundStations"
      :settings="settings"
      :current-time="renderTime"
      :selected-id="selectedSatelliteId"
      @select="toggleSatelliteOrbit"
      @focus-selected="focusSelectedSatellite"
      @remove="removeSatelliteOrbit"
      @remove-all="removeAllSatelliteOrbits"
      @station-select="focusGroundStation"
      @station-focus="focusGroundStation"
      @update-settings="updateSettings"
      @set-system-time="setSystemTime"
      @reset-system-time="resetSystemTime"
    />

    <SatelliteDetailPanel
      :visible="detailVisible"
      :satellite="selectedSatellite"
      @close="detailVisible = false"
    />

    <GroundStationDetailPanel
      :visible="stationDetailVisible"
      :station="selectedStation"
      @close="stationDetailVisible = false"
    />
  </main>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, reactive, ref } from 'vue';
import CesiumGlobe from '@/features/starlink/components/CesiumGlobe.vue';
import GroundStationDetailPanel from '@/features/starlink/components/GroundStationDetailPanel.vue';
import SatelliteDetailPanel from '@/features/starlink/components/SatelliteDetailPanel.vue';
import SatelliteList from '@/features/starlink/components/SatelliteList.vue';
import { useSimulationClock } from '@/features/starlink/composables/useSimulationClock';
import { SatelliteDataSource } from '@/features/starlink/services/satelliteDataSource';
import {
  createNearestGroundLinks,
  fetchGroundStationsFromEmulator,
  mockGroundStations,
} from '@/features/starlink/services/groundStationService';
import { propagateMany } from '@/features/starlink/services/orbitService';
import { parsePlannedOrbitRecords } from '@/features/starlink/services/tleService';
import type {
  GroundStation,
  InterSatelliteLink,
  SatelliteGroundLink,
  SatellitePoint,
  SimulationSettings,
} from '@/features/starlink/types';

const records = parsePlannedOrbitRecords();
const settings = reactive<SimulationSettings>({
  speed: 1,
  customTimeEnabled: false,
  showOrbits: true,
  showLabels: true,
  focusSelection: true,
  showSelectionDetails: true,
  useLocalGroundLinks: false,
  hideLinksForFilteredSatellites: true,
  search: '',
  invertSearch: false,
  altitudeMinKm: undefined,
  altitudeMaxKm: undefined,
  invertAltitude: false,
  selectedOrbitPlaneIds: [],
  invertOrbitPlanes: false,
});
const selectedSatelliteId = ref<string>();
const selectedStationId = ref<string>();
const focusedSatelliteOverrideId = ref<string>();
const frontOnlySatelliteFocus = ref(false);
const detailVisible = ref(false);
const stationDetailVisible = ref(false);
const visibleOrbitIds = ref<string[]>([]);
const groundStations = ref<GroundStation[]>(mockGroundStations);
const backendGroundLinks = ref<SatelliteGroundLink[]>([]);
const backendSatelliteLinks = ref<InterSatelliteLink[]>([]);
const backendLinkedSatelliteIds = ref<string[]>([]);
const hiddenBackendSatelliteIds = ref<string[]>([]);
const hiddenBackendSatelliteLinkIds = ref<string[]>([]);
const satelliteDataSource = new SatelliteDataSource(() => settings.speed);
const backendGroundLinkTime = ref<Date>();
const backendSatelliteLinkTime = ref<Date>();
const { now, setTime } = useSimulationClock(() => settings.speed);

onMounted(async () => {
  try {
    const stations = await fetchGroundStationsFromEmulator();
    if (stations.length) {
      groundStations.value = stations;
    }
  } catch (error) {
    console.warn('Failed to load emulator star nodes as ground stations.', error);
  }

  satelliteDataSource.on('ground-links', (frame) => {
    if (frame.completed) {
      backendGroundLinks.value = [];
      backendGroundLinkTime.value = undefined;
      backendLinkedSatelliteIds.value = [];
      hiddenBackendSatelliteIds.value = [];
      return;
    }

    if (frame.requestIndex === 0 && frame.groupIndex === 0) {
      hiddenBackendSatelliteIds.value = [];
    }

    const hiddenIds = new Set(hiddenBackendSatelliteIds.value);
    backendGroundLinks.value = frame.links.filter((link) => !hiddenIds.has(link.satelliteId));
    backendGroundLinkTime.value = frame.sampleTime;
    backendLinkedSatelliteIds.value = Array.from(new Set(backendGroundLinks.value.map((link) => link.satelliteId)));
  });
  satelliteDataSource.on('satellite-links', (frame) => {
    if (frame.completed) {
      backendSatelliteLinks.value = [];
      backendSatelliteLinkTime.value = undefined;
      hiddenBackendSatelliteLinkIds.value = [];
      return;
    }

    if (frame.requestIndex === 0 && frame.groupIndex === 0) {
      hiddenBackendSatelliteLinkIds.value = [];
    }

    const hiddenIds = new Set(hiddenBackendSatelliteLinkIds.value);
    backendSatelliteLinks.value = frame.links.filter(
      (link) => !hiddenIds.has(link.satelliteAId) && !hiddenIds.has(link.satelliteBId),
    );
    backendSatelliteLinkTime.value = frame.sampleTime;
  });
  satelliteDataSource.on('dead', (error) => {
    console.warn('Satellite ground-link websocket disconnected.', error);
  });
  satelliteDataSource.connect();
});

onUnmounted(() => {
  satelliteDataSource.disconnect();
});

const renderTime = computed(() => {
  if (settings.customTimeEnabled) {
    return now.value;
  }

  if (settings.useLocalGroundLinks) {
    return backendSatelliteLinkTime.value ?? now.value;
  }

  const linkTimes = [backendGroundLinkTime.value, backendSatelliteLinkTime.value].filter(
    (value): value is Date => Boolean(value),
  );
  return linkTimes.length
    ? new Date(Math.max(...linkTimes.map((value) => value.getTime())))
    : now.value;
});
const renderIsoTime = computed(() => renderTime.value.toISOString().replace(/\.\d{3}Z$/, ''));
const orbitPlaneOptions = Array.from(new Set(records.map((record) => record.orbitPlaneId))).sort(
  (left, right) => left.localeCompare(right, undefined, { numeric: true }),
);
const hasActiveSatelliteFilters = computed(
  () =>
    Boolean(settings.search.trim()) ||
    Number.isFinite(settings.altitudeMinKm) ||
    Number.isFinite(settings.altitudeMaxKm) ||
    settings.selectedOrbitPlaneIds.length > 0,
);
const allDisplayedSatellites = computed(() => propagateMany(records, renderTime.value));
const filteredSatellites = computed(() => {
  const search = settings.search.trim().toLowerCase();
  const selectedPlanes = new Set(settings.selectedOrbitPlaneIds);
  const hasAltitudeFilter =
    Number.isFinite(settings.altitudeMinKm) || Number.isFinite(settings.altitudeMaxKm);

  return allDisplayedSatellites.value.filter((satellite) => {
    const textMatches =
      !search ||
      satellite.name.toLowerCase().includes(search) ||
      satellite.id.toLowerCase().includes(search);
    if (search && (settings.invertSearch ? textMatches : !textMatches)) {
      return false;
    }

    const altitudeMatches =
      (!Number.isFinite(settings.altitudeMinKm) ||
        satellite.altitudeKm >= settings.altitudeMinKm!) &&
      (!Number.isFinite(settings.altitudeMaxKm) ||
        satellite.altitudeKm <= settings.altitudeMaxKm!);
    if (
      hasAltitudeFilter &&
      (settings.invertAltitude ? altitudeMatches : !altitudeMatches)
    ) {
      return false;
    }

    const orbitMatches = selectedPlanes.has(satellite.orbitPlaneId);
    if (
      selectedPlanes.size > 0 &&
      (settings.invertOrbitPlanes ? orbitMatches : !orbitMatches)
    ) {
      return false;
    }

    return true;
  });
});
const filteredSatelliteIds = computed(
  () => new Set(filteredSatellites.value.map((satellite) => satellite.id)),
);
const connectedSatelliteIds = computed(() => {
  const ids = new Set(backendGroundLinks.value.map((link) => link.satelliteId));
  backendSatelliteLinks.value.forEach((link) => {
    ids.add(link.satelliteAId);
    ids.add(link.satelliteBId);
  });
  return ids;
});
const displayedSatellites = computed(() => {
  if (settings.hideLinksForFilteredSatellites) {
    return filteredSatellites.value;
  }

  return allDisplayedSatellites.value.filter(
    (satellite) =>
      filteredSatelliteIds.value.has(satellite.id) || connectedSatelliteIds.value.has(satellite.id),
  );
});
const displayedSatelliteById = computed(() =>
  new Map(displayedSatellites.value.map((satellite) => [satellite.id, satellite])),
);
const focusedSatelliteId = computed(() =>
  settings.focusSelection
    ? focusedSatelliteOverrideId.value ??
      (hasActiveSatelliteFilters.value ? filteredSatellites.value[0]?.id : undefined)
    : undefined,
);
const effectiveFocusSatelliteZoom = computed(
  () => settings.focusSelection && !frontOnlySatelliteFocus.value,
);
const focusedStationId = computed(() =>
  settings.focusSelection ? selectedStationId.value : undefined,
);
const highlightedSatelliteIds = computed(() => {
  const ids = new Set(visibleOrbitIds.value);

  if (settings.search.trim()) {
    displayedSatellites.value.forEach((satellite) => ids.add(satellite.id));
  }

  return Array.from(ids);
});
const fallbackGroundLinks = computed(() =>
  createNearestGroundLinks(displayedSatellites.value, groundStations.value, highlightedSatelliteIds.value),
);
const groundLinks = computed(() =>
  settings.useLocalGroundLinks
    ? fallbackGroundLinks.value
    : settings.hideLinksForFilteredSatellites
      ? backendGroundLinks.value.filter((link) => filteredSatelliteIds.value.has(link.satelliteId))
      : backendGroundLinks.value,
);
const visibleSatelliteLinks = computed(() =>
  settings.hideLinksForFilteredSatellites
    ? backendSatelliteLinks.value.filter(
        (link) =>
          filteredSatelliteIds.value.has(link.satelliteAId) &&
          filteredSatelliteIds.value.has(link.satelliteBId),
      )
    : backendSatelliteLinks.value,
);
const selectedOrbitSatelliteIds = computed(() => {
  const ids = new Set(visibleOrbitIds.value);

  if (!settings.useLocalGroundLinks) {
    groundLinks.value.forEach((link) => ids.add(link.satelliteId));
  }

  visibleSatelliteLinks.value.forEach((link) => {
    ids.add(link.satelliteAId);
    ids.add(link.satelliteBId);
  });

  return Array.from(ids);
});
const selectedSatellite = computed(() =>
  selectedSatelliteId.value ? displayedSatelliteById.value.get(selectedSatelliteId.value) : undefined,
);
const selectedStation = computed(() =>
  selectedStationId.value
    ? groundStations.value.find((station) => station.id === selectedStationId.value)
    : undefined,
);
const selectedOrbitSatellites = computed(() =>
  selectedOrbitSatelliteIds.value
    .map((id) => displayedSatelliteById.value.get(id))
    .filter((satellite): satellite is SatellitePoint => Boolean(satellite)),
);
const visibleOrbitRecordIds = computed(() => {
  return selectedOrbitSatelliteIds.value.filter((id) => displayedSatelliteById.value.has(id));
});
const visibleOrbitRecords = computed(() =>
  settings.showOrbits
    ? visibleOrbitRecordIds.value
        .map((id) => records.find((record) => record.id === id))
        .filter((record): record is (typeof records)[number] => Boolean(record))
    : [],
);
function toggleSatelliteOrbit(satellite: SatellitePoint) {
  stationDetailVisible.value = false;
  selectedSatelliteId.value = satellite.id;
  focusedSatelliteOverrideId.value = satellite.id;
  frontOnlySatelliteFocus.value = false;
  toggleSatelliteOrbitState(satellite);
}

function toggleSatelliteOrbitFromGlobe(satellite: SatellitePoint) {
  stationDetailVisible.value = false;
  selectedSatelliteId.value = satellite.id;
  focusedSatelliteOverrideId.value = undefined;
  frontOnlySatelliteFocus.value = false;
  toggleSatelliteOrbitState(satellite);
}

function focusSelectedSatellite(satellite: SatellitePoint) {
  stationDetailVisible.value = false;
  selectedSatelliteId.value = satellite.id;
  focusedSatelliteOverrideId.value = satellite.id;
  frontOnlySatelliteFocus.value = true;
  detailVisible.value = settings.showSelectionDetails;
}

function toggleSatelliteOrbitState(satellite: SatellitePoint) {
  selectedSatelliteId.value = satellite.id;
  const orbitVisible = visibleOrbitIds.value.includes(satellite.id);
  if (orbitVisible) {
    removeSatelliteOrbit(satellite);
    return;
  }

  visibleOrbitIds.value = [...visibleOrbitIds.value, satellite.id];
  detailVisible.value = settings.showSelectionDetails;
}

function removeSatelliteOrbit(satellite: SatellitePoint) {
  visibleOrbitIds.value = visibleOrbitIds.value.filter((id) => id !== satellite.id);
  removeBackendSatellite(satellite.id);
  if (selectedSatelliteId.value === satellite.id) {
    selectedSatelliteId.value = undefined;
    focusedSatelliteOverrideId.value = undefined;
    frontOnlySatelliteFocus.value = false;
    detailVisible.value = false;
  }
}

function removeAllSatelliteOrbits() {
  visibleOrbitIds.value = [];
  hideBackendSatellites(backendLinkedSatelliteIds.value);
  hideBackendSatelliteLinks(
    backendSatelliteLinks.value.flatMap((link) => [link.satelliteAId, link.satelliteBId]),
  );
  backendGroundLinks.value = [];
  backendSatelliteLinks.value = [];
  backendLinkedSatelliteIds.value = [];
  selectedSatelliteId.value = undefined;
  focusedSatelliteOverrideId.value = undefined;
  frontOnlySatelliteFocus.value = false;
  detailVisible.value = false;
}

function removeBackendSatellite(satelliteId: string) {
  if (backendLinkedSatelliteIds.value.includes(satelliteId)) {
    hideBackendSatellites([satelliteId]);
    backendGroundLinks.value = backendGroundLinks.value.filter(
      (link) => link.satelliteId !== satelliteId,
    );
    backendLinkedSatelliteIds.value = backendLinkedSatelliteIds.value.filter(
      (id) => id !== satelliteId,
    );
  }

  const hasSatelliteLink = backendSatelliteLinks.value.some(
    (link) => link.satelliteAId === satelliteId || link.satelliteBId === satelliteId,
  );
  if (hasSatelliteLink) {
    hideBackendSatelliteLinks([satelliteId]);
    backendSatelliteLinks.value = backendSatelliteLinks.value.filter(
      (link) => link.satelliteAId !== satelliteId && link.satelliteBId !== satelliteId,
    );
  }
}

function hideBackendSatellites(satelliteIds: string[]) {
  if (!satelliteIds.length) {
    return;
  }

  hiddenBackendSatelliteIds.value = Array.from(
    new Set([...hiddenBackendSatelliteIds.value, ...satelliteIds]),
  );
}

function hideBackendSatelliteLinks(satelliteIds: string[]) {
  if (!satelliteIds.length) {
    return;
  }

  hiddenBackendSatelliteLinkIds.value = Array.from(
    new Set([...hiddenBackendSatelliteLinkIds.value, ...satelliteIds]),
  );
}

function updateSettings(nextSettings: SimulationSettings) {
  if (nextSettings.search !== settings.search) {
    frontOnlySatelliteFocus.value = false;
  }
  Object.assign(settings, nextSettings);
  if (!settings.showSelectionDetails) {
    detailVisible.value = false;
    stationDetailVisible.value = false;
  }
}

function setSystemTime(timestampMs: number) {
  setTime(timestampMs);
  settings.customTimeEnabled = true;
}

function resetSystemTime() {
  setTime(Date.now());
  settings.customTimeEnabled = false;
}

function focusGroundStation(station: GroundStation) {
  selectedStationId.value = station.id;
  detailVisible.value = false;
  stationDetailVisible.value = settings.showSelectionDetails;
}
</script>

<style scoped lang="scss" src="@/features/starlink/styles/starlink-dashboard.scss"></style>
