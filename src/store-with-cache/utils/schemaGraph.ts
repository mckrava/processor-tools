import { CachedModel, EntityClassConstructable } from '../store';
import { SchemaMetadataStruct, SchemaMetadataSummarizedFk } from './schemaMetadata';

export class Graph {
  private schemaMetadata: SchemaMetadataStruct = new Map();
  private schemaMetadataSummarizedFk: SchemaMetadataSummarizedFk = new Map();
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

  entitiesListToFkGraph(entities: Map<EntityClassConstructable, Map<string, CachedModel<EntityClassConstructable>>>) {
    const adjacencyMapTmp = new Map<string, Set<string>>();
    const existingClasses = new Set([...entities.keys()]);

    existingClasses.forEach(cl => adjacencyMapTmp.set(cl.name, new Set<string>()));

    // this.setGraphSource(metadata);

    entities.forEach((items, entityClass: EntityClassConstructable) => {
      const classMetadata = this.schemaMetadata.get(entityClass.name);
      if (!classMetadata) throw Error(`Class ${entityClass.name} metadata is not available`);

      items.forEach((item, id) => {
        classMetadata.foreignKeys.forEach(fk => {
          if (item[fk.propName as keyof CachedModel<EntityClassConstructable>] && adjacencyMapTmp.has(fk.entityName)) {
            adjacencyMapTmp.get(entityClass.name)!.add(fk.entityName);
          }
        });
      });
    });

    adjacencyMapTmp.forEach((val, key) => {
      this.addVertex(key);
      val.forEach(fkEntityName => this.addEdge(key, fkEntityName));
    });
  }

  schemeMetadataToFkGraph() {
    // this.setGraphSource(metadata);

    this.schemaMetadataSummarizedFk.forEach((val, key) => this.addVertex(key));

    this.schemaMetadataSummarizedFk.forEach((val, key) => {
      this.addVertex(key);

      for (const fkClassName of val.keys()) {
        this.addEdge(key, fkClassName);
      }
    });
  }

  setGraphSources({
    schemaMetadata,
    schemaMetadataSummarizedFk
  }: {
    schemaMetadata: SchemaMetadataStruct;
    schemaMetadataSummarizedFk: SchemaMetadataSummarizedFk;
  }) {
    this.schemaMetadata = schemaMetadata;
    this.schemaMetadataSummarizedFk = schemaMetadataSummarizedFk;
    this.adjacencyList = {};
    this.topNums = new Map();
    this._vertexesTreeFull = {};
  }

  sortBFS() {
    let indegree: Record<string, number> = {};
    this.schemaMetadataSummarizedFk.forEach((val, key) => (indegree[key] = 0));

    this.schemaMetadataSummarizedFk.forEach((val, key) => {
      let neighbors = this.adjacencyList[key];
      if (neighbors) {
        for (const neighbor of neighbors) {
          indegree[neighbor]++;
        }
      }
    });

    let q: string[] = [];
    this.schemaMetadataSummarizedFk.forEach((val, key) => {
      if (this.adjacencyList[key] && indegree[key] == 0) q.push(key);
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
    if (cnt === Object.keys(this.adjacencyList).length) {
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

      const neighborsDetails = this.schemaMetadataSummarizedFk.get(cItem)!;
      neighborsDetails.forEach((isNullable, className) => {
        if (className in cyclicIndegree && isNullable) --cyclicIndegree[className];
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

    if (cnt != Object.keys(this.adjacencyList).length) {
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
        if (this.schemaMetadataSummarizedFk.get(v)!.get(neighbor)) {
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
          if (this.schemaMetadataSummarizedFk.get(v)!.get(neighbor)) {
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

  generateSortedData() {
    this.sortBFS();
    this.generateVertexesTree(this._rootVertexesListOrderedBFS);
  }
}
