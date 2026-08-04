package realtime

import (
	"context"
	"encoding/json"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"seed-visualization/traffic-observer-service/internal/event"

	"github.com/gorilla/websocket"
)

func TestPacketHubBroadcastsPacketMessages(t *testing.T) {
	hub := NewPacketHub()
	defer hub.Close()

	server := httptest.NewServer(hub)
	defer server.Close()

	wsURL := "ws" + strings.TrimPrefix(server.URL, "http")
	conn, _, err := websocket.DefaultDialer.Dial(wsURL, nil)
	if err != nil {
		t.Fatalf("dial packet hub websocket: %v", err)
	}
	defer conn.Close()

	timestamp := time.Date(2026, 7, 15, 9, 31, 28, 922000000, time.UTC)
	err = hub.Send(context.Background(), event.Packet{
		Timestamp:         timestamp,
		TimestampNS:       1784107888922000000,
		ContainerID:       "container-a",
		NodeName:          "host-a",
		NodeIP:            "10.0.0.1",
		SourceIP:          "10.0.0.1",
		DestIP:            "10.0.0.2",
		IPProtocol:        "icmp",
		SourceContainerID: "container-a",
		DestContainerID:   "container-b",
		DestNodeName:      "host-b",
		DestNodeIP:        "10.0.0.2",
	})
	if err != nil {
		t.Fatalf("send packet: %v", err)
	}

	if err := conn.SetReadDeadline(time.Now().Add(2 * time.Second)); err != nil {
		t.Fatalf("set deadline: %v", err)
	}
	_, payload, err := conn.ReadMessage()
	if err != nil {
		t.Fatalf("read packet message: %v", err)
	}

	var message PacketMessage
	if err := json.Unmarshal(payload, &message); err != nil {
		t.Fatalf("decode packet message: %v", err)
	}

	if message.Type != "packet" {
		t.Fatalf("unexpected message type: %s", message.Type)
	}
	if message.ContainerID != "container-a" || message.NodeName != "host-a" || message.NodeIP != "10.0.0.1" {
		t.Fatalf("unexpected node fields: %#v", message)
	}
	if message.SourceContainerID != "container-a" || message.DestContainerID != "container-b" {
		t.Fatalf("unexpected endpoint fields: %#v", message)
	}
	if message.TimestampNS != 1784107888922000000 {
		t.Fatalf("unexpected timestamp ns: %d", message.TimestampNS)
	}
}

func TestPacketHubIgnoresUnsupportedValues(t *testing.T) {
	hub := NewPacketHub()
	defer hub.Close()

	if err := hub.Send(context.Background(), "not a packet"); err != nil {
		t.Fatalf("unsupported values should be ignored, got error: %v", err)
	}
}
