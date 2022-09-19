import { FindOptionsWhere } from 'typeorm';
import { Store, EntityClass } from '@subsquid/typeorm-store';
import { BatchContext } from '@subsquid/substrate-processor';
export declare type EntityLike = {
    id: string;
};
export declare type EntityClassConstructable = EntityClass<EntityLike>;
export declare type CacheEntityParams = EntityClassConstructable | [EntityClassConstructable, Record<keyof EntityClassConstructable, EntityClassConstructable>];
export declare type CachedModel<T> = {
    [P in keyof T]: Exclude<T[P], null | undefined> extends EntityLike ? null | undefined extends T[P] ? EntityLike | null | undefined : EntityLike : T[P];
} & EntityLike;
declare class SquidCache {
    static cacheInstance: SquidCache;
    private processorContext;
    private entityRelationsParams;
    private cacheClassesMap;
    private entities;
    private entitiesForFlush;
    private deferredGetList;
    private deferredFindWhereList;
    private deferredRemoveList;
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
    init(ctx: BatchContext<Store, unknown>, entityRelationsParams: CacheEntityParams[]): void;
    /**
     * Get initialized cache instance
     */
    static get instance(): SquidCache;
    /**
     * Add request for loading all entities of defined class.
     */
    deferredLoad<T extends EntityLike>(entityConstructor: EntityClass<T>): SquidCache;
    /**
     * Add ids of entities which should be loaded, resolved after Cache.load()
     * (keeps items as Map structure).
     */
    deferredLoad<T extends EntityLike>(entityConstructor: EntityClass<T>, idOrList?: string | string[]): SquidCache;
    /**
     * Add requests for find entities by "FindManyOptions" parameters.
     * Can be useful if user needs fetch list of entities by id with
     * additional check for "soft remove" flag (e.g. additional field
     * "deleted: true" or "active: false")
     */
    deferredLoad<T extends EntityLike>(entityConstructor: EntityClass<T>, findOptions?: FindOptionsWhere<T> | FindOptionsWhere<T>[]): SquidCache;
    /**
     * Add ids of entities which should be removed, resolved after Cache.flush()
     * Keeps items as Map structure.
     * If item is added to the list for deferredRemove, it will be removed from local cache and won't be available for
     * Cache.get() method.
     */
    deferredRemove<T extends EntityLike>(entityConstructor: EntityClass<T>, idOrList: string | string[]): SquidCache;
    /**
     * Check by ID if entity is existing in cache
     */
    has<T extends EntityLike>(entityConstructor: EntityClass<T>, id: string): boolean;
    /**
     * Get entity by id form cache
     */
    get<T extends EntityLike>(entityConstructor: EntityClass<T>, id: string): T | null;
    /**
     * Get all entities of specific class.
     * Returns a new iterator object that contains the values for
     * each element in the Map object in insertion order.
     */
    values<T extends EntityLike>(entityConstructor: EntityClass<T>): IterableIterator<T> | [];
    /**
     * Returns full cache data
     */
    entries(): Map<EntityClassConstructable, Map<string, CachedModel<EntityClassConstructable>>>;
    /**
     * Delete entity item from cache storage of the specific class
     */
    delete<T extends EntityLike>(entityConstructor: EntityClass<T>, id: string): void;
    /**
     * Delete all entities of specific class from cache storage
     */
    clear<T extends EntityLike>(entityConstructor: EntityClass<T>): void;
    private _upsert;
    /**
     * Set/update item in cache by id.
     * All items which are upserted by this method will be saved into DB during further execution of ".flush" method
     */
    upsert<T extends CachedModel<T>>(entities: T[]): void;
    upsert<T extends CachedModel<T>>(entity: T): void;
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
    flush(): Promise<void>;
    /**
     * Purge current cache.
     */
    purge(): void;
    /**
     * If there are unresolved gets
     */
    ready(): boolean;
    /**
     * If there were upsets after Cache.load()
     */
    isDirty(): boolean;
}
export declare const ProcessorCache: SquidCache;
export {};
//# sourceMappingURL=index.d.ts.map