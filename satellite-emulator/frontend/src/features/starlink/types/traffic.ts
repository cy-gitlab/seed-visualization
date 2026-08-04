export type TrafficPacketMessage = {
  type: 'packet';
  timestamp: string;
  timestampNs?: number | string;
  containerId: string;
  direction?: 'ingress' | 'egress';
  nodeName?: string;
  nodeIp?: string;
  sourceIp?: string;
  destIp?: string;
  ipProtocol?: string;
  sourcePort?: number;
  destPort?: number;
  sourceContainerId?: string;
  sourceNodeName?: string;
  sourceNodeIp?: string;
  destContainerId?: string;
  destNodeName?: string;
  destNodeIp?: string;
};

export type TrafficPacketReplayEvent = TrafficPacketMessage & {
  id: string;
  timestampMs: number;
  receivedAtMs: number;
};

export type TrafficContainerNodeDetail = {
  containerId: string;
  shortContainerId: string;
  nodeName: string;
  nodeIp?: string;
  nodeType?: string;
  containerName?: string;
  longitude?: number;
  latitude?: number;
  locationSource?: 'metadata' | 'generated';
};
