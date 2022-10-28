import { loadModel, resolveGraphqlSchema } from '@subsquid/openreader/lib/tools';
import { Model } from '@subsquid/openreader/src/model';
import { createLogger, Logger } from '@subsquid/logger';
import { CachedModel, EntityClassConstructable } from '../store';
import { Graph } from './schemaGraph';

export type EntityMetadataDecorated = {
  entityName: string;
  foreignKeys: { propName: string; entityName: string; isNullable: boolean }[];
};

export type SchemaMetadataStruct = Map<
  string,
  { entityName: string; foreignKeys: Map<string, { propName: string; entityName: string; isNullable: boolean }> }
>;
export type SchemaMetadataSummarizedFk = Map<string, Map<string, boolean>>;

export class SchemaMetadata {
  private _schemaMetadata: SchemaMetadataStruct = new Map();
  private _schemaMetadataSummarizedFk: SchemaMetadataSummarizedFk = new Map();

  private _entitiesOrderedList: string[] = [];
  private _entitiesRelationsTree: Map<string, string[]> = new Map();
  private _graphInstance: Graph;
  private projectDir: string | undefined;

  constructor(projectDir?: string) {
    this.projectDir = projectDir;
    this._graphInstance = new Graph();
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

  processSchema(): SchemaMetadata {
    let model: Model = loadModel(resolveGraphqlSchema(this.projectDir));
    this._schemaMetadata = new Map();
    this._schemaMetadataSummarizedFk = new Map();

    for (const name in model) {
      const item = model[name];
      if (item.kind !== 'entity') continue;
      let fkList = new Map();
      const fksNullability = new Map<string, boolean>();

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
          } else {
            if (fksNullability.get(propData.type.entity)) fksNullability.set(propData.type.entity, propData.nullable);
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
      this._schemaMetadataSummarizedFk.set(
        name,
        new Map([...fkList.values()].map(fk => [fk.entityName, fksNullability.get(fk.entityName) ?? false]))
      );
    }
    // this.generateEntitiesOrderedList();
    return this;
  }

  sortClassesByEntitiesList(
    entities: Map<EntityClassConstructable, Map<string, CachedModel<EntityClassConstructable>>>
  ) {
    let logger: Logger = createLogger('sqd:store').child('schema_metadata');
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
    let logger: Logger = createLogger('sqd:store').child('schema_metadata');
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
