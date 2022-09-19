"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const assert_1 = __importDefault(require("assert"));
const typeorm_1 = require("typeorm");
class SquidCache {
    constructor() {
        this.processorContext = null;
        this.entityRelationsParams = new Map();
        this.cacheClassesMap = new Map();
        this.entities = new Map();
        this.entitiesForFlush = new Map();
        this.deferredGetList = new Map();
        this.deferredFindWhereList = new Map();
        this.deferredRemoveList = new Map();
    }
    /**
     * Initialize cache entities Map and relations config for fetching data in
     * load method. Current relations config will be actual for all fetch actions.
     * Relations will be saved in cache storage like related entities IDs
     * (e.g. not "token: Token" but "tokenId: string" ) and related entities will
     * be added to the list for load in the same level as parent entity. In such case,
     * if same related entity is changed by some logic, this updated related entity will
     * be available for all parent entities automatically. During Cache.flush all relations
     * will be updated as whole cache will be pushed to DB.
     *
     * IMPORTANT Cache.flush method (saving of all entities from cache) will use the same
     * order of saving of entities groups/classes as classes order in 'entityRelationsParams'
     * list. It's important to keep correct order for avoid errors during saving like above:
     *          QueryFailedError: insert or update on
     *          table "some_table" violates foreign key
     *          constraint "FK_f74dc53460944a424b56b8f7da5"
     */
    init(ctx, entityRelationsParams) {
        this.processorContext = ctx;
        for (const paramsItem of entityRelationsParams) {
            let entityClass = paramsItem;
            let relations = null;
            if (Array.isArray(paramsItem)) {
                entityClass = paramsItem[0];
                relations = paramsItem[1];
            }
            this.entityRelationsParams.set(entityClass, relations);
            this.cacheClassesMap.set(entityClass.name, entityClass);
            this.entities.set(entityClass, new Map());
            this.entitiesForFlush.set(entityClass, new Set());
        }
    }
    /**
     * Get initialized cache instance
     */
    static getInstance() {
        if (!this.instance)
            this.instance = new SquidCache();
        return this.instance;
    }
    deferredLoad(entityConstructor, opt) {
        if (!opt) {
            this.deferredGetList.set(entityConstructor, new Set().add('*'));
            return this;
        }
        else if (typeof opt === 'string' || Array.isArray(opt)) {
            const idsList = this.deferredGetList.get(entityConstructor) || new Set();
            for (const idItem of Array.isArray(opt) ? opt : [opt]) {
                idsList.add(idItem);
            }
            this.deferredGetList.set(entityConstructor, idsList);
        }
        else {
            const whereOptions = Array.isArray(opt) ? opt : [opt];
            this.deferredFindWhereList.set(entityConstructor, [
                ...(this.deferredFindWhereList.get(entityConstructor) || []),
                ...whereOptions
            ]);
        }
        return this;
    }
    /**
     * Add ids of entities which should be removed, resolved after Cache.flush()
     * Keeps items as Map structure.
     * If item is added to the list for deferredRemove, it will be removed from local cache and won't be available for
     * Cache.get() method.
     */
    deferredRemove(entityConstructor, idOrList) {
        const defRemIdsList = this.deferredRemoveList.get(entityConstructor) || new Set();
        for (const idItem of Array.isArray(idOrList) ? idOrList : [idOrList]) {
            defRemIdsList.add(idItem);
        }
        this.deferredRemoveList.set(entityConstructor, defRemIdsList);
        const cachedEntities = this.entities.get(entityConstructor) || new Map();
        let isIntersection = false;
        defRemIdsList.forEach(defRemItemId => {
            if (cachedEntities.has(defRemItemId)) {
                cachedEntities.delete(defRemItemId);
                isIntersection = true;
            }
        });
        if (isIntersection)
            this.entities.set(entityConstructor, cachedEntities);
        return this;
    }
    /**
     * Check by ID if entity is existing in cache
     */
    has(entityConstructor, id) {
        return (this.entities.get(entityConstructor) || new Map()).has(id);
    }
    /**
     * Get entity by id form cache
     */
    get(entityConstructor, id) {
        return (this.entities.get(entityConstructor) || new Map()).get(id) || null;
    }
    /**
     * Get all entities of specific class.
     * Returns a new iterator object that contains the values for
     * each element in the Map object in insertion order.
     */
    values(entityConstructor) {
        return (this.entities.get(entityConstructor) || new Map()).values() || null;
    }
    /**
     * Returns full cache data
     */
    entries() {
        return this.entities;
    }
    /**
     * Delete entity item from cache storage of the specific class
     */
    delete(entityConstructor, id) {
        if (!this.entities.has(entityConstructor))
            return;
        this.entities.get(entityConstructor).delete(id);
    }
    /**
     * Delete all entities of specific class from cache storage
     */
    clear(entityConstructor) {
        if (!this.entities.has(entityConstructor))
            return;
        this.entities.get(entityConstructor).clear();
    }
    _upsert(entityOrList, setForFlush) {
        if (Array.isArray(entityOrList) && entityOrList.length === 0)
            return;
        const entityClassConstructor = (Array.isArray(entityOrList) ? entityOrList[0] : entityOrList)
            .constructor;
        const existingEntities = this.entities.get(entityClassConstructor) || new Map();
        const existingEntitiesForFlush = this.entitiesForFlush.get(entityClassConstructor) || new Set();
        for (let entity of Array.isArray(entityOrList) ? entityOrList : [entityOrList]) {
            let entityDecorated = entity;
            for (const entityFieldName in entity) {
                let fieldValue = entity[entityFieldName];
                if (typeof fieldValue === 'object' && fieldValue !== null && !Array.isArray(fieldValue)) {
                    const fieldValueDecorated = fieldValue;
                    if (!this.cacheClassesMap.has(fieldValueDecorated.constructor.name))
                        continue;
                    const relationsClass = this.cacheClassesMap.get(fieldValueDecorated.constructor.name);
                    (0, assert_1.default)(relationsClass);
                    this._upsert(fieldValue, false);
                    entityDecorated[entityFieldName] = {
                        id: fieldValueDecorated.id
                    };
                }
            }
            existingEntities.set(entityDecorated.id, entityDecorated);
            if (setForFlush)
                existingEntitiesForFlush.add(entity.id);
        }
        this.entities.set(entityClassConstructor, existingEntities);
        if (setForFlush)
            this.entitiesForFlush.set(entityClassConstructor, existingEntitiesForFlush);
    }
    upsert(entityOrList) {
        this._upsert(entityOrList, true);
    }
    /**
     * Load all deferred get from the db, clear deferredLoad and deferredFindWhereList items list,
     * set loaded items to cache storage.
     */
    async load() {
        (0, assert_1.default)(this.processorContext);
        for (const [entityClass, findOptionsList] of this.deferredFindWhereList.entries()) {
            const entityRelationsOptions = this.entityRelationsParams.get(entityClass);
            const entitiesList = await this.processorContext.store.find(entityClass, {
                where: findOptionsList,
                ...(!!entityRelationsOptions && {
                    loadRelationIds: {
                        relations: Object.keys(entityRelationsOptions || {}) || [],
                        disableMixedMap: true
                    }
                })
            });
            this._upsert(entitiesList, false);
        }
        for (const [entityClass, idsSet] of this.deferredGetList.entries()) {
            const entityRelationsOptions = this.entityRelationsParams.get(entityClass);
            /**
             * Fetch all available entities of iterated class.
             */
            if (idsSet.has('*')) {
                const entitiesList = await this.processorContext.store.find(entityClass, {
                    where: {},
                    ...(!!entityRelationsOptions && {
                        loadRelationIds: {
                            relations: Object.keys(entityRelationsOptions || {}) || [],
                            disableMixedMap: true
                        }
                    })
                });
                this._upsert(entitiesList, false);
                continue;
            }
            /**
             * Filter items by "id" which are already fetched accordingly "deferredFindWhereList".
             * As result avoid duplicated fetch.
             */
            const filteredIds = [...idsSet.values()].filter(id => !(this.entities.get(entityClass) || new Set()).has(id));
            if (!filteredIds || filteredIds.length === 0)
                continue;
            const entitiesList = await this.processorContext.store.find(entityClass, {
                where: { id: (0, typeorm_1.In)(filteredIds) },
                ...(!!entityRelationsOptions && {
                    loadRelationIds: {
                        relations: Object.keys(entityRelationsOptions || {}) || [],
                        disableMixedMap: true
                    }
                })
            });
            this._upsert(entitiesList, false);
        }
        /**
         * Separate list of relations from all deferredLoad items for further load
         */
        const relationsEntitiesIdsMap = new Map();
        /**
         * Collect entity relations IDs.
         */
        for (const [entityClass, entitiesMap] of this.entities.entries()) {
            const entityRelationsOptions = this.entityRelationsParams.get(entityClass);
            if (entitiesMap.size === 0 || !entityRelationsOptions)
                continue;
            for (const entityItem of entitiesMap.values()) {
                for (const relationName in entityRelationsOptions) {
                    const relationEntityClass = this.cacheClassesMap.get(Object.getPrototypeOf(entityItem).constructor.name);
                    if (!relationEntityClass)
                        continue;
                    /**
                     * Relations entity value is loaded from DB in view {id: string} | null
                     */
                    const relationEntityId = entityItem[relationName];
                    if (!relationEntityId)
                        continue;
                    /**
                     * If entity is already loaded, we need avoid extra fetch.
                     */
                    if ((this.entities.get(relationEntityClass) || new Map()).has(relationEntityId.id))
                        continue;
                    relationsEntitiesIdsMap.set(relationEntityClass, (relationsEntitiesIdsMap.get(relationEntityClass) || new Set()).add(relationEntityId.id));
                }
            }
        }
        if (relationsEntitiesIdsMap.size > 0) {
            /**
             * Fetch relations in this load flow is ignored and only one level of relations are supported.
             */
            for (const [entityClass, idsSet] of relationsEntitiesIdsMap.entries()) {
                const entitiesList = await this.processorContext.store.find(entityClass, {
                    where: { id: (0, typeorm_1.In)([...idsSet.values()]) }
                });
                this._upsert(entitiesList, false);
            }
        }
        this.deferredGetList.clear();
        this.deferredFindWhereList.clear();
    }
    /**
     * Persist all updates to the db.
     *
     * "this.entitiesForFlush" Map can contain entities IDs, which are not presented in cache store. It's possible after
     * execution of ".delete || .clear || .deferredRemove" methods. But as cache store doesn't contain removed items,
     * they won't be accidentally saved into DB.
     */
    async flush() {
        (0, assert_1.default)(this.processorContext);
        for (const [entityClass, entities] of this.entities.entries()) {
            const forFlush = this.entitiesForFlush.get(entityClass) || new Set();
            const listForSave = [...entities.entries()]
                .filter(([id, entity]) => forFlush.has(id))
                .map(([id, entity]) => entity);
            await this.processorContext.store.save(listForSave);
        }
        for (const [entityClass, idsSet] of this.deferredRemoveList.entries()) {
            await this.processorContext.store.remove(entityClass, [...idsSet.values()]);
        }
        this.deferredRemoveList.clear();
    }
    /**
     * Purge current cache.
     */
    purge() {
        this.entities.clear();
    }
    /**
     * If there are unresolved gets
     */
    ready() {
        return false;
    }
    /**
     * If there were upsets after Cache.load()
     */
    isDirty() {
        return this.deferredGetList.size > 0 || this.deferredFindWhereList.size > 0;
    }
}
exports.default = SquidCache.getInstance();
//# sourceMappingURL=index.js.map