import { CachedModel, EntityClassConstructable } from '../store';
import { SchemaMetadataStruct, SchemaMetadataSummarizedFk } from './schemaMetadata';
export declare class Graph {
    private schemaMetadata;
    private schemaMetadataSummarizedFk;
    private adjacencyList;
    private topNums;
    private _vertexesTreeFull;
    private _rootVertexesListOrderedDFS;
    private _rootVertexesListOrderedBFS;
    private rootVertexCursor;
    get vertexesTreeFull(): Map<string, string[]>;
    get sortedVertexesListDFS(): string[];
    get sortedVertexesListBFS(): string[];
    addVertex(vertex: string): void;
    addEdge(v1: string, v2: string): void;
    entitiesListToFkGraph(entities: Map<EntityClassConstructable, Map<string, CachedModel<EntityClassConstructable>>>): void;
    schemeMetadataToFkGraph(): void;
    setGraphSources({ schemaMetadata, schemaMetadataSummarizedFk }: {
        schemaMetadata: SchemaMetadataStruct;
        schemaMetadataSummarizedFk: SchemaMetadataSummarizedFk;
    }): void;
    sortBFS(): void;
    private generateVertexesTree;
    private generateVertexesTreeHelper;
    generateSortedData(): void;
}
//# sourceMappingURL=schemaGraph.d.ts.map