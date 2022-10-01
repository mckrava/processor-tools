import {
  loadModel,
  resolveGraphqlSchema
} from '@subsquid/openreader/lib/tools';
import { Model } from '@subsquid/openreader/src/model';

export interface SchemeMetadata {
  schemaModel: Model;
  entitiesOrderedList: string[];
}

function sortRelations(originalList: Map<string, number>) {
  const sorted = [...originalList.entries()].sort((a, b) =>
    a[1] > b[1] ? -1 : b[1] > a[1] ? 1 : 0
  );

  return new Map(sorted);
}

export function getSchemaMetadata(): SchemeMetadata {
  let model = loadModel(resolveGraphqlSchema());

  let fkList = [];
  const fkNotNullableMap = new Map<string, number>();
  const entitiesListFull = [];

  for (const name in model) {
    const item = model[name];
    if (item.kind !== 'entity') continue;
    entitiesListFull.push(name);

    for (const propName in item.properties) {
      const propData = item.properties[propName];
      if (propData.type.kind === 'fk' && propData.nullable)
        fkList.push(propData.type.entity);

      if (propData.type.kind === 'fk' && !propData.nullable)
        fkNotNullableMap.set(
          propData.type.entity,
          (fkNotNullableMap.get(propData.type.entity) || 0) + 1
        );
    }
  }
  fkNotNullableMap.forEach((val, key, map) => map.set(key, val * 1000));

  fkList.forEach(item =>
    fkNotNullableMap.set(item, (fkNotNullableMap.get(item) || 0) + 1)
  );

  const fullList = [
    ...sortRelations(fkNotNullableMap).keys(),
    ...entitiesListFull.filter(item => !fkNotNullableMap.has(item))
  ];

  return {
    schemaModel: model,
    entitiesOrderedList: fullList
  };
}
