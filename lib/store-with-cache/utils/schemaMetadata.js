"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SchemaMetadata = void 0;
class Graph {
    constructor() {
        this.adjacencyList = {};
        this.topNums = new Map();
    }
    addVertex(vertex) {
        if (!this.adjacencyList[vertex]) {
            this.adjacencyList[vertex] = [];
        }
    }
    addEdge(v1, v2) {
        this.adjacencyList[v1].push(v2);
    }
    getSortedDFS() {
        const vertices = Object.keys(this.adjacencyList);
        const visited = {};
        const visitedTmp = {};
        let n = vertices.length - 1;
        for (const v of vertices) {
            if (!visited[v]) {
                n = this.dfsTopSortHelper(v, n, visited, visitedTmp);
            }
        }
        return [...this.topNums.entries()].sort((a, b) => (a[1] > b[1] ? -1 : b[1] > a[1] ? 1 : 0)).map(item => item[0]);
    }
    dfsTopSortHelper(v, n, visited, visitedTmp) {
        const neighbors = this.adjacencyList[v];
        for (const neighbor of neighbors) {
            if (!visited[neighbor]) {
                if (visitedTmp[neighbor]) {
                    const msg = `Relations cycle has been detected: ${neighbor} -> ${v} -> ${neighbor}`;
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
class SchemaMetadata {
    constructor() {
        this._schemaModel = [];
        this._entitiesOrderedList = [];
    }
    get schemaModel() {
        return this._schemaModel;
    }
    get entitiesOrderedList() {
        return this._entitiesOrderedList;
    }
    async getMetadata(em) {
        if (this._schemaModel.length > 0)
            return Promise.resolve(this);
        const emInst = await em();
        this._schemaModel = emInst.connection.entityMetadatas.map(mdItem => {
            return {
                entityName: mdItem.name,
                foreignKeys: mdItem.foreignKeys.map(item => item.referencedEntityMetadata.name)
            };
        });
        this.generateEntitiesOrderedList();
        return this;
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
exports.SchemaMetadata = SchemaMetadata;
//# sourceMappingURL=schemaMetadata.js.map