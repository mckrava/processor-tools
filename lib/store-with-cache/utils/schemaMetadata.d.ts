import { CachedModel, EntityClassConstructable } from '../store';
export declare type EntityMetadataDecorated = {
    entityName: string;
    foreignKeys: {
        propName: string;
        entityName: string;
        isNullable: boolean;
    }[];
};
export declare type SchemaMetadataStruct = Map<string, {
    entityName: string;
    foreignKeys: Map<string, {
        propName: string;
        entityName: string;
        isNullable: boolean;
    }>;
}>;
export declare type SchemaMetadataSummarizedFk = Map<string, Map<string, boolean>>;
export declare class SchemaMetadata {
    private _schemaMetadata;
    private _schemaMetadataSummarizedFk;
    private _entitiesOrderedList;
    private _entitiesRelationsTree;
    private _graphInstance;
    constructor();
    get schemaMetadata(): SchemaMetadataStruct;
    get schemaMetadataSummarizedFk(): SchemaMetadataSummarizedFk;
    get entitiesOrderedList(): string[];
    get entitiesRelationsTree(): Map<string, string[]>;
    processSchema(): SchemaMetadata;
    sortClassesByEntitiesList(entities: Map<EntityClassConstructable, Map<string, CachedModel<EntityClassConstructable>>>): void;
    generateEntitiesOrderedList(): void;
}
//# sourceMappingURL=schemaMetadata.d.ts.map