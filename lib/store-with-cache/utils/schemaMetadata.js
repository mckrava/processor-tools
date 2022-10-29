"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SchemaMetadata = void 0;
const tools_1 = require("@subsquid/openreader/lib/tools");
const logger_1 = require("@subsquid/logger");
const schemaGraph_1 = require("./schemaGraph");
class SchemaMetadata {
    constructor(projectDir) {
        this._schemaMetadata = new Map();
        this._schemaMetadataSummarizedFk = new Map();
        this._entitiesOrderedList = [];
        this._entitiesRelationsTree = new Map();
        this.projectDir = projectDir;
        this._graphInstance = new schemaGraph_1.Graph();
        this.processSchema();
    }
    get schemaMetadata() {
        return this._schemaMetadata;
    }
    get schemaMetadataSummarizedFk() {
        return this._schemaMetadataSummarizedFk;
    }
    get entitiesOrderedList() {
        return this._entitiesOrderedList;
    }
    get entitiesRelationsTree() {
        return this._entitiesRelationsTree;
    }
    processSchema() {
        let model = (0, tools_1.loadModel)((0, tools_1.resolveGraphqlSchema)(this.projectDir));
        this._schemaMetadata = new Map();
        this._schemaMetadataSummarizedFk = new Map();
        for (const name in model) {
            const item = model[name];
            if (item.kind !== 'entity')
                continue;
            let fkList = new Map();
            const fksNullability = new Map();
            for (const propName in item.properties) {
                const propData = item.properties[propName];
                if (propData.type.kind === 'fk') {
                    fkList.set(propName, {
                        entityName: propData.type.entity,
                        isNullable: propData.nullable,
                        propName
                    });
                    if (!fksNullability.has(propData.type.entity)) {
                        fksNullability.set(propData.type.entity, propData.nullable);
                    }
                    else {
                        if (fksNullability.get(propData.type.entity))
                            fksNullability.set(propData.type.entity, propData.nullable);
                    }
                }
            }
            this._schemaMetadata.set(name, {
                entityName: name,
                foreignKeys: fkList
            });
            /**
             * We need collapse foreign keys by its value entity class. If at least one FK has "isNullable === false"
             * so resulted/summarized "isNullable" status will be "false".
             */
            this._schemaMetadataSummarizedFk.set(name, new Map([...fkList.values()].map(fk => [fk.entityName, fksNullability.get(fk.entityName) ?? false])));
        }
        // this.generateEntitiesOrderedList();
        return this;
    }
    sortClassesByEntitiesList(entities) {
        let logger = (0, logger_1.createLogger)('sqd:store').child('schema_metadata');
        this._graphInstance.setGraphSources({
            schemaMetadata: this._schemaMetadata,
            schemaMetadataSummarizedFk: this._schemaMetadataSummarizedFk
        });
        this._graphInstance.entitiesListToFkGraph(entities);
        this._graphInstance.generateSortedData();
        this._entitiesOrderedList = this._graphInstance.sortedVertexesListBFS;
        this._entitiesRelationsTree = this._graphInstance.vertexesTreeFull;
        // logger.trace(this._graphInstance.sortedVertexesListBFS, `entitiesOrderedList`);
        // logger.trace(Object.fromEntries(this._graphInstance.vertexesTreeFull), `entitiesRelationsTree`);
    }
    generateEntitiesOrderedList() {
        let logger = (0, logger_1.createLogger)('sqd:store').child('schema_metadata');
        this._graphInstance.setGraphSources({
            schemaMetadata: this._schemaMetadata,
            schemaMetadataSummarizedFk: this._schemaMetadataSummarizedFk
        });
        this._graphInstance.schemeMetadataToFkGraph();
        this._graphInstance.generateSortedData();
        this._entitiesOrderedList = this._graphInstance.sortedVertexesListBFS;
        this._entitiesRelationsTree = this._graphInstance.vertexesTreeFull;
        // logger.trace(this._schemaMetadata, `schemaMetadata`);
        // logger.trace(this._graphInstance.sortedVertexesListBFS, `entitiesOrderedList`);
        // logger.trace(Object.fromEntries(this._graphInstance.vertexesTreeFull), `entitiesRelationsTree`);
    }
}
exports.SchemaMetadata = SchemaMetadata;
//# sourceMappingURL=schemaMetadata.js.map