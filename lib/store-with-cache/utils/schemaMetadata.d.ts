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
    generateMetadata(em: () => Promise<EntityManager>): void;
    generateEntitiesOrderedList(): void;
}
export {};
//# sourceMappingURL=schemaMetadata.d.ts.map