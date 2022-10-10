# StoreWithCache

Provides extended Subsquid TypeOrm Store functionality and must be used as combination of 
`TypeormDatabaseWithCache` and `StoreWithCache` inside Subsquid Batch Processor.

Check typical use-case implementation below.
```typescript

import {
  BatchContext,
  BatchProcessorItem,
  SubstrateBatchProcessor
} from '@subsquid/substrate-processor';

import {
  TypeormDatabaseWithCache,
  StoreWithCache
} from '@subsquid/processor-tools';

const processor = new SubstrateBatchProcessor()
  .setBatchSize(500)
  .setDataSource({
    ...
  })
  .addEvent('Balances.Transfer', {
    data: {
      event: {
        args: true,
        extrinsic: {
          hash: true,
          fee: true,
          signature: true
        }
      }
    }
  } as const);

type Item = BatchProcessorItem<typeof processor>;
type Ctx = BatchContext<StoreWithCache, Item>;

processor.run(new TypeormDatabaseWithCache(), async (ctx) => {
  
  const transfersEventData = []

  for (let block of ctx.blocks) {
    for (let item of block.items) {
      switch (item.name) {
        case 'Balances.Transfer': {
          const event = new BalancesTransferEvent(ctx, item.event);
          const { amount, from, to } = event.asV1;

          transfersEventData.push({
            id: item.event.id,
            amount: amount,
            from,
            to,
          });
          ctx.store.deferredLoad(Account, [
            tokenTransfer.from,
            tokenTransfer.to
          ]);
          break;
        }
        default:
      }
    }
  }
  
  await ctx.store.load();

  for (const transferData of transfersEventData) {
    const {
      id,
      from,
      to,
      amount,
    } = transferData;

    const fromAcc = await getOrCreateAccount(ctx, from);
    const toAcc = await getOrCreateAccount(ctx, to);

    ctx.store.deferredUpsert(
      new Transfer({
        id,
        from: fromAcc,
        to: toAcc,
        amount,
      })
    );

    ctx.store.deferredUpsert([fromAcc, toAcc]);
  }
  
  await ctx.store.flush();
  await ctx.store.purge();
});

async function getOrCreateAccount(
  ctx: Ctx,
  id: string
): Promise<Account> {
  let acc = await ctx.store.get(Account, id);

  if (acc == null) {
    acc = new Account({
      id: id,
    });

    ctx.store.deferredUpsert(acc);
  }
  return acc;
}



```

Interfaces:
```typescript
class StoreWithCache {
  private em;
  private cacheStorage;
  private schemaMetadata;
  constructor(em: () => Promise<EntityManager>, cacheStorage: CacheStorage, schemaMetadata: SchemaMetadata);
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
   * Add ids of entities which should be removed, resolved after Cache.flush()
   * Keeps items as Map structure.
   * If item is added to the list for deferredRemove, it will be removed from local cache and won't be available for
   * Cache.get() method.
   */
  deferredRemove<T extends Entity>(entityConstructor: EntityClass<T>, idOrList: string | string[]): StoreWithCache;
  private _upsert;
  /**
   * Set/update item in cache by id.
   * All items which are upserted by this method will be saved into DB during further execution of ".flush" method
   */
  deferredUpsert<T extends CachedModel<T>>(entity: T): void;
  deferredUpsert<T extends CachedModel<T>>(entities: T[]): void;
  /**
   * Load all deferred get from the db, clear deferredLoad and deferredFindWhereList items list,
   * set loaded items to cache storage.
   */
  load(): Promise<void>;
  /**
   * Persist all updates to the db.
   *
   * "this.cacheStorage.entitiesForFlush" Map can contain entities IDs, which are not presented in cache store. It's possible after
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
   * Returns full cache data
   */
  entries(): Map<EntityClassConstructable, Map<string, CachedModel<EntityClassConstructable>>>;
  /**
   * Delete all entities of specific class from cache storage
   */
  clear<T extends Entity>(entityConstructor: EntityClass<T>): void;
  /**
   * Purge current cache.
   */
  purge(): void;
  /**
   * If there are unresolved gets
   */
  ready(): boolean;
  /**
   * If there were upsets after .load()
   */
  isDirty(): boolean;
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
   */
  get<E extends Entity>(entityClass: EntityClass<E>, id: string): Promise<E | null>;
  getOrFail<E extends Entity>(entityClass: EntityClass<E>, id: string): Promise<E>;
  /**
   * :::: UTILITY METHODS :::
   */
  private _extractEntityClass;
}
```