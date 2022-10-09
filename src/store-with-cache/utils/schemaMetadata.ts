import { loadModel, resolveGraphqlSchema } from '@subsquid/openreader/lib/tools';
import { Model } from '@subsquid/openreader/src/model';

import { EntityManager } from 'typeorm';

type EntityMetadataDecorated = { entityName: string; foreignKeys: { entityName: string; isNullable: boolean }[] };
type GraphSourceMetadata = Map<
  string,
  { entityName: string; foreignKeys: Map<string, { entityName: string; isNullable: boolean }> }
>;

class Graph {
  private graphSource: GraphSourceMetadata = new Map();
  private adjacencyList: Record<string, string[]> = {};
  private topNums: Map<string, number> = new Map();
  private _vertexesTreeFull: Record<string, string[]> = {};
  private _rootVertexesListOrderedDFS: string[] = [];
  private _rootVertexesListOrderedBFS: string[] = [];
  private rootVertexCursor: string = '';

  get vertexesTreeFull(): Map<string, string[]> {
    return new Map(Object.entries(this._vertexesTreeFull));
  }
  get sortedVertexesListDFS() {
    return this._rootVertexesListOrderedDFS;
  }
  get sortedVertexesListBFS() {
    return this._rootVertexesListOrderedBFS;
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
    this.graphSource = new Map(
      metadata.map(el => {
        return [
          el.entityName,
          {
            entityName: el.entityName,
            foreignKeys: new Map(el.foreignKeys.map(fk => [fk.entityName, fk]))
          }
        ];
      })
    );
    this.graphSource.forEach((val, key) => this.addVertex(key));

    this.graphSource.forEach((val, key) => {
      this.addVertex(key);

      for (const fk of val.foreignKeys.keys()) {
        this.addEdge(key, fk);
      }
    });
  }

  generateSortedData() {
    this.sortBFS();
    this.generateVertexesTree(this._rootVertexesListOrderedBFS);
  }

  sortBFS() {
    let indegree: Record<string, number> = {};
    this.graphSource.forEach((val, key) => (indegree[key] = 0));

    this.graphSource.forEach((val, key) => {
      let neighbors = this.adjacencyList[key];
      for (const neighbor of neighbors) {
        indegree[neighbor]++;
      }
    });

    let q: string[] = [];
    this.graphSource.forEach((val, key) => {
      if (indegree[key] == 0) q.push(key);
    });

    let cnt = 0;
    let topOrder: string[] = [];

    while (q.length != 0) {
      let u = q.shift();
      topOrder.push(u!);
      for (let node = 0; node < this.adjacencyList[u!].length; node++) {
        if (--indegree[this.adjacencyList[u!][node]] == 0) q.push(this.adjacencyList[u!][node]);
      }
      cnt++;
    }

    /**
     * If graph doesn't have any cycles, sorting can be finished.
     */
    if (cnt === this.graphSource.size) {
      this._rootVertexesListOrderedBFS = topOrder.reverse();
      return;
    }

    /**
     * If graph has at least one, we need check are cyclic relations are nullable (required).
     * If relations is nullable so this relation can be ignored.
     */
    const cyclicIndegree: Record<string, number> = {};
    for (const item in indegree) {
      if (indegree[item] !== 0) cyclicIndegree[item] = indegree[item];
    }

    for (const cItem in cyclicIndegree) {
      // If this cyclic vertex is already processed
      if (cyclicIndegree[cItem] === 0) continue;

      const neighborsDetails = this.graphSource.get(cItem)!.foreignKeys;
      neighborsDetails.forEach((val, key) => {
        if (key in cyclicIndegree && val.isNullable) --cyclicIndegree[key];
      });
    }

    for (const i in cyclicIndegree) {
      if (cyclicIndegree[i] === 0) q.push(i);
    }

    /**
     * Process queue again with updated indegree values after nullable status check.
     */
    while (q.length != 0) {
      let u = q.shift();
      topOrder.push(u!);
      for (let node = 0; node < this.adjacencyList[u!].length; node++) {
        if (--cyclicIndegree[this.adjacencyList[u!][node]] == 0) q.push(this.adjacencyList[u!][node]);
      }
      cnt++;
    }

    if (cnt != this.graphSource.size) {
      const cyclicEntities = [];
      for (const i in cyclicIndegree) {
        if (cyclicIndegree[i] !== 0) cyclicEntities.push(i);
      }
      const errorMsg = `Schema relations cycle cannot be resolved automatically. 
        Please, check entities: ${cyclicEntities.join(', ')}`;

      throw new Error(errorMsg);
    }

    this._rootVertexesListOrderedBFS = topOrder.reverse();
  }

  sortDFS() {
    const vertices = Object.keys(this.adjacencyList);
    const visited: Record<string, boolean> = {};
    const visitedTmp: Record<string, boolean> = {};

    let n = vertices.length - 1;
    for (const v of vertices) {
      if (!visited[v]) {
        n = this.dfsSortHelper(v, n, visited, visitedTmp);
      }
    }

    this._rootVertexesListOrderedDFS = [...this.topNums.entries()]
      .sort((a, b) => (a[1] > b[1] ? -1 : b[1] > a[1] ? 1 : 0))
      .map(item => item[0]);
  }

  private dfsSortHelper(v: string, n: number, visited: Record<string, boolean>, visitedTmp: Record<string, boolean>) {
    const neighbors = this.adjacencyList[v];

    for (const neighbor of neighbors) {
      if (!visited[neighbor]) {
        if (visitedTmp[neighbor]) {
          if (this.graphSource.get(v)!.foreignKeys.get(neighbor)!.isNullable) {
            visitedTmp[neighbor] = true;
            continue;
          } else {
            const msg = `Relations cycle has been detected and cannot be resolved automatically: ${neighbor} -> ${v} -> ${neighbor}`;
            throw new Error(msg);
          }
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

  private generateVertexesTree(vertexesOrderList: string[]): void {
    const vertices = Object.keys(this.adjacencyList);
    const visitedTmp: Record<string, boolean> = {};

    for (const v of vertices) {
      this.rootVertexCursor = v;
      this._vertexesTreeFull[this.rootVertexCursor] = [];
      this.generateVertexesTreeHelper(v, visitedTmp);
    }

    for (const edgeRoot in this._vertexesTreeFull) {
      const list = this._vertexesTreeFull[edgeRoot].reverse().filter((x, i, a) => a.indexOf(x) == i);
      this._vertexesTreeFull[edgeRoot] = vertexesOrderList.filter(rvl => list.includes(rvl) && rvl !== edgeRoot);
    }
  }

  private generateVertexesTreeHelper(v: string, visitedTmp: Record<string, boolean>) {
    const neighbors = this.adjacencyList[v];
    neighborLoop: for (const neighbor of neighbors) {
      if (visitedTmp[neighbor]) {
        if (this.graphSource.get(v)!.foreignKeys.get(neighbor)!.isNullable) {
          visitedTmp[neighbor] = true;
          continue neighborLoop;
        } else {
          const msg = `Relations cycle has been detected and cannot be resolved automatically: ${neighbor} -> ${v} -> ${neighbor}`;
          throw new Error(msg);
        }
      }
      const subNeighbors = this.adjacencyList[neighbor];

      for (const subNeighbor of subNeighbors) {
        if (visitedTmp[subNeighbor]) {
          if (this.graphSource.get(subNeighbor)!.foreignKeys.get(neighbor)!.isNullable) {
            visitedTmp[neighbor] = true;
            this._vertexesTreeFull[this.rootVertexCursor].push(neighbor);
            continue neighborLoop;
          }
        }
      }

      visitedTmp[neighbor] = true;

      this._vertexesTreeFull[this.rootVertexCursor].push(neighbor);
      this.generateVertexesTreeHelper(neighbor, visitedTmp);
    }
    delete visitedTmp[v];
  }
}

export class SchemaMetadata {
  private _schemaModel: EntityMetadataDecorated[] = [];
  private _entitiesOrderedList: string[] = [];
  private _entitiesRelationsTree: Map<string, string[]> = new Map();

  constructor() {
    this.processSchema();
  }

  get schemaModel() {
    return this._schemaModel;
  }
  get entitiesOrderedList() {
    return this._entitiesOrderedList;
  }
  get entitiesRelationsTree() {
    return this._entitiesRelationsTree;
  }

  processSchema(): SchemaMetadata {
    let model = loadModel(resolveGraphqlSchema());

    for (const name in model) {
      const item = model[name];
      if (item.kind !== 'entity') continue;
      let fkList = [];

      for (const propName in item.properties) {
        const propData = item.properties[propName];

        if (propData.type.kind === 'fk')
          fkList.push({
            entityName: propData.type.entity,
            isNullable: propData.nullable
          });
      }

      this._schemaModel.push({
        entityName: name,
        foreignKeys: fkList
      });
    }

    this.generateEntitiesOrderedList();
    return this;
  }

  generateEntitiesOrderedList() {
    const graph = new Graph();
    graph.schemeMetadataToFkGraph(this._schemaModel);
    graph.generateSortedData();
    this._entitiesOrderedList = graph.sortedVertexesListBFS;
    this._entitiesRelationsTree = graph.vertexesTreeFull;
  }
}
