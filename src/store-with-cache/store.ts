import { EntityManager, FindOptionsOrder, FindOptionsRelations, FindOptionsWhere, In } from 'typeorm';
import { EntityTarget } from 'typeorm/common/EntityTarget';
import { ColumnMetadata } from 'typeorm/metadata/ColumnMetadata';
import assert from 'assert';
import { BatchContext } from '@subsquid/substrate-processor';
import { SchemaMetadata } from './utils/schemaMetadata';
import { option } from 'fast-check';

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

export type EntityClassConstructable = EntityClass<Entity>;

export type CachedModel<T> = {
  [P in keyof T]: Exclude<T[P], null | undefined> extends Entity
    ? null | undefined extends T[P]
      ? Entity | null | undefined
      : Entity
    : T[P];
} & Entity;

export class CacheStorage {
  private static instance: CacheStorage;

  public entities = new Map<EntityClassConstructable, Map<string, CachedModel<EntityClassConstructable>>>();
  public entitiesNames = new Map<string, EntityClassConstructable>();
  public entitiesForFlush = new Map<EntityClassConstructable, Set<string>>();

  public deferredGetList = new Map<EntityClassConstructable, Set<string>>();
  public deferredRemoveList = new Map<EntityClassConstructable, Set<string>>();

  private constructor() {}

  static getInstance() {
    if (!CacheStorage.instance) {
      CacheStorage.instance = new CacheStorage();
    }
    return CacheStorage.instance;
  }

  setEntityName(entityClass: EntityClassConstructable) {
    this.entitiesNames.set(entityClass.name, entityClass);
  }
}

export class Store {
  constructor(
    private em: () => Promise<EntityManager>,
    private cacheStorage: CacheStorage,
    private schemaMetadata: SchemaMetadata
  ) {}

  /**
   * Add request for loading all entities of defined class.
   */
  deferredLoad<T extends Entity>(entityConstructor: EntityClass<T>): Store;
  /**
   * Add ids of entities which should be loaded, resolved after Cache.load()
   * (keeps items as Map structure).
   */
  deferredLoad<T extends Entity>(entityConstructor: EntityClass<T>, idOrList?: string | string[]): Store;

  deferredLoad<T extends Entity>(entityConstructor: EntityClass<T>, idOrList?: string | string[]): Store {
    this.cacheStorage.setEntityName(entityConstructor);

    if (!idOrList) {
      this.cacheStorage.deferredGetList.set(entityConstructor, new Set<string>().add('*'));
      return this;
    } else if (typeof idOrList === 'string' || Array.isArray(idOrList)) {
      const idsList = this.cacheStorage.deferredGetList.get(entityConstructor) || new Set();

      for (const idItem of Array.isArray(idOrList) ? idOrList : [idOrList]) {
        idsList.add(idItem as string);
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
  deferredRemove<T extends Entity>(entityConstructor: EntityClass<T>, idOrList: string | string[]): Store {
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
    if (isIntersection) this.cacheStorage.entities.set(entityConstructor, cachedEntities);
    return this;
  }

  private _upsert<E extends CachedModel<E>>(
    entityOrList: CachedModel<E> | CachedModel<E>[],
    setForFlush: boolean
  ): void {
    if (Array.isArray(entityOrList) && entityOrList.length === 0) return;

    const entityClassConstructor = (Array.isArray(entityOrList) ? entityOrList[0] : entityOrList)
      .constructor as EntityClass<E>;
    const existingEntities =
      this.cacheStorage.entities.get(entityClassConstructor) || new Map<string, CachedModel<E>>();
    const existingEntitiesForFlush =
      this.cacheStorage.entitiesForFlush.get(entityClassConstructor) || new Set<string>();

    this.cacheStorage.setEntityName(entityClassConstructor);

    for (let entity of Array.isArray(entityOrList) ? entityOrList : [entityOrList]) {
      let entityDecorated = entity;
      for (const entityFieldName in entity) {
        let fieldValue = entity[entityFieldName as keyof CachedModel<E>];

        if (fieldValue !== null && typeof fieldValue === 'object' && !Array.isArray(fieldValue) && 'id' in fieldValue) {
          const fieldValueDecorated = fieldValue as unknown as Entity;
          entityDecorated[entityFieldName as keyof E] = {
            id: fieldValueDecorated.id
          } as unknown as E[keyof E];
          this._upsert(fieldValue as EntityClassConstructable[keyof EntityClassConstructable], false);
        }
      }

      existingEntities.set(entityDecorated.id, entityDecorated);
      if (setForFlush) existingEntitiesForFlush.add(entity.id);
    }

    this.cacheStorage.entities.set(entityClassConstructor, existingEntities);
    if (setForFlush) this.cacheStorage.entitiesForFlush.set(entityClassConstructor, existingEntitiesForFlush);
  }

  /**
   * Set/update item in cache by id.
   * All items which are upserted by this method will be saved into DB during further execution of ".flush" method
   */
  deferredUpsert<T extends CachedModel<T>>(entity: T): Store;
  deferredUpsert<T extends CachedModel<T>>(entities: T[]): Store;
  deferredUpsert<T extends CachedModel<T>>(e: T | T[]): Store {
    this._upsert(e, true);
    return this;
  }

  /**
   * Load all deferred get from the db, clear deferredLoad and deferredFindWhereList items list,
   * set loaded items to cache storage.
   */
  async load(): Promise<void> {
    for (const [entityClass, idsSet] of this.cacheStorage.deferredGetList.entries()) {
      /**
       * Fetch all available entities of iterated class.
       */
      if (idsSet.has('*')) {
        const entitiesList: CachedModel<typeof entityClass>[] = await this.find(entityClass, {
          where: {}
        });

        this._upsert(entitiesList, false);
        continue;
      }

      if (!idsSet || idsSet.size === 0) continue;

      const entitiesList: CachedModel<typeof entityClass>[] = await this.find(entityClass, {
        where: { id: In([...idsSet.values()]) }
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
  async flush(): Promise<void> {
    await this._flushAll();
    this.cacheStorage.deferredRemoveList.clear();
  }

  private async _flushAll(): Promise<void> {
    for (const i in this.schemaMetadata.entitiesOrderedList) {
      if (this.cacheStorage.entitiesNames.has(this.schemaMetadata.entitiesOrderedList[i])) {
        await this._flushByClass(this.cacheStorage.entitiesNames.get(this.schemaMetadata.entitiesOrderedList[i])!);
      }
    }
  }

  private async _flushByClass<E extends Entity>(
    entityConstructor: EntityClass<E>,
    recursive: boolean = false
  ): Promise<void> {
    /**
     * We need to save all relations of current class beforehand by relations tree of this class to avoid
     * "violates foreign key constraint" errors.
     */
    if (recursive) {
      if (this.schemaMetadata.entitiesRelationsTree.has(entityConstructor.name)) {
        for (const relName of this.schemaMetadata.entitiesRelationsTree.get(entityConstructor.name) || []) {
          if (this.cacheStorage.entitiesNames.has(relName))
            await this._flushByClass(this.cacheStorage.entitiesNames.get(relName)!, false);
        }
      }
    }
    if (this.cacheStorage.entitiesForFlush.has(entityConstructor)) {
      const forFlush = this.cacheStorage.entitiesForFlush.get(entityConstructor) || new Set<string>();

      const listForSave = [
        ...(this.cacheStorage.entities.get(entityConstructor) || new Map<string, CachedModel<E>>()).values()
      ].filter(entity => forFlush.has(entity.id));

      await this._save(listForSave);
      this.cacheStorage.entitiesForFlush.set(entityConstructor, new Set<string>());
    }

    if (this.cacheStorage.deferredRemoveList.has(entityConstructor)) {
      await this._remove(entityConstructor, [
        ...(this.cacheStorage.deferredRemoveList.get(entityConstructor) || new Set<string>()).values()
      ]);
      this.cacheStorage.deferredRemoveList.set(entityConstructor, new Set<string>());
    }
  }

  /**
   * Delete entity item from cache storage of the specific class
   */
  private _cacheDelete<T extends Entity>(entityConstructor: EntityClass<T>, idOrList: string | string[]): void {
    if (!this.cacheStorage.entities.has(entityConstructor)) return;
    for (const id of Array.isArray(idOrList) ? idOrList : [idOrList]) {
      this.cacheStorage.entities.get(entityConstructor)!.delete(id);
    }
  }

  /**
   * Check by ID if entity is existing in cache
   */
  has<T extends Entity>(entityConstructor: EntityClass<T>, id: string): boolean {
    return (this.cacheStorage.entities.get(entityConstructor) || new Map()).has(id);
  }

  /**
   * Get all entities of specific class.
   * Returns a new iterator object that contains the values for
   * each element in the Map object in insertion order.
   */
  values<T extends Entity>(entityConstructor: EntityClass<T>): IterableIterator<T> | [] {
    return (this.cacheStorage.entities.get(entityConstructor) || new Map()).values() || null;
  }

  /**
   * Returns full cache data
   */
  entries(): Map<EntityClassConstructable, Map<string, CachedModel<EntityClassConstructable>>> {
    return this.cacheStorage.entities;
  }

  /**
   * Delete all entities of specific class from cache storage
   */
  clear<T extends Entity>(entityConstructor: EntityClass<T>): void {
    if (!this.cacheStorage.entities.has(entityConstructor)) return;
    this.cacheStorage.entities.get(entityConstructor)!.clear();
  }

  /**
   * Purge current cache.
   */
  purge(): void {
    this.cacheStorage.entities.clear();
  }

  /**
   * If there are unresolved gets
   */
  ready(): boolean {
    return this.cacheStorage.deferredGetList.size === 0 && this.cacheStorage.deferredRemoveList.size === 0;
  }

  /**
   * If there were upsets after .load()
   */
  isDirty(): boolean {
    return this.cacheStorage.entitiesForFlush.size > 0;
  }

  /**
   * ::: TypeORM Store methods :::
   */

  private async _processFetch<E extends Entity, RT extends E[] | E | undefined | number>(
    e: E | E[] | EntityClass<E>,
    fetchCb: () => Promise<RT>
  ): Promise<RT> {
    const entityClass = this._extractEntityClass(e);
    this.cacheStorage.setEntityName(entityClass);

    await this._flushByClass(entityClass, true);
    const response = await fetchCb();

    if (response !== undefined && typeof response !== 'number') {
      this._upsert(response as E | E[], false);
    }
    return response;
  }

  save<E extends Entity>(entity: E): Promise<void>;
  save<E extends Entity>(entities: E[]): Promise<void>;
  async save<E extends Entity>(e: E | E[]): Promise<void> {
    this._upsert(e, false);
    await this._save(e);
  }
  private async _save<E extends Entity>(e: E | E[]): Promise<void> {
    if (Array.isArray(e)) {
      if (e.length == 0) return;
      let entityClass = e[0].constructor as EntityClass<E>;
      for (let i = 1; i < e.length; i++) {
        assert(entityClass === e[i].constructor, 'mass saving allowed only for entities of the same class');
      }
      await this.em().then(em => this.saveMany(em, entityClass, e));
    } else {
      await this.em().then(em => em.upsert(e.constructor as EntityClass<E>, e as any, ['id']));
    }
  }

  private async saveMany(em: EntityManager, entityClass: EntityClass<any>, entities: any[]): Promise<void> {
    assert(entities.length > 0);
    let metadata = em.connection.getMetadata(entityClass);
    let fk = metadata.columns.filter(c => c.relationMetadata);
    if (fk.length == 0) return this.upsertMany(em, entityClass, entities);
    let currentSignature = this.getFkSignature(fk, entities[0]);
    let batch = [];
    for (let e of entities) {
      let sig = this.getFkSignature(fk, e);
      if (sig === currentSignature) {
        batch.push(e);
      } else {
        await this.upsertMany(em, entityClass, batch);
        currentSignature = sig;
        batch = [e];
      }
    }
    if (batch.length) {
      await this.upsertMany(em, entityClass, batch);
    }
  }

  private getFkSignature(fk: ColumnMetadata[], entity: any): bigint {
    let sig = 0n;
    for (let i = 0; i < fk.length; i++) {
      let bit = fk[i].getEntityValue(entity) === undefined ? 0n : 1n;
      sig |= bit << BigInt(i);
    }
    return sig;
  }

  private async upsertMany(em: EntityManager, entityClass: EntityClass<any>, entities: any[]): Promise<void> {
    for (let b of splitIntoBatches(entities, 1000)) {
      await em.upsert(entityClass, b as any, ['id']);
    }
  }

  /**
   * Inserts a given entity or entities into the database.
   * Does not check if the entity(s) exist in the database and will fail if a duplicate is inserted.
   *
   * Executes a primitive INSERT operation without cascades, relations, etc.
   */
  insert<E extends Entity>(entity: E): Promise<void>;
  insert<E extends Entity>(entities: E[]): Promise<void>;
  async insert<E extends Entity>(e: E | E[]): Promise<void> {
    this._upsert(e, false);
    if (Array.isArray(e)) {
      if (e.length == 0) return;
      let entityClass = e[0].constructor as EntityClass<E>;
      for (let i = 1; i < e.length; i++) {
        assert(entityClass === e[i].constructor, 'mass saving allowed only for entities of the same class');
      }
      await this.em().then(async em => {
        for (let b of splitIntoBatches(e, 1000)) {
          await em.insert(entityClass, b as any);
        }
      });
    } else {
      await this.em().then(em => em.insert(e.constructor as EntityClass<E>, e as any));
    }
  }

  /**
   * Deletes a given entity or entities from the database with pre-flushing cache content into DB.
   *
   * Unlike {@link EntityManager.remove} executes a primitive DELETE query without cascades, relations, etc.
   */

  remove<E extends Entity>(entity: E): Promise<void>;
  remove<E extends Entity>(entities: E[]): Promise<void>;
  remove<E extends Entity>(entityClass: EntityClass<E>, id: string | string[]): Promise<void>;
  async remove<E extends Entity>(e: E | E[] | EntityClass<E>, id?: string | string[]): Promise<void> {
    if (id && !Array.isArray(e) && !('id' in e)) {
      this.cacheStorage.setEntityName(e);
      await this._flushByClass(e, true);
      await this._remove(e, id);
      this._cacheDelete(e, id);
    } else if (id == null && ((Array.isArray(e) && 'id' in e[0]) || (!Array.isArray(e) && 'id' in e))) {
      const entityClass = this._extractEntityClass(e);
      this.cacheStorage.setEntityName(entityClass);
      if (Array.isArray(e)) {
        for (let i = 1; i < e.length; i++) {
          assert(entityClass === e[i].constructor, 'mass deletion allowed only for entities of the same class');
        }
      }
      const idOrList = Array.isArray(e) ? (e as E[]).map(i => i.id) : (e as E).id;
      await this._flushByClass(entityClass, true);
      await this._remove(e as E | E[]);
      this._cacheDelete(entityClass, idOrList);
    } else {
      return;
    }
  }

  /**
   * Deletes a given entity or entities from the database.
   *
   * Unlike {@link EntityManager.remove} executes a primitive DELETE query without cascades, relations, etc.
   */
  private async _remove<E extends Entity>(e: E | E[] | EntityClass<E>, id?: string | string[]): Promise<void> {
    if (id == null) {
      if (Array.isArray(e)) {
        if (e.length == 0) return;
        let entityClass = e[0].constructor as EntityClass<E>;
        await this.em().then(em =>
          em.delete(
            entityClass,
            e.map(i => i.id)
          )
        );
      } else {
        let entity = e as E;
        await this.em().then(em => em.delete(entity.constructor, entity.id));
      }
    } else {
      await this.em().then(em => em.delete(e as EntityClass<E>, id));
    }
  }

  count<E extends Entity>(entityClass: EntityClass<E>, options?: FindManyOptions<E>): Promise<number> {
    return this._processFetch(entityClass, (): Promise<number> => this.em().then(em => em.count(entityClass, options)));
  }

  countBy<E extends Entity>(
    entityClass: EntityClass<E>,
    where: FindOptionsWhere<E> | FindOptionsWhere<E>[]
  ): Promise<number> {
    return this._processFetch(entityClass, (): Promise<number> => this.em().then(em => em.countBy(entityClass, where)));
  }

  find<E extends Entity>(entityClass: EntityClass<E>, options?: FindManyOptions<E>): Promise<E[]> {
    return this._processFetch(
      entityClass,
      (): Promise<E[]> =>
        this.em().then(em =>
          em.find(entityClass, {
            ...options,
            loadRelationIds: {
              disableMixedMap: true
            }
          })
        )
    );
  }

  findBy<E extends Entity>(
    entityClass: EntityClass<E>,
    where: FindOptionsWhere<E> | FindOptionsWhere<E>[]
  ): Promise<E[]> {
    return this._processFetch(
      entityClass,
      (): Promise<E[]> =>
        this.em().then(em =>
          em.find(entityClass, {
            loadRelationIds: {
              disableMixedMap: true
            },
            where
          })
        )
    );
  }

  findOne<E extends Entity>(entityClass: EntityClass<E>, options: FindOneOptions<E>): Promise<E | undefined> {
    return this._processFetch(
      entityClass,
      (): Promise<E | undefined> =>
        this.em()
          .then(em =>
            em.findOne(entityClass, {
              ...options,
              loadRelationIds: {
                disableMixedMap: true
              }
            })
          )
          .then(noNull)
    );
  }

  findOneBy<E extends Entity>(
    entityClass: EntityClass<E>,
    where: FindOptionsWhere<E> | FindOptionsWhere<E>[]
  ): Promise<E | undefined> {
    return this._processFetch(
      entityClass,
      (): Promise<E | undefined> =>
        this.em()
          .then(em => em.findOneBy(entityClass, where))
          .then(noNull)
    );
  }

  findOneOrFail<E extends Entity>(entityClass: EntityClass<E>, options: FindOneOptions<E>): Promise<E> {
    return this._processFetch(
      entityClass,
      (): Promise<E> =>
        this.em().then(em =>
          em.findOneOrFail(entityClass, {
            ...options,
            loadRelationIds: {
              disableMixedMap: true
            }
          })
        )
    );
  }

  findOneByOrFail<E extends Entity>(
    entityClass: EntityClass<E>,
    where: FindOptionsWhere<E> | FindOptionsWhere<E>[]
  ): Promise<E> {
    return this._processFetch(
      entityClass,
      (): Promise<E> => this.em().then(em => em.findOneByOrFail(entityClass, where))
    );
  }

  /**
   * Get entity by ID either from cache or DB if cache storage doesn't contain requested item.
   * @param entityClass
   * @param id
   */
  get<E extends Entity>(entityClass: EntityClass<E>, id: string): Promise<E | null> {
    return (
      ((this.cacheStorage.entities.get(entityClass) || new Map()).get(id) ||
        this._processFetch(entityClass, (): Promise<E | undefined> => this.findOneBy(entityClass, { id } as any))) ??
      null
    );
  }

  getOrFail<E extends Entity>(entityClass: EntityClass<E>, id: string): Promise<E> {
    return (
      (this.cacheStorage.entities.get(entityClass) || new Map()).get(id) ||
      this._processFetch(entityClass, (): Promise<E> => this.findOneByOrFail(entityClass, { id } as any))
    );
  }

  /**
   * :::: UTILITY METHODS :::
   */

  private _extractEntityClass<E extends Entity>(e: E | E[] | EntityClass<E>): EntityClass<E> {
    const singleEnOrClass = Array.isArray(e) ? e[0] : e;
    return 'id' in singleEnOrClass
      ? (singleEnOrClass.constructor as EntityClass<E>)
      : (singleEnOrClass as EntityClass<E>);
  }
}

function* splitIntoBatches<T>(list: T[], maxBatchSize: number): Generator<T[]> {
  if (list.length <= maxBatchSize) {
    yield list;
  } else {
    let offset = 0;
    while (list.length - offset > maxBatchSize) {
      yield list.slice(offset, offset + maxBatchSize);
      offset += maxBatchSize;
    }
    yield list.slice(offset);
  }
}

function noNull<T>(val: null | undefined | T): T | undefined {
  return val == null ? undefined : val;
}
