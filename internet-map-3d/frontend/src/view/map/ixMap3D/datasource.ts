import { DataSource as BaseDataSource, type Edge, type Vertex } from '@/utils/map-datasource'

export class DataSource extends BaseDataSource {
  visDataSet(ixsNumber: number): { vertices: Vertex[]; edges: Edge[] } {
    const selectedStarLabels = this.ixs.map((value) => value.meta.emulatorInfo.name).slice(0, ixsNumber)
    return this.visDataSetByIX([...selectedStarLabels])
  }

  visDataSetByIX(selectedStarLabels: string[]): { vertices: Vertex[]; edges: Edge[] } {
    const nodes = this.vertices
    const edges = this.edges
    const selectedStarLabelsSet = new Set(selectedStarLabels)
    const selectedStarIds = new Set<string>()
    const nodesToKeep = new Set<string>()
    const edgesToKeep = new Set<string>()
    const nodeMap = new Map<string, Vertex>()
    const adjacencyList = new Map<string, Set<string>>()

    nodes.forEach((node) => {
      nodeMap.set(node.id, node)
      adjacencyList.set(node.id, new Set())
      const starName = node.object?.meta?.emulatorInfo?.name
      if (node.shape === 'star' && starName && selectedStarLabelsSet.has(starName)) {
        selectedStarIds.add(node.id)
        nodesToKeep.add(node.id)
      }
    })

    edges.forEach((edge) => {
      adjacencyList.get(edge.from)?.add(edge.to)
      adjacencyList.get(edge.to)?.add(edge.from)
    })

    selectedStarIds.forEach((starId) => {
      const visited = new Set<string>([starId])
      const queue = [starId]

      while (queue.length > 0) {
        const nodeId = queue.shift()!
        for (const neighborId of adjacencyList.get(nodeId) ?? []) {
          if (visited.has(neighborId)) continue
          visited.add(neighborId)

          const neighborNode = nodeMap.get(neighborId)
          const isStar = neighborNode?.shape === 'star'
          const isDot = neighborNode?.shape === 'dot'
          const isDiamond = neighborNode?.shape === 'diamond'

          if (isStar && !selectedStarIds.has(neighborId)) continue
          if (!isStar && !isDot && !isDiamond) continue

          nodesToKeep.add(neighborId)
          edgesToKeep.add([nodeId, neighborId].sort().join('-'))
          if (!isStar) {
            queue.push(neighborId)
          }
        }
      }
    })

    const filteredNodes = nodes.filter((node) => nodesToKeep.has(node.id))
    const filteredEdges: Edge[] = []
    const addedEdges = new Set<string>()

    edges.forEach((edge) => {
      const key = [edge.from, edge.to].sort().join('-')
      if (edgesToKeep.has(key) && !addedEdges.has(key)) {
        filteredEdges.push({ ...edge })
        addedEdges.add(key)
      }
    })

    return {
      vertices: filteredNodes,
      edges: filteredEdges,
    }
  }
}
