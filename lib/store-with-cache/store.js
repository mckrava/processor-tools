"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.StoreWithCache = exports.FullTypeormDatabase = exports.TypeormDatabase = void 0;
const typeorm_store_1 = require("@subsquid/typeorm-store");
const typeorm_1 = require("typeorm");
var typeorm_store_2 = require("@subsquid/typeorm-store");
Object.defineProperty(exports, "TypeormDatabase", { enumerable: true, get: function () { return typeorm_store_2.TypeormDatabase; } });
Object.defineProperty(exports, "FullTypeormDatabase", { enumerable: true, get: function () { return typeorm_store_2.FullTypeormDatabase; } });
class StoreWithCache extends typeorm_store_1.Store {
    // cache = {
    //   get: this.cacheGet,
    //   upsert: this.cacheUpsert
    // };
    constructor(_em, schemaMetadata) {
        super(_em);
        this._em = _em;
        this.schemaMetadata = schemaMetadata;
        this.entities = new Map();
        this.entitiesForFlush = new Map();
        this.deferredGetList = new Map();
        this.deferredRemoveList = new Map();
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
        if (!idOrList) {
            this.deferredGetList.set(entityConstructor, new Set().add('*'));
            return this;
        }
        else if (typeof idOrList === 'string' || Array.isArray(idOrList)) {
            const idsList = this.deferredGetList.get(entityConstructor) || new Set();
            for (const idItem of Array.isArray(idOrList) ? idOrList : [idOrList]) {
                idsList.add(idItem);
            }
            this.deferredGetList.set(entityConstructor, idsList);
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
    _upsert(entityOrList, setForFlush) {
        if (Array.isArray(entityOrList) && entityOrList.length === 0)
            return;
        const entityClassConstructor = (Array.isArray(entityOrList) ? entityOrList[0] : entityOrList).constructor;
        const existingEntities = this.entities.get(entityClassConstructor) ||
            new Map();
        const existingEntitiesForFlush = this.entitiesForFlush.get(entityClassConstructor) || new Set();
        for (let entity of Array.isArray(entityOrList)
            ? entityOrList
            : [entityOrList]) {
            let entityDecorated = entity;
            for (const entityFieldName in entity) {
                let fieldValue = entity[entityFieldName];
                if (fieldValue !== null &&
                    typeof fieldValue === 'object' &&
                    !Array.isArray(fieldValue) &&
                    'id' in fieldValue) {
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
        this.entities.set(entityClassConstructor, existingEntities);
        if (setForFlush)
            this.entitiesForFlush.set(entityClassConstructor, existingEntitiesForFlush);
    }
    cacheUpsert(entityOrList) {
        //@ts-ignore
        this._upsert(entityOrList, true);
    }
    /**
     * Load all deferred get from the db, clear deferredLoad and deferredFindWhereList items list,
     * set loaded items to cache storage.
     */
    async load() {
        for (const [entityClass, idsSet] of this.deferredGetList.entries()) {
            /**
             * Fetch all available entities of iterated class.
             */
            if (idsSet.has('*')) {
                const entitiesList = await super.find(entityClass, {
                    where: {}
                });
                this._upsert(entitiesList, false);
                continue;
            }
            if (!idsSet || idsSet.size === 0)
                continue;
            const entitiesList = await super.find(entityClass, {
                where: { id: (0, typeorm_1.In)([...idsSet.values()]) }
            });
            this._upsert(entitiesList, false);
        }
        this.deferredGetList.clear();
    }
    /**
     * Persist all updates to the db.
     *
     * "this.entitiesForFlush" Map can contain entities IDs, which are not presented in cache store. It's possible after
     * execution of ".delete || .clear || .deferredRemove" methods. But as cache store doesn't contain removed items,
     * they won't be accidentally saved into DB.
     */
    async cacheFlush() {
        await this._flushAll();
        this.deferredRemoveList.clear();
    }
    async _flushAll() {
        const entityClasses = new Map();
        const { entitiesOrderedList } = this.schemaMetadata;
        [...this.entities.keys()].forEach(item => entityClasses.set(item.name, item));
        for (const i in entitiesOrderedList) {
            if (entityClasses.has(entitiesOrderedList[i])) {
                await this._flushByClass(entityClasses.get(entitiesOrderedList[i]));
            }
        }
    }
    async _flushByClass(entityConstructor) {
        if (this.entitiesForFlush.has(entityConstructor)) {
            const forFlush = this.entitiesForFlush.get(entityConstructor) || new Set();
            const listForSave = [
                ...(this.entities.get(entityConstructor) ||
                    new Map()).values()
            ].filter(entity => forFlush.has(entity.id));
            await super.save(listForSave);
            this.entitiesForFlush.set(entityConstructor, new Set());
        }
        if (!this.deferredRemoveList.has(entityConstructor))
            return;
        await super.remove(entityConstructor, [
            ...(this.deferredRemoveList.get(entityConstructor) || new Set()).values()
        ]);
        this.deferredRemoveList.set(entityConstructor, new Set());
    }
    /**
     * Check by ID if entity is existing in cache
     */
    cacheHas(entityConstructor, id) {
        return (this.entities.get(entityConstructor) || new Map()).has(id);
    }
    /**
     * Get entity by id form cache
     */
    cacheGet(entityConstructor, id) {
        return (this.entities.get(entityConstructor) || new Map()).get(id) || null;
    }
    /**
     * Get all entities of specific class.
     * Returns a new iterator object that contains the values for
     * each element in the Map object in insertion order.
     */
    cacheValues(entityConstructor) {
        return (this.entities.get(entityConstructor) || new Map()).values() || null;
    }
    /**
     * Returns full cache data
     */
    cacheEntries() {
        return this.entities;
    }
    /**
     * Delete entity item from cache storage of the specific class
     */
    cacheDelete(entityConstructor, id) {
        if (!this.entities.has(entityConstructor))
            return;
        this.entities.get(entityConstructor).delete(id);
    }
    /**
     * Delete all entities of specific class from cache storage
     */
    cacheClear(entityConstructor) {
        if (!this.entities.has(entityConstructor))
            return;
        this.entities.get(entityConstructor).clear();
    }
    /**
     * Purge current cache.
     */
    cachePurge() {
        this.entities.clear();
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
        // return this.deferredGetList.size > 0 || this.deferredFindWhereList.size > 0;
        return this.deferredGetList.size > 0;
    }
    async _processFetch(e, fetchCb) {
        // @ts-ignore
        await this._flushByClass(e);
        const response = await fetchCb();
        //@ts-ignore
        if (typeof response !== undefined && typeof response !== 'number')
            //@ts-ignore
            this._upsert(response, false);
        return response; // TODO should be returned the same entity instance as located in local cache store
    }
    async save(e) {
        //@ts-ignore
        this._upsert(e, false);
        //@ts-ignore
        await super.save(e);
    }
    async insert(e) {
        // @ts-ignore
        this._upsert(e, false);
        // @ts-ignore
        await super.insert(e);
    }
    async remove(e, id) {
        const singleEnOrClass = Array.isArray(e) ? e[0] : e;
        const enClass = 'id' in singleEnOrClass
            ? Object.getPrototypeOf(singleEnOrClass).constructor
            : singleEnOrClass;
        //@ts-ignore
        const eId = id ?? singleEnOrClass.id;
        await this._flushByClass(enClass);
        //@ts-ignore
        await super.remove(e, id);
        this.cacheDelete(enClass, eId);
    }
    count(entityClass, options) {
        return this._processFetch(entityClass, () => super.count(entityClass, options));
    }
    countBy(entityClass, where) {
        return this._processFetch(entityClass, () => super.countBy(entityClass, where));
    }
    find(entityClass, options) {
        return this._processFetch(entityClass, () => super.find(entityClass, options));
    }
    findBy(entityClass, where) {
        return this._processFetch(entityClass, () => super.findBy(entityClass, where));
    }
    findOne(entityClass, options) {
        return this._processFetch(entityClass, () => super.findOne(entityClass, options));
    }
    findOneBy(entityClass, where) {
        return this._processFetch(entityClass, () => super.findOneBy(entityClass, where));
    }
    get(entityClass, optionsOrId) {
        return this._processFetch(entityClass, () => super.get(entityClass, optionsOrId));
    }
}
exports.StoreWithCache = StoreWithCache;
//# sourceMappingURL=store.js.map