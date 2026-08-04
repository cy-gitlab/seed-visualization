import assert from 'node:assert/strict';
import {
  TrafficReplayPlaylist,
  clampTrafficReplaySeekPosition,
  compareTrafficReplayEvents,
  createTrafficReplayEvent,
  formatTrafficReplaySeekTooltip,
  normalizePacketTimestamp,
  normalizePacketTimestampNs,
  normalizeTrafficReplaySeekInput,
} from '../src/features/starlink/services/traffic/trafficReplayService';
import {
  getContainerGeoLocation,
  getNearestLocationDistanceKm,
  pickFallbackTrafficNodeLocation,
} from '../src/features/starlink/services/traffic/trafficContainerLocationService';
import {
  getSatelliteShellId,
  getSatelliteShellStyle,
} from '../src/features/starlink/services/satelliteShellStyle';
import {
  propagateMany,
  propagateSatellite,
  sampleOrbit,
} from '../src/features/starlink/services/orbitService';
import { createSatelliteDetailRows } from '../src/features/starlink/services/satelliteDetailService';
import {
  createNearestGroundLinks,
} from '../src/features/starlink/services/groundStationService';
import {
  parsePlannedOrbitRecords,
  type PlannedShellOrbitDataJson,
} from '../src/features/starlink/services/tleService';
import type {
  GroundStation,
  PlannedOrbitRecord,
  SatellitePoint,
  TrafficPacketMessage,
  TrafficPacketReplayEvent,
} from '../src/features/starlink/types';
import type { EmulatorContainerInfo } from '../src/features/starlink/services/emulatorContainerService';

function packet(
  id: string,
  timestamp: string,
  timestampNs?: string,
): TrafficPacketReplayEvent {
  return {
    type: 'packet',
    id,
    timestamp,
    timestampNs,
    timestampMs: Date.parse(timestamp),
    receivedAtMs: Date.parse(timestamp) + 1,
    containerId: id,
  };
}

function testCreateReplayEvent() {
  const message: TrafficPacketMessage = {
    type: 'packet',
    timestamp: '2026-07-15T09:31:28.922Z',
    timestampNs: '1784107888922000000',
    containerId: 'container-a',
  };

  const event = createTrafficReplayEvent(message);

  assert.equal(event.containerId, message.containerId);
  assert.equal(event.timestampMs, Date.parse(message.timestamp));
  assert.equal(event.timestampNs, message.timestampNs);
  assert.match(event.id, /^packet:\d+:[a-z0-9]+$/);
}

function testTimestampNormalization() {
  assert.equal(
    normalizePacketTimestamp('2026-07-15T09:31:28.922Z'),
    Date.parse('2026-07-15T09:31:28.922Z'),
  );
  assert.equal(normalizePacketTimestampNs('1784107888922000000'), 1784107888922000000n);
  assert.equal(normalizePacketTimestampNs(''), undefined);
  assert.equal(normalizePacketTimestampNs('not-a-number'), undefined);
}

function testReplayEventComparison() {
  const laterByMs = packet('later-ms', '2026-07-15T09:31:29.000Z');
  const earlierByMs = packet('earlier-ms', '2026-07-15T09:31:28.000Z');
  assert.equal(compareTrafficReplayEvents(earlierByMs, laterByMs) < 0, true);

  const laterByNs = packet('later-ns', '2026-07-15T09:31:28.000Z', '20');
  const earlierByNs = packet('earlier-ns', '2026-07-15T09:31:29.000Z', '10');
  assert.equal(compareTrafficReplayEvents(earlierByNs, laterByNs) < 0, true);
}

function testTrafficReplayPlaylist() {
  const third = packet('third', '2026-07-15T09:31:30.000Z', '30');
  const first = packet('first', '2026-07-15T09:31:28.000Z', '10');
  const second = packet('second', '2026-07-15T09:31:29.000Z', '20');
  const playlist = TrafficReplayPlaylist.from([third, first, second]);

  assert.equal(playlist.length, 3);
  assert.equal(playlist.first?.id, 'first');
  assert.equal(playlist.last?.id, 'third');
  assert.equal(playlist.at(1)?.id, 'second');
  assert.equal(playlist.clampIndex(-10), 0);
  assert.equal(playlist.clampIndex(99), 2);
  assert.equal(playlist.clampPosition(2.4), 2);
  assert.equal(playlist.clampPosition(99), 3);
}

function testSeekHelpers() {
  assert.equal(normalizeTrafficReplaySeekInput([3]), 3);
  assert.equal(normalizeTrafficReplaySeekInput('4'), 4);
  assert.equal(Number.isNaN(normalizeTrafficReplaySeekInput('abc')), true);
  assert.equal(clampTrafficReplaySeekPosition(-1, 8), 0);
  assert.equal(clampTrafficReplaySeekPosition(9, 8), 8);
  assert.equal(formatTrafficReplaySeekTooltip('4.6', 8), '5');
  assert.equal(formatTrafficReplaySeekTooltip('abc', 8), '0');
}

function testSatelliteShellStyle() {
  assert.equal(getSatelliteShellId('S1-P001'), 'S1');
  assert.equal(getSatelliteShellId('s5-plane-02'), 'S5');
  assert.equal(getSatelliteShellId('polar-plane'), 'other');
  assert.equal(getSatelliteShellStyle('S2-P003').color, '#2ee37f');
  assert.equal(getSatelliteShellStyle('unknown-plane').id, 'other');
}

function testTrafficContainerLocations() {
  const locatedContainer: EmulatorContainerInfo = {
    Id: 'container-located',
    meta: {
      emulatorInfo: {
        name: 'located-node',
        longitude: '118.78',
        latitude: '32.04',
      },
    },
  };
  const locatedGeo = getContainerGeoLocation(locatedContainer);
  assert.deepEqual(locatedGeo, {
    longitude: 118.78,
    latitude: 32.04,
  });

  const invalidContainer: EmulatorContainerInfo = {
    Id: 'container-invalid',
    meta: {
      emulatorInfo: {
        name: 'invalid-node',
        longitude: '181',
        latitude: '32.04',
      },
    },
  };
  assert.equal(getContainerGeoLocation(invalidContainer), undefined);

  const firstFallback = pickFallbackTrafficNodeLocation(
    'new-node-a',
    [locatedContainer],
    {},
    100,
  );
  const secondFallback = pickFallbackTrafficNodeLocation(
    'new-node-b',
    [locatedContainer],
    {
      'new-node-a': firstFallback,
    },
    100,
  );

  assert.equal(Number.isFinite(firstFallback.longitude), true);
  assert.equal(Number.isFinite(firstFallback.latitude), true);
  assert.equal(
    getNearestLocationDistanceKm(secondFallback, [locatedGeo!]) > 0,
    true,
  );
  assert.equal(getNearestLocationDistanceKm(secondFallback, [firstFallback]) >= 100, true);
}

function plannedRecord(overrides: Partial<PlannedOrbitRecord> = {}): PlannedOrbitRecord {
  return {
    id: '910001',
    name: 'SAT-910001',
    noradId: 910001,
    orbitPlaneId: 'S1-P001',
    epochUtc: '2026-01-01T00:00:00Z',
    inclinationDeg: 53,
    eccentricity: 0,
    meanMotionRevPerDay: 15.078199602,
    raanDeg: 0,
    argumentOfPerigeeDeg: 0,
    meanAnomalyDeg: 0,
    line1: 'PLANNED S1 910001',
    line2: '53.0000 0.0000 0.0000 15.078199602',
    ...overrides,
  };
}

function satellitePoint(overrides: Partial<SatellitePoint> = {}): SatellitePoint {
  return {
    ...plannedRecord(),
    longitude: 0,
    latitude: 0,
    altitudeKm: 550,
    velocityKmS: 7.6,
    ...overrides,
  };
}

function testOrbitPropagation() {
  const record = plannedRecord();
  const sample = propagateSatellite(record, new Date('2026-01-01T00:00:00Z'));

  assert.notEqual(sample, null);
  assert.equal(sample?.id, '910001');
  assert.equal(Number.isFinite(sample?.longitude), true);
  assert.equal(Number.isFinite(sample?.latitude), true);
  assert.equal((sample?.altitudeKm ?? 0) > 0, true);
  assert.equal((sample?.velocityKmS ?? 0) > 0, true);

  assert.equal(propagateSatellite(plannedRecord({ meanMotionRevPerDay: 0 }), new Date()), null);
  assert.equal(propagateSatellite(plannedRecord({ epochUtc: 'invalid-date' }), new Date()), null);
  assert.equal(propagateMany([record, plannedRecord({ meanMotionRevPerDay: 0 })], new Date()).length, 1);
  assert.equal(sampleOrbit(record, new Date('2026-01-01T00:00:00Z'), 4, 2).length, 3);
}

function testSatelliteDetails() {
  const rows = createSatelliteDetailRows(satellitePoint({
    latitude: 31.2304,
    longitude: 121.4737,
    epochUtc: '2026-01-01T00:00:00Z',
  }));

  assert.equal(rows.some((row) => row.label === 'NORAD ID' && row.value === '910001'), true);
  assert.equal(rows.some((row) => row.label === 'Altitude' && row.value === '550.0 km'), true);
  assert.equal(rows.some((row) => row.label === 'Orbit epoch' && row.value.includes('2026')), true);

  const invalidEpochRows = createSatelliteDetailRows(satellitePoint({ epochUtc: 'bad-date' }));
  assert.equal(
    invalidEpochRows.find((row) => row.label === 'Orbit epoch')?.value,
    'Unknown',
  );
}

function testGroundLinks() {
  const stations: GroundStation[] = [
    {
      id: 'near-station',
      name: 'Near Station',
      city: 'Near City',
      longitude: 0,
      latitude: 0,
      altitudeMeters: 0,
    },
    {
      id: 'far-station',
      name: 'Far Station',
      city: 'Far City',
      longitude: 120,
      latitude: 60,
      altitudeMeters: 0,
    },
  ];

  const links = createNearestGroundLinks(
    [satellitePoint({ id: 'sat-a', longitude: 0, latitude: 0, altitudeKm: 550 })],
    stations,
    ['sat-a'],
  );

  assert.equal(links.length, 1);
  assert.equal(links[0].satelliteId, 'sat-a');
  assert.equal(links[0].stationId, 'near-station');
  assert.equal(createNearestGroundLinks([satellitePoint({ id: 'sat-a' })], [], ['sat-a']).length, 0);
  assert.equal(createNearestGroundLinks([satellitePoint({ id: 'sat-a' })], stations, ['other']).length, 0);
}

function testPlannedOrbitParsing() {
  const data: PlannedShellOrbitDataJson = {
    selected_records: [
      {
        argument_of_perigee_deg: 0,
        eccentricity: 0,
        epoch_utc: '2026-01-01T00:00:00Z',
        inclination_deg: 53,
        line1: 'L1',
        line2: 'L2',
        mean_anomaly_deg: 12,
        mean_motion_rev_per_day: 15,
        norad_id: 910001,
        plane_index: 7,
        raan_deg: 1,
        satellite_name: 'SAT-910001',
      },
      {
        argument_of_perigee_deg: 0,
        eccentricity: 0,
        epoch_utc: '2026-01-01T00:00:00Z',
        inclination_deg: 53,
        line1: 'L1',
        line2: 'L2',
        mean_anomaly_deg: 12,
        mean_motion_rev_per_day: 15,
        norad_id: 910002,
        plane_index: 8,
        raan_deg: 1,
        satellite_name: 'SAT-910002',
      },
    ],
    shell_selection: {
      plane_manifest: [
        {
          plane_id: 'S1-P001',
          norad_ids: [910001],
        },
      ],
    },
  };

  const records = parsePlannedOrbitRecords(data);
  assert.equal(records.length, 2);
  assert.equal(records[0].id, '910001');
  assert.equal(records[0].orbitPlaneId, 'S1-P001');
  assert.equal(records[1].orbitPlaneId, 'plane-008');

  assert.throws(
    () => parsePlannedOrbitRecords({
      selected_records: [{ norad_id: 1 } as any],
    }),
    /invalid orbit records/,
  );
}

testCreateReplayEvent();
testTimestampNormalization();
testReplayEventComparison();
testTrafficReplayPlaylist();
testSeekHelpers();
testSatelliteShellStyle();
testTrafficContainerLocations();
testOrbitPropagation();
testSatelliteDetails();
testGroundLinks();
testPlannedOrbitParsing();

console.log('starlink service unit tests passed');
