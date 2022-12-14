"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.Store = exports.CacheStorage = exports.FullTypeormDatabase = exports.TypeormDatabase = void 0;
const typeorm_1 = require("typeorm");
const assert_1 = __importDefault(require("assert"));
const logger_1 = require("@subsquid/logger");
var typeorm_store_1 = require("@subsquid/typeorm-store");
Object.defineProperty(exports, "TypeormDatabase", { enumerable: true, get: function () { return typeorm_store_1.TypeormDatabase; } });
Object.defineProperty(exports, "FullTypeormDatabase", { enumerable: true, get: function () { return typeorm_store_1.FullTypeormDatabase; } });
class CacheStorage {
    constructor() {
        this.entities = new Map();
        this.entityClassNames = new Map();
        this.entityIdsForFlush = new Map();
        this.deferredGetList = new Map();
        this.deferredRemoveList = new Map();
        this.entitiesForPreSave = new Map();
        this.entitiesPropsCache = new Map();
        this.entityIdsFetched = new Map();
        this.entityIdsNew = new Map();
    }
    static getInstance() {
        if (!CacheStorage.instance) {
            CacheStorage.instance = new CacheStorage();
        }
        return CacheStorage.instance;
    }
    get entitiesForFlushAll() {
        const entitiesForFlush = new Map();
        for (const [entityClass, idsForFlush] of [...this.entityIdsForFlush.entries()]) {
            if (idsForFlush.size === 0)
                continue;
            // const filteredItems = [...this.entities.get(entityClass)!.entries()].filter(i => idsForFlush.has(i[0]));
            entitiesForFlush.set(entityClass, this.getEntitiesForFlushByClass(entityClass));
        }
        return entitiesForFlush;
    }
    getEntitiesForFlushByClass(entityClass) {
        const idsForFlush = this.entityIdsForFlush.get(entityClass) || new Set();
        if (idsForFlush.size === 0)
            return new Map();
        return new Map([...(this.entities.get(entityClass) || new Map()).values()]
            .filter(entity => idsForFlush.has(entity.id))
            .map(i => [i.id, i]));
    }
    setEntityClassName(entityClass) {
        this.entityClassNames.set(entityClass.name, entityClass);
    }
    /**
     * If entity is newly created in current batch processing session, is will be added to "entityIdsNew" set
     * for further pre-saving flows. If "forFlush === false", entity is considered fetched from DB.
     */
    trackEntityStatus(e, forFlush) {
        const entityClass = e.constructor;
        if (!forFlush) {
            this.entityIdsFetched.set(entityClass, (this.entityIdsFetched.get(entityClass) || new Set()).add(e.id));
            if (this.entityIdsNew.has(entityClass))
                this.entityIdsNew.get(entityClass).delete(e.id);
            return;
        }
        if (!(this.entityIdsFetched.get(entityClass) || new Map()).has(e.id)) {
            this.entityIdsNew.set(entityClass, (this.entityIdsNew.get(entityClass) || new Set()).add(e.id));
        }
    }
    isEntityNew(e) {
        const entityClass = e.constructor;
        return (this.entityIdsNew.get(entityClass) || new Set()).has(e.id);
    }
    purgeCacheStorage() {
        this.entities.clear();
        this.entityIdsForFlush.clear();
        this.deferredGetList.clear();
        this.deferredRemoveList.clear();
        this.entitiesForPreSave.clear();
        this.entitiesPropsCache.clear();
        this.entityIdsFetched.clear();
        this.entityIdsNew.clear();
    }
}
exports.CacheStorage = CacheStorage;
class Store {
    constructor(em, cacheStorage, saveBatchSize, schemaMetadata, txCommit) {
        this.em = em;
        this.cacheStorage = cacheStorage;
        this.saveBatchSize = saveBatchSize;
        this.schemaMetadata = schemaMetadata;
        this.txCommit = txCommit;
    }
    /**
     * If there are unresolved gets
     */
    get ready() {
        return this.cacheStorage.deferredGetList.size === 0 && this.cacheStorage.deferredRemoveList.size === 0;
    }
    /**
     * If there were upsets after .load()
     */
    get isDirty() {
        return this.cacheStorage.entityIdsForFlush.size > 0;
    }
    /**
     * Returns full cache data
     */
    get entries() {
        return this.cacheStorage.entities;
    }
    /**
     * Returns full current map of ids for flush
     */
    get entityIdsForFlush() {
        return this.cacheStorage.entityIdsForFlush;
    }
    /**
     * Returns full current map of ids for load
     */
    get idsForDeferredLoad() {
        return this.cacheStorage.deferredGetList;
    }
    /**
     * UNSAFE method. Executes Entity Manager Transaction, initiated in current batch.
     * @constructor
     */
    UNSAFE_commitTransaction() {
        if (!this.txCommit)
            return Promise.resolve();
        return this.txCommit();
    }
    deferredLoad(entityConstructor, idOrList) {
        this.cacheStorage.setEntityClassName(entityConstructor);
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
    deferredRemove(e, idOrList) {
        if (Array.isArray(e) && e.length === 0)
            return this;
        const entityClass = this._extractEntityClass(e);
        let idsList = [];
        if (idOrList && !Array.isArray(e) && !('id' in e)) {
            idsList = Array.isArray(idOrList) ? idOrList : [idOrList];
        }
        else if (idOrList == null && ((Array.isArray(e) && 'id' in e[0]) || (!Array.isArray(e) && 'id' in e))) {
            idsList = (Array.isArray(e) ? e : [e]).map(i => i.id);
        }
        this.cacheStorage.setEntityClassName(entityClass);
        const defRemIdsList = this.cacheStorage.deferredRemoveList.get(entityClass) || new Set();
        for (const idItem of idsList) {
            defRemIdsList.add(idItem);
        }
        this.cacheStorage.deferredRemoveList.set(entityClass, defRemIdsList);
        const cachedEntities = this.cacheStorage.entities.get(entityClass) || new Map();
        let isIntersection = false;
        defRemIdsList.forEach(defRemItemId => {
            if (cachedEntities.has(defRemItemId)) {
                cachedEntities.delete(defRemItemId);
                isIntersection = true;
            }
        });
        if (isIntersection)
            this.cacheStorage.entities.set(entityClass, cachedEntities);
        return this;
    }
    // TODO Review "setForFlush" param logic
    _upsert(entityOrList, setForFlush) {
        if (Array.isArray(entityOrList) && entityOrList.length === 0)
            return;
        const entityClass = (Array.isArray(entityOrList) ? entityOrList[0] : entityOrList).constructor;
        const existingEntities = this.cacheStorage.entities.get(entityClass) || new Map();
        const existingEntityIdsForFlush = this.cacheStorage.entityIdsForFlush.get(entityClass) || new Set();
        this.cacheStorage.setEntityClassName(entityClass);
        for (let entity of Array.isArray(entityOrList) ? entityOrList : [entityOrList]) {
            let entityDecorated = entity;
            for (const entityFieldName in entity) {
                let fieldValue = entity[entityFieldName];
                if (fieldValue !== null &&
                    typeof fieldValue === 'object' &&
                    !Array.isArray(fieldValue) &&
                    'id' in fieldValue &&
                    // @ts-ignore
                    fieldValue.constructor.name !== 'Object') {
                    const fieldValueDecorated = fieldValue;
                    entityDecorated[entityFieldName] = {
                        id: fieldValueDecorated.id
                    };
                    this._upsert(fieldValue, setForFlush);
                }
            }
            existingEntities.set(entityDecorated.id, entityDecorated);
            if (setForFlush)
                existingEntityIdsForFlush.add(entity.id);
            this.cacheStorage.trackEntityStatus(entity, setForFlush);
        }
        this.cacheStorage.entities.set(entityClass, existingEntities);
        if (setForFlush)
            this.cacheStorage.entityIdsForFlush.set(entityClass, existingEntityIdsForFlush);
    }
    deferredUpsert(e) {
        this._upsert(e, true);
        return this;
    }
    /**
     * Load all deferred get from the db, clear deferredLoad and deferredFindWhereList items list,
     * set loaded items to cache storage.
     */
    async load(batchSize = 1000) {
        const fetchHandler = async (entityClass, idsSet) => {
            /**
             * Fetch all available entities of iterated class.
             */
            if (idsSet.has('*')) {
                const entitiesList = await this.find(entityClass, {
                    where: {}
                });
                this._upsert(entitiesList, false);
                return;
            }
            if (!idsSet || idsSet.size === 0)
                return;
            const entitiesList = await this.find(entityClass, {
                where: { id: (0, typeorm_1.In)([...idsSet.values()]) }
            });
            this._upsert(entitiesList, false);
        };
        for (const [entityClass, idsSet] of this.cacheStorage.deferredGetList.entries()) {
            if (batchSize < 0) {
                await fetchHandler(entityClass, idsSet);
            }
            else {
                for (let batch of splitIntoBatches([...idsSet.values()], batchSize)) {
                    await fetchHandler(entityClass, new Set(batch));
                }
            }
        }
        this.cacheStorage.deferredGetList.clear();
    }
    /**
     * Persist all updates to the db.
     *
     * "this.cacheStorage.entityIdsForFlush" Map can contain entities IDs, which are not presented in cache store. It's possible after
     * execution of ".delete || .clear || .deferredRemove" methods. But as cache store doesn't contain removed items,
     * they won't be accidentally saved into DB.
     */
    async flush() {
        await this._flushAll();
        this.cacheStorage.deferredRemoveList.clear();
    }
    async _flushAll() {
        let logger = (0, logger_1.createLogger)('sqd:store').child('Store');
        this.schemaMetadata.sortClassesByEntitiesList(this.cacheStorage.entitiesForFlushAll);
        logger.trace(this.schemaMetadata.entitiesOrderedList, '_flushAll::entitiesOrderedList > ');
        logger.trace(`_flushAll::entitiesRelationsTree > ${JSON.stringify(this.schemaMetadata.entitiesRelationsTree)}`);
        /**
         * Add new entities to Pre-Save queue.
         */
        for (const orderedClass of this.schemaMetadata.entitiesOrderedList) {
            if (!this.cacheStorage.entityClassNames.has(orderedClass))
                throw Error(`Class ${orderedClass} is not existing in entityClassNames list.`);
            this._addEntitiesToPreSaveQueue([
                ...this.cacheStorage.getEntitiesForFlushByClass(this.cacheStorage.entityClassNames.get(orderedClass)).values()
            ]);
        }
        /**
         * Save all prepared entities in pre-save queue in order, which is defined by "entitiesRelationsTree". In this
         * save flow all nullable foreign keys are filled by null value.
         */
        await this._preSaveNewEntitiesAll(this.schemaMetadata.entitiesOrderedList);
        /**
         * Save all entities of related classes in order, which is defined by "entitiesOrderedList". In this save flow
         * all (new and existing) items will be saved. New items will be saved with restored foreign key values after
         * _preSaveNewEntitiesAll execution.
         */
        for (const orderedClass of this.schemaMetadata.entitiesOrderedList) {
            if (!this.cacheStorage.entityClassNames.has(orderedClass))
                throw Error(`Class ${orderedClass} is not existing in entityClassNames list.`);
            const entityClass = this.cacheStorage.entityClassNames.get(orderedClass);
            await this._saveEntitiesWithPropsCacheRestore(entityClass, [
                ...this.cacheStorage.getEntitiesForFlushByClass(entityClass).values()
            ]);
            this.cacheStorage.entityIdsForFlush.set(entityClass, new Set());
        }
        /**
         * Remove entities from deferredRemove list
         */
        this.schemaMetadata.generateEntitiesOrderedList();
        logger.trace(this.schemaMetadata.entitiesOrderedList, '_flushAll::removeEntities::entitiesOrderedList > ');
        logger.trace(`_flushAll::removeEntities::entitiesRelationsTree > ${JSON.stringify(this.schemaMetadata.entitiesRelationsTree)}`);
        await this._removeEntitiesInDeferredRemove();
    }
    async _flushByClass(entityConstructor) {
        this.schemaMetadata.sortClassesByEntitiesList(this.cacheStorage.entitiesForFlushAll);
        let logger = (0, logger_1.createLogger)('sqd:store').child('Store');
        logger.trace(`_flushByClass::className > ${entityConstructor.name}`);
        /**
         * We need to save all relations of current class beforehand by relations tree of this class to avoid
         * "violates foreign key constraint" errors.
         */
        if (!this.schemaMetadata.entitiesRelationsTree.has(entityConstructor.name))
            return;
        /**
         * Add new entities of related classes to Pre-Save queue.
         */
        for (const relName of this.schemaMetadata.entitiesRelationsTree.get(entityConstructor.name) || []) {
            if (!this.cacheStorage.entityClassNames.has(relName))
                throw Error(`Class ${relName} is not existing in entityClassNames list.`);
            this._addEntitiesToPreSaveQueue([
                ...this.cacheStorage.getEntitiesForFlushByClass(this.cacheStorage.entityClassNames.get(relName)).values()
            ]);
        }
        /**
         * Add new entities of requested in "_flushByClass" class to Pre-Save queue.
         */
        this._addEntitiesToPreSaveQueue([...this.cacheStorage.getEntitiesForFlushByClass(entityConstructor).values()]);
        /**
         * Save all prepared entities in pre-save queue in order, which is defined by "entitiesRelationsTree". In this save
         * flow all nullable foreign keys are filled by null value.
         */
        await this._preSaveNewEntitiesAll([
            ...(this.schemaMetadata.entitiesRelationsTree.get(entityConstructor.name) || []),
            entityConstructor.name
        ]);
        /**
         * Save all entities of related classes in order, which is defined by "entitiesRelationsTree". In this save flow
         * all (new and existing) items will be saved. New items will be saved with restored foreign key values after
         * _preSaveNewEntitiesAll execution.
         */
        for (const relName of [
            ...(this.schemaMetadata.entitiesRelationsTree.get(entityConstructor.name) || []),
            entityConstructor.name
        ]) {
            const relEntityClass = this.cacheStorage.entityClassNames.get(relName);
            await this._saveEntitiesWithPropsCacheRestore(relEntityClass, [
                ...this.cacheStorage.getEntitiesForFlushByClass(relEntityClass).values()
            ]);
            this.cacheStorage.entityIdsForFlush.set(relEntityClass, new Set());
        }
        /**
         * Remove entities from deferredRemove list
         */
        this.schemaMetadata.generateEntitiesOrderedList();
        logger.trace(this.schemaMetadata.entitiesOrderedList, '_flushAll::removeEntities::entitiesOrderedList > ');
        logger.trace(`_flushAll::removeEntities::entitiesRelationsTree > ${JSON.stringify(this.schemaMetadata.entitiesRelationsTree)}`);
        await this._removeEntitiesInDeferredRemove();
    }
    /**
     * Delete entity item from cache storage of the specific class
     */
    _cacheDelete(entityConstructor, idOrList) {
        if (!this.cacheStorage.entities.has(entityConstructor))
            return;
        for (const id of Array.isArray(idOrList) ? idOrList : [idOrList]) {
            this.cacheStorage.entities.get(entityConstructor).delete(id);
        }
    }
    /**
     * Check by ID if entity is existing in cache
     */
    has(entityConstructor, id) {
        return (this.cacheStorage.entities.get(entityConstructor) || new Map()).has(id);
    }
    /**
     * Get all entities of specific class.
     * Returns a new iterator object that contains the values for
     * each element in the Map object in insertion order.
     */
    values(entityConstructor) {
        return (this.cacheStorage.entities.get(entityConstructor) || new Map()).values() || null;
    }
    /**
     * Delete all entities of specific class from cache storage
     */
    clear(entityConstructor) {
        if (!this.cacheStorage.entities.has(entityConstructor))
            return;
        this.cacheStorage.entities.get(entityConstructor).clear();
    }
    /**
     * Purge current cache.
     */
    purge() {
        this.cacheStorage.purgeCacheStorage();
    }
    /**
     * ::: TypeORM Store methods :::
     */
    async _processFetch(e, fetchCb) {
        const entityClass = this._extractEntityClass(e);
        this.cacheStorage.setEntityClassName(entityClass);
        await this._flushByClass(entityClass);
        const response = await fetchCb();
        if (response !== undefined && typeof response !== 'number') {
            this._upsert(response, false);
        }
        return response;
    }
    async save(e) {
        this._upsert(e, false);
        await this._save(e);
    }
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
        for (let b of splitIntoBatches(entities, this.saveBatchSize)) {
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
                for (let b of splitIntoBatches(e, this.saveBatchSize)) {
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
            this.cacheStorage.setEntityClassName(e);
            await this._flushByClass(e);
            await this._remove(e, id);
            this._cacheDelete(e, id);
        }
        else if (id == null && ((Array.isArray(e) && 'id' in e[0]) || (!Array.isArray(e) && 'id' in e))) {
            const entityClass = this._extractEntityClass(e);
            this.cacheStorage.setEntityClassName(entityClass);
            if (Array.isArray(e)) {
                for (let i = 1; i < e.length; i++) {
                    (0, assert_1.default)(entityClass === e[i].constructor, 'mass deletion allowed only for entities of the same class');
                }
            }
            const idOrList = Array.isArray(e) ? e.map(i => i.id) : e.id;
            await this._flushByClass(entityClass);
            await this._remove(e);
            this._cacheDelete(entityClass, idOrList);
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
            .then(em => em.findOne(entityClass, {
            loadRelationIds: {
                disableMixedMap: true
            },
            where
        }))
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
        return this._processFetch(entityClass, () => this.em().then(em => em.findOneOrFail(entityClass, {
            loadRelationIds: {
                disableMixedMap: true
            },
            where
        })));
    }
    /**
     * Get entity by ID either from cache or DB if cache storage doesn't contain requested item.
     * @param entityClass
     * @param id
     * @param fetchFromDb
     */
    async get(entityClass, id, fetchFromDb = true) {
        if (id === null || id === undefined)
            return null;
        const cachedVal = (this.cacheStorage.entities.get(entityClass) || new Map()).get(id) ?? null;
        if (cachedVal === null && fetchFromDb) {
            const dbVal = await this.findOneBy(entityClass, { id });
            return dbVal ?? null;
        }
        //@ts-ignore
        return cachedVal;
    }
    getOrFail(entityClass, id) {
        return ((this.cacheStorage.entities.get(entityClass) || new Map()).get(id) ||
            this.findOneByOrFail(entityClass, { id }));
    }
    /**
     * :::::::::::::::::::::::::::::::::::::::::::::::::
     * :::::::::::::::: UTILITY METHODS ::::::::::::::::
     * :::::::::::::::::::::::::::::::::::::::::::::::::
     */
    async _removeEntitiesInDeferredRemove() {
        for (const orderedClass of this.schemaMetadata.entitiesOrderedList.reverse()) {
            /**
             * We can ignore case if class is missed in "entityClassNames" because "entitiesOrderedList" contains
             * all possible entities in the provided schema
             */
            if (!this.cacheStorage.entityClassNames.has(orderedClass))
                continue;
            const entityClass = this.cacheStorage.entityClassNames.get(orderedClass);
            /**
             * Remove all items from deferredRemove list for iterated class.
             */
            await this._removeEntitiesInDeferredRemoveByClass(entityClass);
        }
    }
    async _removeEntitiesInDeferredRemoveByClass(entityConstructor) {
        if (this.cacheStorage.deferredRemoveList.has(entityConstructor) &&
            this.cacheStorage.deferredRemoveList.get(entityConstructor).size > 0) {
            await this._remove(entityConstructor, [...this.cacheStorage.deferredRemoveList.get(entityConstructor).values()]);
            this.cacheStorage.deferredRemoveList.set(entityConstructor, new Set());
        }
    }
    _extractEntityClass(e) {
        const singleEnOrClass = Array.isArray(e) ? e[0] : e;
        return 'id' in singleEnOrClass
            ? singleEnOrClass.constructor
            : singleEnOrClass;
    }
    _addEntitiesToPreSaveQueue(entities) {
        if (entities.length === 0)
            return;
        const entityClass = entities[0].constructor;
        if (!this.schemaMetadata.schemaMetadata.has(entityClass.name))
            throw Error(`Class ${entityClass.name} can not be found in schemaMetadata.`);
        const classFkList = this.schemaMetadata.schemaMetadata.get(entityClass.name).foreignKeys;
        const nullableFk = [...classFkList.values()].filter(fk => fk.isNullable);
        // if (nullableFk.length === 0) return;
        this.cacheStorage.entitiesPropsCache.set(entityClass, new Map());
        if (!this.cacheStorage.entitiesForPreSave.has(entityClass))
            this.cacheStorage.entitiesForPreSave.set(entityClass, new Map());
        for (const e of entities) {
            if (!this.cacheStorage.isEntityNew(e))
                continue;
            const cachedProps = {};
            nullableFk.forEach(({ propName }) => {
                cachedProps[propName] = e[propName];
                //@ts-ignore
                e[propName] = null;
            });
            this.cacheStorage.entitiesPropsCache.get(entityClass).set(e.id, cachedProps);
            this.cacheStorage.entitiesForPreSave.get(entityClass).set(e.id, e);
        }
    }
    async _preSaveNewEntitiesAll(saveOrder) {
        for (const relName of saveOrder) {
            if (this.cacheStorage.entityClassNames.has(relName) &&
                this.cacheStorage.entitiesForPreSave.get(this.cacheStorage.entityClassNames.get(relName))) {
                const entityClass = this.cacheStorage.entityClassNames.get(relName);
                await this._preSaveNewEntities(entityClass, [
                    ...this.cacheStorage.entitiesForPreSave.get(entityClass).values()
                ]);
            }
        }
    }
    async _preSaveNewEntities(entityClass, entities) {
        await this.em().then(async (em) => {
            for (let b of splitIntoBatches([...entities.values()], this.saveBatchSize)) {
                await em.upsert(entityClass, b, ['id']);
            }
        });
        entities.forEach(e => this.cacheStorage.trackEntityStatus(e, false));
        this.cacheStorage.entitiesForPreSave.delete(entityClass);
    }
    // TODO refactor to avoid double-save action of presaved entities
    async _saveEntitiesWithPropsCacheRestore(entityClass, entities) {
        await this._save(entities.map(e => {
            if (this.cacheStorage.entitiesPropsCache.has(entityClass) &&
                this.cacheStorage.entitiesPropsCache.get(entityClass).has(e.id)) {
                const cachedProps = this.cacheStorage.entitiesPropsCache.get(entityClass).get(e.id);
                for (const prop in cachedProps) {
                    //@ts-ignore
                    e[prop] = cachedProps[prop];
                }
                this.cacheStorage.entitiesPropsCache.get(entityClass).delete(e.id);
                return e;
            }
            return e;
        }));
    }
}
exports.Store = Store;
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