import { EntityClass, Store, Entity, FindManyOptions, FindOneOptions, TypeormDatabaseOptions } from '@subsquid/typeorm-store';

import { EntityManager, FindOptionsOrder, FindOptionsRelations, FindOptionsWhere, In } from 'typeorm';
import { EntityTarget } from 'typeorm/common/EntityTarget';
import { ColumnMetadata } from 'typeorm/metadata/ColumnMetadata';
import assert from 'assert';
import { BatchContext } from '@subsquid/substrate-processor';
import { SchemeMetadata } from './utils/schemaMetadata';

export { EntityClass, Entity, FindManyOptions, FindOneOptions, TypeormDatabase, FullTypeormDatabase, IsolationLevel } from '@subsquid/typeorm-store';

export type EntityClassConstructable = EntityClass<Entity>;

export type CacheEntityParams = EntityClassConstructable | [EntityClassConstructable, Record<keyof EntityClassConstructable, EntityClassConstructable>]; // Inherited from FindOneOptions['loadRelationIds']['relations']

export type CachedModel<T> = {
  [P in keyof T]: Exclude<T[P], null | undefined> extends Entity ? (null | undefined extends T[P] ? Entity | null | undefined : Entity) : T[P];
} & Entity;

export class CacheStorage {
  private static instance: CacheStorage;

  public entities = new Map<EntityClassConstructable, Map<string, CachedModel<EntityClassConstructable>>>();
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
}

export class StoreWithCache {

  constructor(private em: () => Promise<EntityManager>, private cacheStorage: CacheStorage, private schemaMetadata: SchemeMetadata) {}

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
  // TODO theoretically won't be used as original .find***() method
  //  can be used which will save results into local cache store
  //  underhood.
  // deferredLoad<T extends Entity>(entityConstructor: EntityClass<T>, findOptions?: FindOptionsWhere<T> | FindOptionsWhere<T>[]): StoreWithCache;

  deferredLoad<T extends Entity>(entityConstructor: EntityClass<T>, idOrList?: string | string[]): StoreWithCache {
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
  deferredRemove<T extends Entity>(entityConstructor: EntityClass<T>, idOrList: string | string[]): StoreWithCache {
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

  private _upsert<T extends CachedModel<T>>(entity: T, setForFlush: boolean): void;
  private _upsert<T extends CachedModel<T>>(entities: T[], setForFlush: boolean): void;
  private _upsert<T extends CachedModel<T>>(entityOrList: T | T[], setForFlush: boolean): void {
    if (Array.isArray(entityOrList) && entityOrList.length === 0) return;

    const entityClassConstructor = (Array.isArray(entityOrList) ? entityOrList[0] : entityOrList).constructor as EntityClass<T>;
    const existingEntities = this.cacheStorage.entities.get(entityClassConstructor) || new Map<string, CachedModel<T>>();
    const existingEntitiesForFlush = this.cacheStorage.entitiesForFlush.get(entityClassConstructor) || new Set<string>();

    for (let entity of Array.isArray(entityOrList) ? entityOrList : [entityOrList]) {
      let entityDecorated = entity;
      for (const entityFieldName in entity) {
        let fieldValue = entity[entityFieldName];

        if (fieldValue !== null && typeof fieldValue === 'object' && !Array.isArray(fieldValue) && 'id' in fieldValue) {
          const fieldValueDecorated = fieldValue as unknown as Entity;
          entityDecorated[entityFieldName as keyof T] = {
            id: fieldValueDecorated.id
          } as unknown as T[keyof T];
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
  cacheUpsert<T extends CachedModel<T>>(entities: T[]): void;
  cacheUpsert<T extends CachedModel<T>>(entity: T): void;
  cacheUpsert<T extends CachedModel<T>>(entityOrList: T | T[]): void {
    //@ts-ignore
    this._upsert(entityOrList, true);
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
  async cacheFlush(): Promise<void> {
    await this._flushAll();
    this.cacheStorage.deferredRemoveList.clear();
  }

  private async _flushAll(): Promise<void> {
    const entityClasses = new Map<string, EntityClassConstructable>();
    const { entitiesOrderedList } = this.schemaMetadata;

    [...this.cacheStorage.entities.keys()].forEach(item => entityClasses.set(item.name, item));

    for (const i in entitiesOrderedList) {
      if (entityClasses.has(entitiesOrderedList[i])) {
        await this._flushByClass(entityClasses.get(entitiesOrderedList[i])!);
      }
    }
  }

  private async _flushByClass<T extends Entity>(entityConstructor: EntityClass<T>): Promise<void> {
    if (this.cacheStorage.entitiesForFlush.has(entityConstructor)) {
      const forFlush = this.cacheStorage.entitiesForFlush.get(entityConstructor) || new Set<string>();

      const listForSave = [...(this.cacheStorage.entities.get(entityConstructor) || new Map<string, CachedModel<T>>()).values()].filter(entity => forFlush.has(entity.id));

      await this.save(listForSave);
      this.cacheStorage.entitiesForFlush.set(entityConstructor, new Set<string>());
    }

    if (!this.cacheStorage.deferredRemoveList.has(entityConstructor)) return;
    await this.remove(entityConstructor, [...(this.cacheStorage.deferredRemoveList.get(entityConstructor) || new Set<string>()).values()]);
    this.cacheStorage.deferredRemoveList.set(entityConstructor, new Set<string>());
  }

  /**
   * Check by ID if entity is existing in cache
   */
  cacheHas<T extends Entity>(entityConstructor: EntityClass<T>, id: string): boolean {
    return (this.cacheStorage.entities.get(entityConstructor) || new Map()).has(id);
  }

  /**
   * Get entity by id form cache
   */
  cacheGet<T extends Entity>(entityConstructor: EntityClass<T>, id: string): T | null {
    return (this.cacheStorage.entities.get(entityConstructor) || new Map()).get(id) || null;
  }

  /**
   * Get all entities of specific class.
   * Returns a new iterator object that contains the values for
   * each element in the Map object in insertion order.
   */
  cacheValues<T extends Entity>(entityConstructor: EntityClass<T>): IterableIterator<T> | [] {
    return (this.cacheStorage.entities.get(entityConstructor) || new Map()).values() || null;
  }

  /**
   * Returns full cache data
   */
  cacheEntries(): Map<EntityClassConstructable, Map<string, CachedModel<EntityClassConstructable>>> {
    return this.cacheStorage.entities;
  }

  /**
   * Delete entity item from cache storage of the specific class
   */
  cacheDelete<T extends Entity>(entityConstructor: EntityClass<T>, id: string): void {
    if (!this.cacheStorage.entities.has(entityConstructor)) return;
    this.cacheStorage.entities.get(entityConstructor)!.delete(id);
  }

  /**
   * Delete all entities of specific class from cache storage
   */
  cacheClear<T extends Entity>(entityConstructor: EntityClass<T>): void {
    if (!this.cacheStorage.entities.has(entityConstructor)) return;
    this.cacheStorage.entities.get(entityConstructor)!.clear();
  }

  /**
   * Purge current cache.
   */
  cachePurge(): void {
    this.cacheStorage.entities.clear();
  }

  /**
   * If there are unresolved gets
   */
  cacheReady(): boolean {
    return false;
  }

  /**
   * If there were upsets after Cache.load()
   */
  cacheIsDirty(): boolean {
    // return this.cacheStorage.deferredGetList.size > 0 || this.deferredFindWhereList.size > 0;
    return this.cacheStorage.deferredGetList.size > 0;
  }

  /**
   * ::: TypeORM Store methods :::
   */

  private _processFetch<E extends Entity>(entityClass: EntityClass<E>, fetchCb: () => Promise<number>): Promise<number>;
  private _processFetch<E extends Entity>(entityClass: EntityClass<E>, fetchCb: () => Promise<E[]>): Promise<E[]>;
  private _processFetch<E extends Entity>(entityClass: EntityClass<E>, fetchCb: () => Promise<E | undefined>): Promise<E | undefined>;
  private async _processFetch<E extends Entity>(e: E | E[] | EntityClass<E>, fetchCb: () => Promise<E[] | E | undefined | number>) {
    // @ts-ignore
    await this._flushByClass(e);
    const response = await fetchCb();

    //@ts-ignore
    if (typeof response !== undefined && typeof response !== 'number')
      //@ts-ignore
      this._upsert(response, false);
    return response; // TODO should be returned the same entity instance as located in local cache store
  }

  // ================================================================================

  save<E extends Entity>(entity: E): Promise<void>;
  save<E extends Entity>(entities: E[]): Promise<void>;
  async save<E extends Entity>(e: E | E[]): Promise<void> {
    //@ts-ignore
    this._upsert(e, false);
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
    // @ts-ignore
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
   * Deletes a given entity or entities from the database.
   *
   * Unlike {@link EntityManager.remove} executes a primitive DELETE query without cascades, relations, etc.
   */
  remove<E extends Entity>(entity: E): Promise<void>;
  remove<E extends Entity>(entities: E[]): Promise<void>;
  remove<E extends Entity>(entityClass: EntityClass<E>, id: string | string[]): Promise<void>;
  async remove<E extends Entity>(e: E | E[] | EntityClass<E>, id?: string | string[]): Promise<void> {
    const singleEnOrClass = Array.isArray(e) ? e[0] : e;
    const enClass = 'id' in singleEnOrClass ? (Object.getPrototypeOf(singleEnOrClass).constructor as EntityClass<E>) : (singleEnOrClass as EntityClass<E>);
    //@ts-ignore
    const eId = id ?? singleEnOrClass.id;
    await this._flushByClass(enClass);

    if (id == null) {
      if (Array.isArray(e)) {
        if (e.length == 0) return;
        let entityClass = e[0].constructor as EntityClass<E>;
        for (let i = 1; i < e.length; i++) {
          assert(entityClass === e[i].constructor, 'mass deletion allowed only for entities of the same class');
        }
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
    this.cacheDelete(enClass, eId);
  }

  count<E extends Entity>(entityClass: EntityClass<E>, options?: FindManyOptions<E>): Promise<number> {
    return this._processFetch(entityClass, (): Promise<number> => this.em().then(em => em.count(entityClass, options)));
  }

  countBy<E extends Entity>(entityClass: EntityClass<E>, where: FindOptionsWhere<E> | FindOptionsWhere<E>[]): Promise<number> {
    return this._processFetch(entityClass, (): Promise<number> => this.em().then(em => em.countBy(entityClass, where)));
  }

  find<E extends Entity>(entityClass: EntityClass<E>, options?: FindManyOptions<E>): Promise<E[]> {
    return this._processFetch(entityClass, (): Promise<E[]> => this.em().then(em => em.find(entityClass, options)));
  }

  findBy<E extends Entity>(entityClass: EntityClass<E>, where: FindOptionsWhere<E> | FindOptionsWhere<E>[]): Promise<E[]> {
    return this._processFetch(entityClass, (): Promise<E[]> => this.em().then(em => em.findBy(entityClass, where)));
  }

  findOne<E extends Entity>(entityClass: EntityClass<E>, options: FindOneOptions<E>): Promise<E | undefined> {
    return this._processFetch(
      entityClass,
      (): Promise<E | undefined> =>
        this.em()
          .then(em => em.findOne(entityClass, options))
          .then(noNull)
    );
  }

  findOneBy<E extends Entity>(entityClass: EntityClass<E>, where: FindOptionsWhere<E> | FindOptionsWhere<E>[]): Promise<E | undefined> {
    return this._processFetch(
      entityClass,
      (): Promise<E | undefined> =>
        this.em()
          .then(em => em.findOneBy(entityClass, where))
          .then(noNull)
    );
  }

  // findOneOrFail<E extends Entity>(entityTarget: EntityTarget<E>, options: FindOneOptions<E>): Promise<E> {
  //   return this._processFetch(entityTarget, (): Promise<E[]> => this.em().then(em => em.findOneOrFail(entityTarget, options)));
  // }
  //
  // findOneByOrFail<E extends Entity>(entityClass: EntityTarget<E>, where: FindOptionsWhere<E> | FindOptionsWhere<E>[]): Promise<E> {
  //   return this._processFetch(entityTarget, (): Promise<E[]> => this.em().then(em => em.findOneByOrFail(entityClass, where)));
  // }

  get<E extends Entity>(entityClass: EntityClass<E>, optionsOrId: FindOneOptions<E> | string): Promise<E | undefined> {
    if (typeof optionsOrId == 'string') {
      return this._processFetch(entityClass, (): Promise<E | undefined> => this.findOneBy(entityClass, { id: optionsOrId } as any));
    } else {
      return this._processFetch(entityClass, (): Promise<E | undefined> => this.findOne(entityClass, optionsOrId));
    }
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
