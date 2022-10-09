declare type EntityMetadataDecorated = {
    entityName: string;
    foreignKeys: {
        entityName: string;
        isNullable: boolean;
    }[];
};
export declare class SchemaMetadata {
    private _schemaModel;
    private _entitiesOrderedList;
    private _entitiesRelationsTree;
    constructor();
    get schemaModel(): EntityMetadataDecorated[];
    get entitiesOrderedList(): string[];
    get entitiesRelationsTree(): Map<string, string[]>;
    processSchema(): SchemaMetadata;
    generateEntitiesOrderedList(): void;
}
export {};
//# sourceMappingURL=schemaMetadata.d.ts.map