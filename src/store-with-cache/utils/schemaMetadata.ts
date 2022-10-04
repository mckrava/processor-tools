import {
  loadModel,
  resolveGraphqlSchema
} from '@subsquid/openreader/lib/tools';
import { Model } from '@subsquid/openreader/src/model';

export interface SchemeMetadata {
  schemaModel: Model;
  entitiesOrderedList: string[];
}

/**
 * Sort entities list regarding its score.
 * @param originalList
 */
function sortRelations(originalList: Map<string, number>): Map<string, number> {
  const sorted = [...originalList.entries()].sort((a, b) =>
    a[1] > b[1] ? -1 : b[1] > a[1] ? 1 : 0
  );

  return new Map(sorted);
}

/**
 * Generates DB schema model due to existing project "schema.graphql" file.
 * Based on generated DB schema model creates order list of all existing entities.
 * Ordered list should be used for flushAll process in StoreWithCache.
 *
 * Order of entities is following to the next logic (list position is equal to priority level in the order):
 * 1) entities, which are values of not nullable foreign keys fields.
 *    These items are sorted by frequency with which they used as foreign key in all entities.
 * 2) entities, which are values of nullable foreign keys fields.
 *    These items are sorted by frequency with which they used as foreign key in all entities.
 * 3) all other entities which do not fit to 2 previous rules.
 */
export function getSchemaMetadata(): SchemeMetadata {
  let model = loadModel(resolveGraphqlSchema());

  let fkNullableEs = [];
  const fkEntities = new Map<string, number>();
  const entitiesListFull = [];

  for (const name in model) {
    const item = model[name];
    if (item.kind !== 'entity') continue;
    entitiesListFull.push(name);

    for (const propName in item.properties) {
      const propData = item.properties[propName];
      if (propData.type.kind === 'fk' && propData.nullable)
        fkNullableEs.push(propData.type.entity);

      if (propData.type.kind === 'fk' && !propData.nullable)
        fkEntities.set(
          propData.type.entity,
          (fkEntities.get(propData.type.entity) || 0) + 1
        );
    }
  }
  fkEntities.forEach((val, key, map) => map.set(key, val * 1000));

  fkNullableEs.forEach(item =>
    fkEntities.set(item, (fkEntities.get(item) || 0) + 1)
  );

  const fullList = [
    ...sortRelations(fkEntities).keys(),
    ...entitiesListFull.filter(item => !fkEntities.has(item))
  ];

  return {
    schemaModel: model,
    entitiesOrderedList: fullList
  };
}
