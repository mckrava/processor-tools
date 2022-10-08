"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SchemaMetadata = void 0;
class Graph {
    constructor() {
        this.graphSource = [];
        this.adjacencyList = {};
        this.topNums = new Map();
        this._vertexesTreeFull = {};
        this._rootVertexesListOrdered = [];
        this.rootVertexCursor = '';
    }
    get vertexesTreeFull() {
        return new Map(Object.entries(this._vertexesTreeFull));
    }
    get sortedVertexesListDFS() {
        return this._rootVertexesListOrdered;
    }
    addVertex(vertex) {
        if (!this.adjacencyList[vertex]) {
            this.adjacencyList[vertex] = [];
        }
    }
    addEdge(v1, v2) {
        this.adjacencyList[v1].push(v2);
    }
    schemeMetadataToFkGraph(metadata) {
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
    generateVertexesTree() {
        const vertices = Object.keys(this.adjacencyList);
        for (const v of vertices) {
            this.rootVertexCursor = v;
            this._vertexesTreeFull[this.rootVertexCursor] = [];
            this.generateVertexesTreeHelper(v);
        }
        for (const edgeRoot in this._vertexesTreeFull) {
            const list = this._vertexesTreeFull[edgeRoot].reverse().filter((x, i, a) => a.indexOf(x) == i);
            this._vertexesTreeFull[edgeRoot] = this._rootVertexesListOrdered.filter(rvl => list.includes(rvl));
        }
    }
    generateVertexesTreeHelper(v) {
        const neighbors = this.adjacencyList[v];
        for (const neighbor of neighbors) {
            this._vertexesTreeFull[this.rootVertexCursor].push(neighbor);
            this.generateVertexesTreeHelper(neighbor);
            // TODO add handler of cyclic
        }
    }
    sortDFS() {
        const vertices = Object.keys(this.adjacencyList);
        const visited = {};
        const visitedTmp = {};
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
    dfsSortHelper(v, n, visited, visitedTmp) {
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
class SchemaMetadata {
    constructor() {
        this._schemaModel = [];
        this._entitiesOrderedList = [];
        this._entitiesRelationsTree = new Map();
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
    async getMetadata(em) {
        if (this._schemaModel.length > 0)
            return Promise.resolve(this);
        const emInst = await em();
        this._schemaModel = emInst.connection.entityMetadatas.map(mdItem => {
            return {
                entityName: mdItem.name,
                hasNonNullableRelations: mdItem.hasNonNullableRelations,
                foreignKeys: mdItem.foreignKeys.map(item => item.referencedEntityMetadata.name)
            };
        });
        this.generateEntitiesOrderedList();
        return this;
    }
    generateEntitiesOrderedList() {
        const graph = new Graph();
        graph.schemeMetadataToFkGraph(this._schemaModel);
        graph.generateSortedData();
        this._entitiesOrderedList = graph.sortedVertexesListDFS;
        this._entitiesRelationsTree = graph.vertexesTreeFull;
    }
}
exports.SchemaMetadata = SchemaMetadata;
//# sourceMappingURL=schemaMetadata.js.map