import { EntityManager } from 'typeorm';
declare type EntityMetadataDecorated = {
    entityName: string;
    foreignKeys: string[];
};
export declare class SchemaMetadata {
    private _schemaModel;
    private _entitiesOrderedList;
    private _entitiesRelationsTree;
    get schemaModel(): EntityMetadataDecorated[];
    get entitiesOrderedList(): string[];
    get entitiesRelationsTree(): Map<string, string[]>;
    getMetadata(em: () => Promise<EntityManager>): Promise<SchemaMetadata>;
    generateEntitiesOrderedList(): void;
}
export {};
//# sourceMappingURL=schemaMetadata.d.ts.map