import { EntityManager, FindOptionsOrder, FindOptionsWhere } from 'typeorm';
import { SchemaMetadata } from './utils/schemaMetadata';
export { TypeormDatabase, FullTypeormDatabase, IsolationLevel } from '@subsquid/typeorm-store';
export interface EntityClass<T> {
    new (): T;
}
export interface Entity {
    id: string;
}
/**
 * Defines a special criteria to find specific entity.
 */
export interface FindOneOptions<Entity = any> {
    /**
     * Adds a comment with the supplied string in the generated query.  This is
     * helpful for debugging purposes, such as finding a specific query in the
     * database server's logs, or for categorization using an APM product.
     */
    comment?: string;
    /**
     * Simple condition that should be applied to match entities.
     */
    where?: FindOptionsWhere<Entity>[] | FindOptionsWhere<Entity>;
    /**
     * Order, in which entities should be ordered.
     */
    order?: FindOptionsOrder<Entity>;
}
export interface FindManyOptions<Entity = any> extends FindOneOptions<Entity> {
    /**
     * Offset (paginated) where from entities should be taken.
     */
    skip?: number;
    /**
     * Limit (paginated) - max number of entities should be taken.
     */
    take?: number;
}
export declare type EntityClassConstructable = EntityClass<Entity>;
export declare type CachedModel<T> = {
    [P in keyof T]: Exclude<T[P], null | undefined> extends Entity ? null | undefined extends T[P] ? Entity | null | undefined : Entity : T[P];
} & Entity;
export declare type CacheStorageEntitiesScope = Map<EntityClassConstructable, Map<string, CachedModel<EntityClassConstructable>>>;
export declare class CacheStorage {
    private static instance;
    entities: CacheStorageEntitiesScope;
    entityClassNames: Map<string, EntityClassConstructable>;
    entityIdsForFlush: Map<EntityClassConstructable, Set<string>>;
    deferredGetList: Map<EntityClassConstructable, Set<string>>;
    deferredRemoveList: Map<EntityClassConstructable, Set<string>>;
    entitiesForPreSave: CacheStorageEntitiesScope;
    entitiesPropsCache: Map<EntityClassConstructable, Map<string, Record<"id", any>>>;
    private entityIdsFetched;
    entityIdsNew: Map<EntityClassConstructable, Set<string>>;
    private constructor();
    static getInstance(): CacheStorage;
    get entitiesForFlushAll(): Map<EntityClassConstructable, Map<string, CachedModel<EntityClassConstructable>>>;
    getEntitiesForFlushByClass(entityClass: EntityClassConstructable): Map<string, CachedModel<EntityClassConstructable>>;
    setEntityClassName(entityClass: EntityClassConstructable): void;
    /**
     * If entity is newly created in current batch processing session, is will be added to "entityIdsNew" set
     * for further pre-saving flows. If "forFlush === false", entity is considered fetched from DB.
     */
    trackEntityStatus<E extends Entity>(e: E, forFlush: boolean): void;
    isEntityNew<E extends Entity>(e: E): boolean;
    purgeCacheStorage(): void;
}
export declare class Store {
    private em;
    private cacheStorage;
    private schemaMetadata;
    private txCommit?;
    constructor(em: () => Promise<EntityManager>, cacheStorage: CacheStorage, schemaMetadata: SchemaMetadata, txCommit?: (() => Promise<void>) | undefined);
    /**
     * If there are unresolved gets
     */
    get ready(): boolean;
    /**
     * If there were upsets after .load()
     */
    get isDirty(): boolean;
    /**
     * Returns full cache data
     */
    get entries(): CacheStorageEntitiesScope;
    /**
     * Returns full current map of ids for flush
     */
    get entityIdsForFlush(): Map<EntityClassConstructable, Set<string>>;
    /**
     * Returns full current map of ids for load
     */
    get idsForDeferredLoad(): Map<EntityClassConstructable, Set<string>>;
    /**
     * UNSAFE method. Executes Entity Manager Transaction, initiated in current batch.
     * @constructor
     */
    UNSAFE_commitTransaction(): Promise<void>;
    /**
     * Add request for loading all entities of defined class.
     */
    deferredLoad<T extends Entity>(entityConstructor: EntityClass<T>): Store;
    /**
     * Add ids of entities which should be loaded, resolved after Cache.load()
     * (keeps items as Map structure).
     */
    deferredLoad<T extends Entity>(entityConstructor: EntityClass<T>, idOrList?: string | string[]): Store;
    /**
     * Add ids of entities which should be removed, resolved after store.flush()
     * Keeps items as Map structure.
     * If item is added to the list for deferredRemove, it will be removed from local cache and won't be available for
     * store.get() method.
     */
    deferredRemove<T extends Entity>(entity: T): Store;
    deferredRemove<T extends Entity>(entities: T[]): Store;
    deferredRemove<T extends Entity>(entityConstructor: EntityClass<T>, idOrList: string | string[]): Store;
    private _upsert;
    /**
     * Set/update item in cache by id.
     * All items which are upserted by this method will be saved into DB during further execution of ".flush" method
     */
    deferredUpsert<T extends CachedModel<T>>(entity: T): Store;
    deferredUpsert<T extends CachedModel<T>>(entities: T[]): Store;
    /**
     * Load all deferred get from the db, clear deferredLoad and deferredFindWhereList items list,
     * set loaded items to cache storage.
     */
    load(batchSize?: number): Promise<void>;
    /**
     * Persist all updates to the db.
     *
     * "this.cacheStorage.entityIdsForFlush" Map can contain entities IDs, which are not presented in cache store. It's possible after
     * execution of ".delete || .clear || .deferredRemove" methods. But as cache store doesn't contain removed items,
     * they won't be accidentally saved into DB.
     */
    flush(): Promise<void>;
    private _flushAll;
    private _flushByClass;
    /**
     * Delete entity item from cache storage of the specific class
     */
    private _cacheDelete;
    /**
     * Check by ID if entity is existing in cache
     */
    has<T extends Entity>(entityConstructor: EntityClass<T>, id: string): boolean;
    /**
     * Get all entities of specific class.
     * Returns a new iterator object that contains the values for
     * each element in the Map object in insertion order.
     */
    values<T extends Entity>(entityConstructor: EntityClass<T>): IterableIterator<T> | [];
    /**
     * Delete all entities of specific class from cache storage
     */
    clear<T extends Entity>(entityConstructor: EntityClass<T>): void;
    /**
     * Purge current cache.
     */
    purge(): void;
    /**
     * ::: TypeORM Store methods :::
     */
    private _processFetch;
    save<E extends Entity>(entity: E): Promise<void>;
    save<E extends Entity>(entities: E[]): Promise<void>;
    private _save;
    private saveMany;
    private getFkSignature;
    private upsertMany;
    /**
     * Inserts a given entity or entities into the database.
     * Does not check if the entity(s) exist in the database and will fail if a duplicate is inserted.
     *
     * Executes a primitive INSERT operation without cascades, relations, etc.
     */
    insert<E extends Entity>(entity: E): Promise<void>;
    insert<E extends Entity>(entities: E[]): Promise<void>;
    /**
     * Deletes a given entity or entities from the database with pre-flushing cache content into DB.
     *
     * Unlike {@link EntityManager.remove} executes a primitive DELETE query without cascades, relations, etc.
     */
    remove<E extends Entity>(entity: E): Promise<void>;
    remove<E extends Entity>(entities: E[]): Promise<void>;
    remove<E extends Entity>(entityClass: EntityClass<E>, id: string | string[]): Promise<void>;
    /**
     * Deletes a given entity or entities from the database.
     *
     * Unlike {@link EntityManager.remove} executes a primitive DELETE query without cascades, relations, etc.
     */
    private _remove;
    count<E extends Entity>(entityClass: EntityClass<E>, options?: FindManyOptions<E>): Promise<number>;
    countBy<E extends Entity>(entityClass: EntityClass<E>, where: FindOptionsWhere<E> | FindOptionsWhere<E>[]): Promise<number>;
    find<E extends Entity>(entityClass: EntityClass<E>, options?: FindManyOptions<E>): Promise<E[]>;
    findBy<E extends Entity>(entityClass: EntityClass<E>, where: FindOptionsWhere<E> | FindOptionsWhere<E>[]): Promise<E[]>;
    findOne<E extends Entity>(entityClass: EntityClass<E>, options: FindOneOptions<E>): Promise<E | undefined>;
    findOneBy<E extends Entity>(entityClass: EntityClass<E>, where: FindOptionsWhere<E> | FindOptionsWhere<E>[]): Promise<E | undefined>;
    findOneOrFail<E extends Entity>(entityClass: EntityClass<E>, options: FindOneOptions<E>): Promise<E>;
    findOneByOrFail<E extends Entity>(entityClass: EntityClass<E>, where: FindOptionsWhere<E> | FindOptionsWhere<E>[]): Promise<E>;
    /**
     * Get entity by ID either from cache or DB if cache storage doesn't contain requested item.
     * @param entityClass
     * @param id
     * @param fetchFromDb
     */
    get<E extends Entity>(entityClass: EntityClass<E>, id: string | null | undefined, fetchFromDb?: boolean): Promise<E | null>;
    getOrFail<E extends Entity>(entityClass: EntityClass<E>, id: string): Promise<E>;
    /**
     * :::::::::::::::::::::::::::::::::::::::::::::::::
     * :::::::::::::::: UTILITY METHODS ::::::::::::::::
     * :::::::::::::::::::::::::::::::::::::::::::::::::
     */
    private _removeEntitiesInDeferredRemove;
    private _removeEntitiesInDeferredRemoveByClass;
    private _extractEntityClass;
    private _addEntitiesToPreSaveQueue;
    private _preSaveNewEntitiesAll;
    private _preSaveNewEntities;
    private _saveEntitiesWithPropsCacheRestore;
}
//# sourceMappingURL=store.d.ts.map