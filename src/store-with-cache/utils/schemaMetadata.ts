import { EntityManager } from 'typeorm';

type EntityMetadataDecorated = { entityName: string; foreignKeys: string[] };

class Graph {
  private adjacencyList: Record<string, string[]> = {};
  private topNums: Map<string, number> = new Map();

  addVertex(vertex: string) {
    if (!this.adjacencyList[vertex]) {
      this.adjacencyList[vertex] = [];
    }
  }
  addEdge(v1: string, v2: string) {
    this.adjacencyList[v1].push(v2);
  }

  getSortedDFS(): string[] {
    const vertices = Object.keys(this.adjacencyList);
    const visited: Record<string, boolean> = {};
    const visitedTmp: Record<string, boolean> = {};

    let n = vertices.length - 1;
    for (const v of vertices) {
      if (!visited[v]) {
        n = this.dfsTopSortHelper(v, n, visited, visitedTmp);
      }
    }
    return [...this.topNums.entries()]
      .sort((a, b) => (a[1] > b[1] ? -1 : b[1] > a[1] ? 1 : 0))
      .map(item => item[0]);
  }

  dfsTopSortHelper(
    v: string,
    n: number,
    visited: Record<string, boolean>,
    visitedTmp: Record<string, boolean>
  ) {
    const neighbors = this.adjacencyList[v];

    for (const neighbor of neighbors) {
      if (!visited[neighbor]) {
        if (visitedTmp[neighbor]) {
          const msg = `Cycle => ${v} -> ${neighbor}`;
          throw new Error(msg);
        }
        visitedTmp[neighbor] = true;

        n = this.dfsTopSortHelper(neighbor, n, visited, visitedTmp);
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

  get schemaModel() {
    return this._schemaModel;
  }
  get entitiesOrderedList() {
    return this._entitiesOrderedList;
  }

  generateMetadata(em: () => Promise<EntityManager>): void {
    em().then(emInst => {
      this._schemaModel = emInst.connection.entityMetadatas.map(mdItem => {
        return {
          entityName: mdItem.name,
          foreignKeys: mdItem.foreignKeys.map(
            item => item.referencedEntityMetadata.name
          )
        };
      });
      this.generateEntitiesOrderedList();
    });
  }

  generateEntitiesOrderedList() {
    const graph = new Graph();
    const modelDecorated = this._schemaModel.map(el => {
      return {
        ...el,
        foreignKeys: new Set(el.foreignKeys)
      };
    });
    modelDecorated.forEach(item => graph.addVertex(item.entityName));

    modelDecorated.forEach(item => {
      for (const fk of item.foreignKeys.values()) {
        graph.addEdge(item.entityName, fk);
      }
    });

    this._entitiesOrderedList = graph.getSortedDFS();
  }
}
