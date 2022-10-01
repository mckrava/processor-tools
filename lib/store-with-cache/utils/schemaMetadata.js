"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getSchemaMetadata = void 0;
const tools_1 = require("@subsquid/openreader/lib/tools");
function sortRelations(originalList) {
    const sorted = [...originalList.entries()].sort((a, b) => a[1] > b[1] ? -1 : b[1] > a[1] ? 1 : 0);
    return new Map(sorted);
}
function getSchemaMetadata() {
    let model = (0, tools_1.loadModel)((0, tools_1.resolveGraphqlSchema)());
    let fkList = [];
    const fkNotNullableMap = new Map();
    const entitiesListFull = [];
    for (const name in model) {
        const item = model[name];
        if (item.kind !== 'entity')
            continue;
        entitiesListFull.push(name);
        for (const propName in item.properties) {
            const propData = item.properties[propName];
            if (propData.type.kind === 'fk' && propData.nullable)
                fkList.push(propData.type.entity);
            if (propData.type.kind === 'fk' && !propData.nullable)
                fkNotNullableMap.set(propData.type.entity, (fkNotNullableMap.get(propData.type.entity) || 0) + 1);
        }
    }
    fkNotNullableMap.forEach((val, key, map) => map.set(key, val * 1000));
    fkList.forEach(item => fkNotNullableMap.set(item, (fkNotNullableMap.get(item) || 0) + 1));
    const fullList = [
        ...sortRelations(fkNotNullableMap).keys(),
        ...entitiesListFull.filter(item => !fkNotNullableMap.has(item))
    ];
    return {
        schemaModel: model,
        entitiesOrderedList: fullList
    };
}
exports.getSchemaMetadata = getSchemaMetadata;
//# sourceMappingURL=schemaMetadata.js.map