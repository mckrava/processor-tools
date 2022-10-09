"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.StoreWithCache = exports.CacheStorage = exports.FullTypeormDatabase = exports.TypeormDatabase = void 0;
const typeorm_1 = require("typeorm");
const assert_1 = __importDefault(require("assert"));
var typeorm_store_1 = require("@subsquid/typeorm-store");
Object.defineProperty(exports, "TypeormDatabase", { enumerable: true, get: function () { return typeorm_store_1.TypeormDatabase; } });
Object.defineProperty(exports, "FullTypeormDatabase", { enumerable: true, get: function () { return typeorm_store_1.FullTypeormDatabase; } });
class CacheStorage {
    constructor() {
        this.entities = new Map();
        this.entitiesNames = new Map();
        this.entitiesForFlush = new Map();
        this.deferredGetList = new Map();
        this.deferredRemoveList = new Map();
    }
    static getInstance() {
        if (!CacheStorage.instance) {
            CacheStorage.instance = new CacheStorage();
        }
        return CacheStorage.instance;
    }
    setEntityName(entityClass) {
        this.entitiesNames.set(entityClass.name, entityClass);
    }
}
exports.CacheStorage = CacheStorage;
class StoreWithCache {
    constructor(em, cacheStorage, schemaMetadata) {
        this.em = em;
        this.cacheStorage = cacheStorage;
        this.schemaMetadata = schemaMetadata;
    }
    /**
     * Add requests for find entities by "FindManyOptions" parameters.
     * Can be useful if user needs fetch list of entities by id with
     * additional check for "soft remove" flag (e.g. additional field
     * "deleted: true" or "active: false")
     */
    // TODO theoretically won't be used as original .find***() method
    //  can be used which will save results into local cache store
    //  underhood.
    // deferredLoad<T extends Entity>(entityConstructor: EntityClass<T>, findOptions?: FindOptionsWhere<T> | FindOptionsWhere<T>[]): StoreWithCache;
    deferredLoad(entityConstructor, idOrList) {
        this.cacheStorage.setEntityName(entityConstructor);
        if (!idOrList) {
            this.cacheStorage.deferredGetList.set(entityConstructor, new Set().add('*'));
            return this;
        }
        else if (typeof idOrList === 'string' || Array.isArray(idOrList)) {
            const idsList = this.cacheStorage.deferredGetList.get(entityConstructor) || new Set();
            for (const idItem of Array.isArray(idOrList) ? idOrList : [idOrList]) {
                idsList.add(idItem);
            }
            this.cacheStorage.deferredGetList.set(entityConstructor, idsList);
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
        this.cacheStorage.setEntityName(entityConstructor);
        const defRemIdsList = this.cacheStorage.deferredRemoveList.get(entityConstructor) || new Set();
        for (const idItem of Array.isArray(idOrList) ? idOrList : [idOrList]) {
            defRemIdsList.add(idItem);
        }
        this.cacheStorage.deferredRemoveList.set(entityConstructor, defRemIdsList);
        const cachedEntities = this.cacheStorage.entities.get(entityConstructor) || new Map();
        let isIntersection = false;
        defRemIdsList.forEach(defRemItemId => {
            if (cachedEntities.has(defRemItemId)) {
                cachedEntities.delete(defRemItemId);
                isIntersection = true;
            }
        });
        if (isIntersection)
            this.cacheStorage.entities.set(entityConstructor, cachedEntities);
        return this;
    }
    _upsert(entityOrList, setForFlush) {
        if (Array.isArray(entityOrList) && entityOrList.length === 0)
            return;
        const entityClassConstructor = (Array.isArray(entityOrList) ? entityOrList[0] : entityOrList)
            .constructor;
        const existingEntities = this.cacheStorage.entities.get(entityClassConstructor) || new Map();
        const existingEntitiesForFlush = this.cacheStorage.entitiesForFlush.get(entityClassConstructor) || new Set();
        this.cacheStorage.setEntityName(entityClassConstructor);
        for (let entity of Array.isArray(entityOrList) ? entityOrList : [entityOrList]) {
            let entityDecorated = entity;
            for (const entityFieldName in entity) {
                let fieldValue = entity[entityFieldName];
                if (fieldValue !== null && typeof fieldValue === 'object' && !Array.isArray(fieldValue) && 'id' in fieldValue) {
                    const fieldValueDecorated = fieldValue;
                    entityDecorated[entityFieldName] = {
                        id: fieldValueDecorated.id
                    };
                    this._upsert(fieldValue, false);
                }
            }
            existingEntities.set(entityDecorated.id, entityDecorated);
            if (setForFlush)
                existingEntitiesForFlush.add(entity.id);
        }
        this.cacheStorage.entities.set(entityClassConstructor, existingEntities);
        if (setForFlush)
            this.cacheStorage.entitiesForFlush.set(entityClassConstructor, existingEntitiesForFlush);
    }
    cacheUpsert(e) {
        this._upsert(e, true);
    }
    /**
     * Load all deferred get from the db, clear deferredLoad and deferredFindWhereList items list,
     * set loaded items to cache storage.
     */
    async load() {
        for (const [entityClass, idsSet] of this.cacheStorage.deferredGetList.entries()) {
            /**
             * Fetch all available entities of iterated class.
             */
            if (idsSet.has('*')) {
                const entitiesList = await this.find(entityClass, {
                    where: {}
                });
                this._upsert(entitiesList, false);
                continue;
            }
            if (!idsSet || idsSet.size === 0)
                continue;
            const entitiesList = await this.find(entityClass, {
                where: { id: (0, typeorm_1.In)([...idsSet.values()]) }
            });
            this._upsert(entitiesList, false);
        }
        this.cacheStorage.deferredGetList.clear();
    }
    /**
     * Persist all updates to the db.
     *
     * "this.cacheStorage.entitiesForFlush" Map can contain entities IDs, which are not presented in cache store. It's possible after
     * execution of ".delete || .clear || .deferredRemove" methods. But as cache store doesn't contain removed items,
     * they won't be accidentally saved into DB.
     */
    async cacheFlush() {
        await this._flushAll();
        this.cacheStorage.deferredRemoveList.clear();
    }
    async _flushAll() {
        for (const i in this.schemaMetadata.entitiesOrderedList) {
            if (this.cacheStorage.entitiesNames.has(this.schemaMetadata.entitiesOrderedList[i])) {
                await this._flushByClass(this.cacheStorage.entitiesNames.get(this.schemaMetadata.entitiesOrderedList[i]));
            }
        }
    }
    async _flushByClass(entityConstructor, recursive = false) {
        /**
         * We need to save all relations of current class beforehand by relations tree of this class to avoid
         * "violates foreign key constraint" errors.
         */
        if (recursive) {
            if (this.schemaMetadata.entitiesRelationsTree.has(entityConstructor.name)) {
                for (const relName of this.schemaMetadata.entitiesRelationsTree.get(entityConstructor.name) || []) {
                    if (this.cacheStorage.entitiesNames.has(relName))
                        await this._flushByClass(this.cacheStorage.entitiesNames.get(relName), false);
                }
            }
        }
        if (this.cacheStorage.entitiesForFlush.has(entityConstructor)) {
            const forFlush = this.cacheStorage.entitiesForFlush.get(entityConstructor) || new Set();
            const listForSave = [
                ...(this.cacheStorage.entities.get(entityConstructor) || new Map()).values()
            ].filter(entity => forFlush.has(entity.id));
            await this._save(listForSave);
            this.cacheStorage.entitiesForFlush.set(entityConstructor, new Set());
        }
        if (this.cacheStorage.deferredRemoveList.has(entityConstructor)) {
            await this._remove(entityConstructor, [
                ...(this.cacheStorage.deferredRemoveList.get(entityConstructor) || new Set()).values()
            ]);
            this.cacheStorage.deferredRemoveList.set(entityConstructor, new Set());
        }
    }
    /**
     * Check by ID if entity is existing in cache
     */
    cacheHas(entityConstructor, id) {
        return (this.cacheStorage.entities.get(entityConstructor) || new Map()).has(id);
    }
    /**
     * Get all entities of specific class.
     * Returns a new iterator object that contains the values for
     * each element in the Map object in insertion order.
     */
    cacheValues(entityConstructor) {
        return (this.cacheStorage.entities.get(entityConstructor) || new Map()).values() || null;
    }
    /**
     * Returns full cache data
     */
    cacheEntries() {
        return this.cacheStorage.entities;
    }
    /**
     * Delete entity item from cache storage of the specific class
     */
    cacheDelete(entityConstructor, idOrList) {
        if (!this.cacheStorage.entities.has(entityConstructor))
            return;
        for (const id of Array.isArray(idOrList) ? idOrList : [idOrList]) {
            this.cacheStorage.entities.get(entityConstructor).delete(id);
        }
    }
    /**
     * Delete all entities of specific class from cache storage
     */
    cacheClear(entityConstructor) {
        if (!this.cacheStorage.entities.has(entityConstructor))
            return;
        this.cacheStorage.entities.get(entityConstructor).clear();
    }
    /**
     * Purge current cache.
     */
    cachePurge() {
        this.cacheStorage.entities.clear();
    }
    /**
     * If there are unresolved gets
     */
    cacheReady() {
        return false;
    }
    /**
     * If there were upsets after Cache.load()
     */
    cacheIsDirty() {
        // return this.cacheStorage.deferredGetList.size > 0 || this.deferredFindWhereList.size > 0;
        return this.cacheStorage.deferredGetList.size > 0;
    }
    /**
     * ::: TypeORM Store methods :::
     */
    async _processFetch(e, fetchCb) {
        const entityClass = this._extractEntityClass(e);
        this.cacheStorage.setEntityName(entityClass);
        await this._flushByClass(entityClass, true);
        const response = await fetchCb();
        if (response !== undefined && typeof response !== 'number') {
            this._upsert(response, false);
        }
        return response; // TODO should be returned the same entity instance as located in local cache store
    }
    async save(e) {
        this._upsert(e, false);
        await this._save(e);
    }
    // private _save<E extends Entity>(entity: E): Promise<void>;
    // private _save<E extends Entity>(entities: E[]): Promise<void>;
    async _save(e) {
        if (Array.isArray(e)) {
            if (e.length == 0)
                return;
            let entityClass = e[0].constructor;
            for (let i = 1; i < e.length; i++) {
                (0, assert_1.default)(entityClass === e[i].constructor, 'mass saving allowed only for entities of the same class');
            }
            await this.em().then(em => this.saveMany(em, entityClass, e));
        }
        else {
            await this.em().then(em => em.upsert(e.constructor, e, ['id']));
        }
    }
    async saveMany(em, entityClass, entities) {
        (0, assert_1.default)(entities.length > 0);
        let metadata = em.connection.getMetadata(entityClass);
        let fk = metadata.columns.filter(c => c.relationMetadata);
        if (fk.length == 0)
            return this.upsertMany(em, entityClass, entities);
        let currentSignature = this.getFkSignature(fk, entities[0]);
        let batch = [];
        for (let e of entities) {
            let sig = this.getFkSignature(fk, e);
            if (sig === currentSignature) {
                batch.push(e);
            }
            else {
                await this.upsertMany(em, entityClass, batch);
                currentSignature = sig;
                batch = [e];
            }
        }
        if (batch.length) {
            await this.upsertMany(em, entityClass, batch);
        }
    }
    getFkSignature(fk, entity) {
        let sig = 0n;
        for (let i = 0; i < fk.length; i++) {
            let bit = fk[i].getEntityValue(entity) === undefined ? 0n : 1n;
            sig |= bit << BigInt(i);
        }
        return sig;
    }
    async upsertMany(em, entityClass, entities) {
        for (let b of splitIntoBatches(entities, 1000)) {
            await em.upsert(entityClass, b, ['id']);
        }
    }
    async insert(e) {
        this._upsert(e, false);
        if (Array.isArray(e)) {
            if (e.length == 0)
                return;
            let entityClass = e[0].constructor;
            for (let i = 1; i < e.length; i++) {
                (0, assert_1.default)(entityClass === e[i].constructor, 'mass saving allowed only for entities of the same class');
            }
            await this.em().then(async (em) => {
                for (let b of splitIntoBatches(e, 1000)) {
                    await em.insert(entityClass, b);
                }
            });
        }
        else {
            await this.em().then(em => em.insert(e.constructor, e));
        }
    }
    async remove(e, id) {
        if (id && !Array.isArray(e) && !('id' in e)) {
            this.cacheStorage.setEntityName(e);
            await this._flushByClass(e, true);
            await this._remove(e, id);
            this.cacheDelete(e, id);
        }
        else if (id == null && ((Array.isArray(e) && 'id' in e[0]) || (!Array.isArray(e) && 'id' in e))) {
            const entityClass = this._extractEntityClass(e);
            this.cacheStorage.setEntityName(entityClass);
            if (Array.isArray(e)) {
                for (let i = 1; i < e.length; i++) {
                    (0, assert_1.default)(entityClass === e[i].constructor, 'mass deletion allowed only for entities of the same class');
                }
            }
            const idOrList = Array.isArray(e) ? e.map(i => i.id) : e.id;
            await this._flushByClass(entityClass, true);
            await this._remove(e);
            this.cacheDelete(entityClass, idOrList);
        }
        else {
            return;
        }
    }
    /**
     * Deletes a given entity or entities from the database.
     *
     * Unlike {@link EntityManager.remove} executes a primitive DELETE query without cascades, relations, etc.
     */
    async _remove(e, id) {
        if (id == null) {
            if (Array.isArray(e)) {
                if (e.length == 0)
                    return;
                let entityClass = e[0].constructor;
                await this.em().then(em => em.delete(entityClass, e.map(i => i.id)));
            }
            else {
                let entity = e;
                await this.em().then(em => em.delete(entity.constructor, entity.id));
            }
        }
        else {
            await this.em().then(em => em.delete(e, id));
        }
    }
    count(entityClass, options) {
        return this._processFetch(entityClass, () => this.em().then(em => em.count(entityClass, options)));
    }
    countBy(entityClass, where) {
        return this._processFetch(entityClass, () => this.em().then(em => em.countBy(entityClass, where)));
    }
    find(entityClass, options) {
        return this._processFetch(entityClass, () => this.em().then(em => em.find(entityClass, {
            ...options,
            loadRelationIds: {
                disableMixedMap: true
            }
        })));
    }
    findBy(entityClass, where) {
        return this._processFetch(entityClass, () => this.em().then(em => em.find(entityClass, {
            loadRelationIds: {
                disableMixedMap: true
            },
            where
        })));
    }
    findOne(entityClass, options) {
        return this._processFetch(entityClass, () => this.em()
            .then(em => em.findOne(entityClass, {
            ...options,
            loadRelationIds: {
                disableMixedMap: true
            }
        }))
            .then(noNull));
    }
    findOneBy(entityClass, where) {
        return this._processFetch(entityClass, () => this.em()
            .then(em => em.findOneBy(entityClass, where))
            .then(noNull));
    }
    findOneOrFail(entityClass, options) {
        return this._processFetch(entityClass, () => this.em().then(em => em.findOneOrFail(entityClass, {
            ...options,
            loadRelationIds: {
                disableMixedMap: true
            }
        })));
    }
    findOneByOrFail(entityClass, where) {
        return this._processFetch(entityClass, () => this.em().then(em => em.findOneByOrFail(entityClass, where)));
    }
    /**
     * Get entity by ID either from cache or DB if cache storage doesn't contain requested item.
     * @param entityClass
     * @param id
     */
    get(entityClass, id) {
        return (((this.cacheStorage.entities.get(entityClass) || new Map()).get(id) ||
            this._processFetch(entityClass, () => this.findOneBy(entityClass, { id }))) ??
            null);
    }
    getOrFail(entityClass, id) {
        return ((this.cacheStorage.entities.get(entityClass) || new Map()).get(id) ||
            this._processFetch(entityClass, () => this.findOneByOrFail(entityClass, { id })));
    }
    /**
     * :::: UTILITY METHODS :::
     */
    _extractEntityClass(e) {
        const singleEnOrClass = Array.isArray(e) ? e[0] : e;
        return 'id' in singleEnOrClass
            ? singleEnOrClass.constructor
            : singleEnOrClass;
    }
}
exports.StoreWithCache = StoreWithCache;
function* splitIntoBatches(list, maxBatchSize) {
    if (list.length <= maxBatchSize) {
        yield list;
    }
    else {
        let offset = 0;
        while (list.length - offset > maxBatchSize) {
            yield list.slice(offset, offset + maxBatchSize);
            offset += maxBatchSize;
        }
        yield list.slice(offset);
    }
}
function noNull(val) {
    return val == null ? undefined : val;
}
//# sourceMappingURL=store.js.map