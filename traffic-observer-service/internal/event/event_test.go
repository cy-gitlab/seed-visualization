package event

import (
	"testing"
	"time"
)

func TestFromRawConvertsPacketFields(t *testing.T) {
	timestamp := time.Date(2026, 7, 15, 9, 31, 28, 922000000, time.FixedZone("CST", 8*60*60))
	packet := FromRaw(Raw{
		TimestampNS: 1784107888922000000,
		IfIndex:     56,
		PacketLen:   98,
		Direction:   DirectionIngress,
		IPProto:     6,
		EthProto:    0x0800,
		SrcIP:       0x0100000a,
		DstIP:       0x0200000a,
		SrcPort:     12345,
		DstPort:     443,
		SrcMAC:      [6]byte{0x02, 0x42, 0x0a, 0x00, 0x00, 0x01},
		DstMAC:      [6]byte{0x02, 0x42, 0x0a, 0x00, 0x00, 0x02},
		TCPFlags:    0x12,
		TTL:         63,
		IPTotalLen:  84,
	}, "veth-test", timestamp)

	if packet.Timestamp.Location() != time.UTC {
		t.Fatalf("expected timestamp to be normalized to UTC")
	}
	if packet.TimestampNS != 1784107888922000000 {
		t.Fatalf("unexpected timestamp ns: %d", packet.TimestampNS)
	}
	if packet.HostIfName != "veth-test" || packet.HostIfIndex != 56 {
		t.Fatalf("unexpected interface data: %#v", packet)
	}
	if packet.Direction != "ingress" {
		t.Fatalf("unexpected direction: %s", packet.Direction)
	}
	if packet.EthProtocol != "0x0800" {
		t.Fatalf("unexpected eth protocol: %s", packet.EthProtocol)
	}
	if packet.SourceIP != "10.0.0.1" || packet.DestIP != "10.0.0.2" {
		t.Fatalf("unexpected ip pair: %s -> %s", packet.SourceIP, packet.DestIP)
	}
	if packet.IPProtocol != "tcp" {
		t.Fatalf("unexpected ip protocol: %s", packet.IPProtocol)
	}
	if packet.SourceMAC != "02:42:0a:00:00:01" || packet.DestMAC != "02:42:0a:00:00:02" {
		t.Fatalf("unexpected mac pair: %s -> %s", packet.SourceMAC, packet.DestMAC)
	}
	if packet.TCPFlags != "SYN,ACK" {
		t.Fatalf("unexpected tcp flags: %s", packet.TCPFlags)
	}
}

func TestFromRawNamesUnknownValues(t *testing.T) {
	packet := FromRaw(Raw{
		Direction: 99,
		IPProto:   253,
	}, "", time.Unix(0, 0))

	if packet.Direction != "unknown" {
		t.Fatalf("expected unknown direction, got %q", packet.Direction)
	}
	if packet.IPProtocol != "ip-253" {
		t.Fatalf("expected unknown protocol name, got %q", packet.IPProtocol)
	}
}
