import { Emulator } from '../../../src/utils/seedemu-meta';
import { seedLabels, seedNetLabels } from '../../fixtures/docker';

describe('Emulator metadata parser', () => {
  it('parses container node metadata labels', () => {
    expect(Emulator.ParseNodeMeta(seedLabels)).toEqual({
      asn: 150,
      name: 'router-a',
      role: 'router',
      nets: [{ name: 'net0', address: '10.0.0.2/24' }],
    });
  });

  it('parses network metadata labels', () => {
    expect(Emulator.ParseNetMeta(seedNetLabels)).toEqual({
      name: 'net0',
      scope: '150',
      type: 'local',
      prefix: '10.0.0.0/24',
    });
  });
});
