import { EntityManager } from 'typeorm';

type EntityMetadataDecorated = { entityName: string; foreignKeys: string[] };

class Graph {
  private graphSource: EntityMetadataDecorated[] = [];
  private adjacencyList: Record<string, string[]> = {};
  private topNums: Map<string, number> = new Map();
  private _vertexesFullChains: Record<string, string[]> = {};
  private _rootVertexesListOrdered: string[] = [];
  private rootVertexCursor: string = '';

  get vertexesFullChains(): Map<string, string[]> {
    return new Map(Object.entries(this._vertexesFullChains));
  }
  get sortedGraphListDFS() {
    return this._rootVertexesListOrdered;
  }

  addVertex(vertex: string) {
    if (!this.adjacencyList[vertex]) {
      this.adjacencyList[vertex] = [];
    }
  }
  addEdge(v1: string, v2: string) {
    this.adjacencyList[v1].push(v2);
  }

  schemeMetadataToFkGraph(metadata: EntityMetadataDecorated[]) {
    this.graphSource = metadata;
    const modelDecorated = metadata.map(el => {
      return {
        ...el,
        foreignKeys: new Set(el.foreignKeys)
      };
    });
    modelDecorated.forEach(item => this.addVertex(item.entityName));

    modelDecorated.forEach(item => {
      for (const fk of item.foreignKeys.values()) {
        this.addEdge(item.entityName, fk);
      }
    });
  }

  generateSortedData() {
    this.sortDFS();
    this.generateVertexesTree();
  }

  generateVertexesTree(): void {
    const vertices = Object.keys(this.adjacencyList);

    for (const v of vertices) {
      this.rootVertexCursor = v;
      this._vertexesFullChains[this.rootVertexCursor] = [];

      this.generateVertexesTreeHelper(v);
    }

    for (const edgeRoot in this._vertexesFullChains) {
      const list = this._vertexesFullChains[edgeRoot].reverse().filter((x, i, a) => a.indexOf(x) == i);
      this._vertexesFullChains[edgeRoot] = this._rootVertexesListOrdered.filter(rvl => list.includes(rvl));
    }
  }

  private generateVertexesTreeHelper(v: string) {
    const neighbors = this.adjacencyList[v];

    for (const neighbor of neighbors) {
      this._vertexesFullChains[this.rootVertexCursor].push(neighbor);
      this.generateVertexesTreeHelper(neighbor);
      // TODO add handler of cyclic
    }
  }

  private sortDFS() {
    const vertices = Object.keys(this.adjacencyList);
    const visited: Record<string, boolean> = {};
    const visitedTmp: Record<string, boolean> = {};

    let n = vertices.length - 1;
    for (const v of vertices) {
      if (!visited[v]) {
        n = this.dfsSortHelper(v, n, visited, visitedTmp);
      }
    }

    this._rootVertexesListOrdered = [...this.topNums.entries()]
      .sort((a, b) => (a[1] > b[1] ? -1 : b[1] > a[1] ? 1 : 0))
      .map(item => item[0]);
  }

  private dfsSortHelper(v: string, n: number, visited: Record<string, boolean>, visitedTmp: Record<string, boolean>) {
    const neighbors = this.adjacencyList[v];

    for (const neighbor of neighbors) {
      if (!visited[neighbor]) {
        if (visitedTmp[neighbor]) {
          const msg = `Relations cycle has been detected: ${neighbor} -> ${v} -> ${neighbor}`;
          throw new Error(msg);
        }
        visitedTmp[neighbor] = true;

        n = this.dfsSortHelper(neighbor, n, visited, visitedTmp);
      }
    }

    delete visitedTmp[v];
    visited[v] = true;

    this.topNums.set(v, n);
    return n - 1;
  }
}

export class SchemaMetadata {
  private _schemaModel: EntityMetadataDecorated[] = [];
  private _entitiesOrderedList: string[] = [];
  private _entitiesRelationsChains: Map<string, string[]> = new Map();

  get schemaModel() {
    return this._schemaModel;
  }
  get entitiesOrderedList() {
    return this._entitiesOrderedList;
  }
  get entitiesRelationsChains() {
    return this._entitiesRelationsChains;
  }

  async getMetadata(em: () => Promise<EntityManager>): Promise<SchemaMetadata> {
    if (this._schemaModel.length > 0) return Promise.resolve(this);
    const emInst = await em();
    this._schemaModel = emInst.connection.entityMetadatas.map(mdItem => {
      console.log('mdItem - ', mdItem);
      return {
        entityName: mdItem.name,
        hasNonNullableRelations: mdItem.hasNonNullableRelations,
        foreignKeys: mdItem.foreignKeys.map(item => item.referencedEntityMetadata.name)
      };
    });
    console.log('====================================');
    this.generateEntitiesOrderedList();
    return this;
  }

  generateEntitiesOrderedList() {
    const graph = new Graph();
    graph.schemeMetadataToFkGraph(this._schemaModel);
    graph.generateSortedData();
    this._entitiesOrderedList = graph.sortedGraphListDFS;
    this._entitiesRelationsChains = graph.vertexesFullChains;
  }
}
