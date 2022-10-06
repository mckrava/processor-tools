import { EntityManager } from 'typeorm';
declare type EntityMetadataDecorated = {
    entityName: string;
    foreignKeys: string[];
};
export declare class SchemaMetadata {
    private _schemaModel;
    private _entitiesOrderedList;
    get schemaModel(): EntityMetadataDecorated[];
    get entitiesOrderedList(): string[];
    getMetadata(em: () => Promise<EntityManager>): Promise<SchemaMetadata>;
    generateEntitiesOrderedList(): void;
}
export {};
//# sourceMappingURL=schemaMetadata.d.ts.map