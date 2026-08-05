import type { Edge, Vertex } from '@/utils/map-datasource'

function edgeKey(from: string, to: string): string {
  return from < to ? `${from}\u0000${to}` : `${to}\u0000${from}`
}

export function filterGraphByIXRoutersData(
  nodes: Vertex[],
  edges: Edge[],
  selectedStarLabels: string[],
): { filteredNodes: Vertex[]; filteredEdges: Edge[] } {
  if (selectedStarLabels.length === 0) {
    return {
      filteredNodes: [],
      filteredEdges: [],
    }
  }

  const selectedStarLabelsSet = new Set(selectedStarLabels)
  const nodeMap = new Map<string, Vertex>()
  const selectedStarIds = new Set<string>()
  const nodesToKeep = new Set<string>()
  const edgesToKeep = new Set<string>()
  const adjacencyList = new Map<string, Edge[]>()

  const isRouterNode = (node?: Vertex) => {
    if (node?.type !== 'node') return false
    const role = (node.object as any)?.meta?.emulatorInfo?.role
    return node?.shape === 'dot' && ['Router', 'BorderRouter'].includes(role)
  }
  const isLocalNetwork = (node?: Vertex) => node?.shape === 'diamond'

  nodes.forEach((node) => {
    nodeMap.set(node.id, node)
    adjacencyList.set(node.id, [])
    const starName = node.object?.meta?.emulatorInfo?.name
    if (node.shape === 'star' && starName && selectedStarLabelsSet.has(starName)) {
      selectedStarIds.add(node.id)
      nodesToKeep.add(node.id)
    }
  })

  edges.forEach((edge) => {
    adjacencyList.get(edge.from)?.push(edge)
    adjacencyList.get(edge.to)?.push(edge)

    const fromIsSelectedStar = selectedStarIds.has(edge.from)
    const toIsSelectedStar = selectedStarIds.has(edge.to)
    if (!fromIsSelectedStar && !toIsSelectedStar) return

    const directNodeId = fromIsSelectedStar ? edge.to : edge.from
    const directNode = nodeMap.get(directNodeId)
    if (!isRouterNode(directNode)) return

    nodesToKeep.add(directNodeId)
    edgesToKeep.add(edgeKey(edge.from, edge.to))
  })

  const directRouterIds = Array.from(nodesToKeep).filter((id) => isRouterNode(nodeMap.get(id)))
  directRouterIds.forEach((startRouterId) => {
    const startRouter = nodeMap.get(startRouterId)
    const startGroup = String(startRouter?.group ?? '')
    const visited = new Set<string>([startRouterId])
    const queue = [startRouterId]

    while (queue.length > 0) {
      const currentId = queue.shift()!
      for (const edge of adjacencyList.get(currentId) ?? []) {
        const nextId = edge.from === currentId ? edge.to : edge.from
        if (visited.has(nextId)) continue

        const nextNode = nodeMap.get(nextId)
        const currentNode = nodeMap.get(currentId)
        const canVisitNetwork = isRouterNode(currentNode) && isLocalNetwork(nextNode)
        const canVisitRouter = isLocalNetwork(currentNode)
          && isRouterNode(nextNode)
          && String(nextNode?.group ?? '') === startGroup

        if (!canVisitNetwork && !canVisitRouter) continue

        visited.add(nextId)
        nodesToKeep.add(nextId)
        edgesToKeep.add(edgeKey(edge.from, edge.to))

        if (isRouterNode(nextNode) || isLocalNetwork(nextNode)) {
          queue.push(nextId)
        }
      }
    }
  })

  const filteredNodes = nodes.filter((node) => nodesToKeep.has(node.id))
  const filteredEdges: Edge[] = []
  const addedEdges = new Set<string>()

  edges.forEach((edge) => {
    const key = edgeKey(edge.from, edge.to)
    if (edgesToKeep.has(key) && !addedEdges.has(key)) {
      filteredEdges.push({ ...edge })
      addedEdges.add(key)
    }
  })

  return {
    filteredNodes,
    filteredEdges,
  }
}
