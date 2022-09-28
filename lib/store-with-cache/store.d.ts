import { EntityClass, Store, Entity, FindManyOptions, FindOneOptions } from '@subsquid/typeorm-store';
import { EntityManager, FindOptionsWhere } from 'typeorm';
export { EntityClass, Entity, FindManyOptions, FindOneOptions, TypeormDatabase, FullTypeormDatabase, IsolationLevel } from '@subsquid/typeorm-store';
export declare type EntityClassConstructable = EntityClass<Entity>;
export declare type CacheEntityParams = EntityClassConstructable | [EntityClassConstructable, Record<keyof EntityClassConstructable, EntityClassConstructable>];
export declare type CachedModel<T> = {
    [P in keyof T]: Exclude<T[P], null | undefined> extends Entity ? (null | undefined extends T[P] ? Entity | null | undefined : Entity) : T[P];
} & Entity;
export declare class StoreWithCache extends Store {
    private _em;
    private entityRelationsParams;
    private cacheClassesMap;
    private entities;
    private entitiesForFlush;
    private deferredGetList;
    private deferredFindWhereList;
    private deferredRemoveList;
    constructor(_em: () => Promise<EntityManager>);
    cacheInit(entityRelationsParams: CacheEntityParams[]): void;
    /**
     * Add request for loading all entities of defined class.
     */
    deferredLoad<T extends Entity>(entityConstructor: EntityClass<T>): StoreWithCache;
    /**
     * Add ids of entities which should be loaded, resolved after Cache.load()
     * (keeps items as Map structure).
     */
    deferredLoad<T extends Entity>(entityConstructor: EntityClass<T>, idOrList?: string | string[]): StoreWithCache;
    /**
     * Add requests for find entities by "FindManyOptions" parameters.
     * Can be useful if user needs fetch list of entities by id with
     * additional check for "soft remove" flag (e.g. additional field
     * "deleted: true" or "active: false")
     */
    deferredLoad<T extends Entity>(entityConstructor: EntityClass<T>, findOptions?: FindOptionsWhere<T> | FindOptionsWhere<T>[]): StoreWithCache;
    /**
     * Add ids of entities which should be removed, resolved after Cache.flush()
     * Keeps items as Map structure.
     * If item is added to the list for deferredRemove, it will be removed from local cache and won't be available for
     * Cache.get() method.
     */
    deferredRemove<T extends Entity>(entityConstructor: EntityClass<T>, idOrList: string | string[]): StoreWithCache;
    /**
     * Check by ID if entity is existing in cache
     */
    cacheHas<T extends Entity>(entityConstructor: EntityClass<T>, id: string): boolean;
    /**
     * Get entity by id form cache
     */
    cacheGet<T extends Entity>(entityConstructor: EntityClass<T>, id: string): T | null;
    /**
     * Get all entities of specific class.
     * Returns a new iterator object that contains the values for
     * each element in the Map object in insertion order.
     */
    cacheValues<T extends Entity>(entityConstructor: EntityClass<T>): IterableIterator<T> | [];
    /**
     * Returns full cache data
     */
    cacheEntries(): Map<EntityClassConstructable, Map<string, CachedModel<EntityClassConstructable>>>;
    /**
     * Delete entity item from cache storage of the specific class
     */
    cacheDelete<T extends Entity>(entityConstructor: EntityClass<T>, id: string): void;
    /**
     * Delete all entities of specific class from cache storage
     */
    cacheClear<T extends Entity>(entityConstructor: EntityClass<T>): void;
    private _upsert;
    /**
     * Set/update item in cache by id.
     * All items which are upserted by this method will be saved into DB during further execution of ".flush" method
     */
    cacheUpsert<T extends CachedModel<T>>(entities: T[]): void;
    cacheUpsert<T extends CachedModel<T>>(entity: T): void;
    /**
     * Load all deferred get from the db, clear deferredLoad and deferredFindWhereList items list,
     * set loaded items to cache storage.
     */
    load(): Promise<void>;
    /**
     * Persist all updates to the db.
     *
     * "this.entitiesForFlush" Map can contain entities IDs, which are not presented in cache store. It's possible after
     * execution of ".delete || .clear || .deferredRemove" methods. But as cache store doesn't contain removed items,
     * they won't be accidentally saved into DB.
     */
    cacheFlush(): Promise<void>;
    private _flushAll;
    private _flushByClass;
    /**
     * Purge current cache.
     */
    cachePurge(): void;
    /**
     * If there are unresolved gets
     */
    cacheReady(): boolean;
    /**
     * If there were upsets after Cache.load()
     */
    cacheIsDirty(): boolean;
    private _processFetch;
    count<E extends Entity>(entityClass: EntityClass<E>, options?: FindManyOptions<E>): Promise<number>;
    countBy<E extends Entity>(entityClass: EntityClass<E>, where: FindOptionsWhere<E> | FindOptionsWhere<E>[]): Promise<number>;
    find<E extends Entity>(entityClass: EntityClass<E>, options?: FindManyOptions<E>): Promise<E[]>;
    findBy<E extends Entity>(entityClass: EntityClass<E>, where: FindOptionsWhere<E> | FindOptionsWhere<E>[]): Promise<E[]>;
    findOne<E extends Entity>(entityClass: EntityClass<E>, options: FindOneOptions<E>): Promise<E | undefined>;
    findOneBy<E extends Entity>(entityClass: EntityClass<E>, where: FindOptionsWhere<E> | FindOptionsWhere<E>[]): Promise<E | undefined>;
    get<E extends Entity>(entityClass: EntityClass<E>, optionsOrId: FindOneOptions<E> | string): Promise<E | undefined>;
}
//# sourceMappingURL=store.d.ts.map