import {
  EntityClass,
  Store,
  Entity,
  FindManyOptions,
  FindOneOptions,
  TypeormDatabaseOptions
} from '@subsquid/typeorm-store';

import {
  EntityManager,
  FindOptionsOrder,
  FindOptionsRelations,
  FindOptionsWhere,
  In
} from 'typeorm';
import { EntityTarget } from 'typeorm/common/EntityTarget';
import { ColumnMetadata } from 'typeorm/metadata/ColumnMetadata';
import assert from 'assert';
import { BatchContext } from '@subsquid/substrate-processor';
import { SchemeMetadata } from './utils/schemaMetadata';

export {
  EntityClass,
  Entity,
  FindManyOptions,
  FindOneOptions,
  TypeormDatabase,
  FullTypeormDatabase,
  IsolationLevel
} from '@subsquid/typeorm-store';

export type EntityClassConstructable = EntityClass<Entity>;

export type CacheEntityParams =
  | EntityClassConstructable
  | [
      EntityClassConstructable,
      Record<keyof EntityClassConstructable, EntityClassConstructable>
    ]; // Inherited from FindOneOptions['loadRelationIds']['relations']

export type CachedModel<T> = {
  [P in keyof T]: Exclude<T[P], null | undefined> extends Entity
    ? null | undefined extends T[P]
      ? Entity | null | undefined
      : Entity
    : T[P];
} & Entity;

export class StoreWithCache extends Store {
  private entities = new Map<
    EntityClassConstructable,
    Map<string, CachedModel<EntityClassConstructable>>
  >();
  private entitiesForFlush = new Map<EntityClassConstructable, Set<string>>();

  private deferredGetList = new Map<EntityClassConstructable, Set<string>>();
  private deferredRemoveList = new Map<EntityClassConstructable, Set<string>>();
  // cache = {
  //   get: this.cacheGet,
  //   upsert: this.cacheUpsert
  // };

  constructor(
    private _em: () => Promise<EntityManager>,
    private schemaMetadata: SchemeMetadata
  ) {
    super(_em);
  }

  /**
   * Add request for loading all entities of defined class.
   */
  deferredLoad<T extends Entity>(
    entityConstructor: EntityClass<T>
  ): StoreWithCache;
  /**
   * Add ids of entities which should be loaded, resolved after Cache.load()
   * (keeps items as Map structure).
   */
  deferredLoad<T extends Entity>(
    entityConstructor: EntityClass<T>,
    idOrList?: string | string[]
  ): StoreWithCache;
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

  deferredLoad<T extends Entity>(
    entityConstructor: EntityClass<T>,
    idOrList?: string | string[]
  ): StoreWithCache {
    if (!idOrList) {
      this.deferredGetList.set(entityConstructor, new Set<string>().add('*'));
      return this;
    } else if (typeof idOrList === 'string' || Array.isArray(idOrList)) {
      const idsList = this.deferredGetList.get(entityConstructor) || new Set();

      for (const idItem of Array.isArray(idOrList) ? idOrList : [idOrList]) {
        idsList.add(idItem as string);
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
  deferredRemove<T extends Entity>(
    entityConstructor: EntityClass<T>,
    idOrList: string | string[]
  ): StoreWithCache {
    const defRemIdsList =
      this.deferredRemoveList.get(entityConstructor) || new Set();

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
    if (isIntersection) this.entities.set(entityConstructor, cachedEntities);
    return this;
  }

  private _upsert<T extends CachedModel<T>>(
    entity: T,
    setForFlush: boolean
  ): void;
  private _upsert<T extends CachedModel<T>>(
    entities: T[],
    setForFlush: boolean
  ): void;
  private _upsert<T extends CachedModel<T>>(
    entityOrList: T | T[],
    setForFlush: boolean
  ): void {
    if (Array.isArray(entityOrList) && entityOrList.length === 0) return;

    const entityClassConstructor = (
      Array.isArray(entityOrList) ? entityOrList[0] : entityOrList
    ).constructor as EntityClass<T>;
    const existingEntities =
      this.entities.get(entityClassConstructor) ||
      new Map<string, CachedModel<T>>();
    const existingEntitiesForFlush =
      this.entitiesForFlush.get(entityClassConstructor) || new Set<string>();

    for (let entity of Array.isArray(entityOrList)
      ? entityOrList
      : [entityOrList]) {
      let entityDecorated = entity;
      for (const entityFieldName in entity) {
        let fieldValue = entity[entityFieldName];

        if (
          fieldValue !== null &&
          typeof fieldValue === 'object' &&
          !Array.isArray(fieldValue) &&
          'id' in fieldValue
        ) {
          const fieldValueDecorated = fieldValue as unknown as Entity;
          entityDecorated[entityFieldName as keyof T] = {
            id: fieldValueDecorated.id
          } as unknown as T[keyof T];
          this._upsert(
            fieldValue as EntityClassConstructable[keyof EntityClassConstructable],
            false
          );
        }
      }

      existingEntities.set(entityDecorated.id, entityDecorated);
      if (setForFlush) existingEntitiesForFlush.add(entity.id);
    }

    this.entities.set(entityClassConstructor, existingEntities);
    if (setForFlush)
      this.entitiesForFlush.set(
        entityClassConstructor,
        existingEntitiesForFlush
      );
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
    for (const [entityClass, idsSet] of this.deferredGetList.entries()) {
      /**
       * Fetch all available entities of iterated class.
       */
      if (idsSet.has('*')) {
        const entitiesList: CachedModel<typeof entityClass>[] =
          await super.find(entityClass, {
            where: {}
          });

        this._upsert(entitiesList, false);
        continue;
      }

      if (!idsSet || idsSet.size === 0) continue;

      const entitiesList: CachedModel<typeof entityClass>[] = await super.find(
        entityClass,
        {
          where: { id: In([...idsSet.values()]) }
        }
      );

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
  async cacheFlush(): Promise<void> {
    await this._flushAll();
    this.deferredRemoveList.clear();
  }

  private async _flushAll(): Promise<void> {
    const entityClasses = new Map<string, EntityClassConstructable>();
    const { entitiesOrderedList } = this.schemaMetadata;

    [...this.entities.keys()].forEach(item =>
      entityClasses.set(item.name, item)
    );

    for (const i in entitiesOrderedList) {
      if (entityClasses.has(entitiesOrderedList[i])) {
        await this._flushByClass(entityClasses.get(entitiesOrderedList[i])!);
      }
    }
  }

  private async _flushByClass<T extends Entity>(
    entityConstructor: EntityClass<T>
  ): Promise<void> {
    if (this.entitiesForFlush.has(entityConstructor)) {
      const forFlush =
        this.entitiesForFlush.get(entityConstructor) || new Set<string>();

      const listForSave = [
        ...(
          this.entities.get(entityConstructor) ||
          new Map<string, CachedModel<T>>()
        ).values()
      ].filter(entity => forFlush.has(entity.id));

      await super.save(listForSave);
      this.entitiesForFlush.set(entityConstructor, new Set<string>());
    }

    if (!this.deferredRemoveList.has(entityConstructor)) return;
    await super.remove(entityConstructor, [
      ...(
        this.deferredRemoveList.get(entityConstructor) || new Set<string>()
      ).values()
    ]);
    this.deferredRemoveList.set(entityConstructor, new Set<string>());
  }

  /**
   * Check by ID if entity is existing in cache
   */
  cacheHas<T extends Entity>(
    entityConstructor: EntityClass<T>,
    id: string
  ): boolean {
    return (this.entities.get(entityConstructor) || new Map()).has(id);
  }

  /**
   * Get entity by id form cache
   */
  cacheGet<T extends Entity>(
    entityConstructor: EntityClass<T>,
    id: string
  ): T | null {
    return (this.entities.get(entityConstructor) || new Map()).get(id) || null;
  }

  /**
   * Get all entities of specific class.
   * Returns a new iterator object that contains the values for
   * each element in the Map object in insertion order.
   */
  cacheValues<T extends Entity>(
    entityConstructor: EntityClass<T>
  ): IterableIterator<T> | [] {
    return (this.entities.get(entityConstructor) || new Map()).values() || null;
  }

  /**
   * Returns full cache data
   */
  cacheEntries(): Map<
    EntityClassConstructable,
    Map<string, CachedModel<EntityClassConstructable>>
  > {
    return this.entities;
  }

  /**
   * Delete entity item from cache storage of the specific class
   */
  cacheDelete<T extends Entity>(
    entityConstructor: EntityClass<T>,
    id: string
  ): void {
    if (!this.entities.has(entityConstructor)) return;
    this.entities.get(entityConstructor)!.delete(id);
  }

  /**
   * Delete all entities of specific class from cache storage
   */
  cacheClear<T extends Entity>(entityConstructor: EntityClass<T>): void {
    if (!this.entities.has(entityConstructor)) return;
    this.entities.get(entityConstructor)!.clear();
  }

  /**
   * Purge current cache.
   */
  cachePurge(): void {
    this.entities.clear();
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
    // return this.deferredGetList.size > 0 || this.deferredFindWhereList.size > 0;
    return this.deferredGetList.size > 0;
  }

  private _processFetch<E extends Entity>(
    entityClass: EntityClass<E>,
    fetchCb: () => Promise<number>
  ): Promise<number>;
  private _processFetch<E extends Entity>(
    entityClass: EntityClass<E>,
    fetchCb: () => Promise<E[]>
  ): Promise<E[]>;
  private _processFetch<E extends Entity>(
    entityClass: EntityClass<E>,
    fetchCb: () => Promise<E | undefined>
  ): Promise<E | undefined>;
  private async _processFetch<E extends Entity>(
    e: E | E[] | EntityClass<E>,
    fetchCb: () => Promise<E[] | E | undefined | number>
  ) {
    // @ts-ignore
    await this._flushByClass(e);
    const response = await fetchCb();

    //@ts-ignore
    if (typeof response !== undefined && typeof response !== 'number')
      //@ts-ignore
      this._upsert(response, false);
    return response; // TODO should be returned the same entity instance as located in local cache store
  }

  save<E extends Entity>(entity: E): Promise<void>;
  save<E extends Entity>(entities: E[]): Promise<void>;
  async save<E extends Entity>(e: E | E[]): Promise<void> {
    //@ts-ignore
    this._upsert(e, false);
    //@ts-ignore
    await super.save(e);
  }

  insert<E extends Entity>(entity: E): Promise<void>;
  insert<E extends Entity>(entities: E[]): Promise<void>;
  async insert<E extends Entity>(e: E | E[]): Promise<void> {
    // @ts-ignore
    this._upsert(e, false);
    // @ts-ignore
    await super.insert(e);
  }

  remove<E extends Entity>(entity: E): Promise<void>;
  remove<E extends Entity>(entities: E[]): Promise<void>;
  remove<E extends Entity>(
    entityClass: EntityClass<E>,
    id: string | string[]
  ): Promise<void>;
  async remove<E extends Entity>(
    e: E | E[] | EntityClass<E>,
    id?: string | string[]
  ): Promise<void> {
    const singleEnOrClass = Array.isArray(e) ? e[0] : e;
    const enClass =
      'id' in singleEnOrClass
        ? (Object.getPrototypeOf(singleEnOrClass).constructor as EntityClass<E>)
        : (singleEnOrClass as EntityClass<E>);
    //@ts-ignore
    const eId = id ?? singleEnOrClass.id;
    await this._flushByClass(enClass);
    //@ts-ignore
    await super.remove(e, id);
    this.cacheDelete(enClass, eId);
  }

  override count<E extends Entity>(
    entityClass: EntityClass<E>,
    options?: FindManyOptions<E>
  ): Promise<number> {
    return this._processFetch(
      entityClass,
      (): Promise<number> => super.count(entityClass, options)
    );
  }

  override countBy<E extends Entity>(
    entityClass: EntityClass<E>,
    where: FindOptionsWhere<E> | FindOptionsWhere<E>[]
  ): Promise<number> {
    return this._processFetch(
      entityClass,
      (): Promise<number> => super.countBy(entityClass, where)
    );
  }

  override find<E extends Entity>(
    entityClass: EntityClass<E>,
    options?: FindManyOptions<E>
  ): Promise<E[]> {
    return this._processFetch(
      entityClass,
      (): Promise<E[]> => super.find(entityClass, options)
    );
  }

  override findBy<E extends Entity>(
    entityClass: EntityClass<E>,
    where: FindOptionsWhere<E> | FindOptionsWhere<E>[]
  ): Promise<E[]> {
    return this._processFetch(
      entityClass,
      (): Promise<E[]> => super.findBy(entityClass, where)
    );
  }

  override findOne<E extends Entity>(
    entityClass: EntityClass<E>,
    options: FindOneOptions<E>
  ): Promise<E | undefined> {
    return this._processFetch(
      entityClass,
      (): Promise<E | undefined> => super.findOne(entityClass, options)
    );
  }
  override findOneBy<E extends Entity>(
    entityClass: EntityClass<E>,
    where: FindOptionsWhere<E> | FindOptionsWhere<E>[]
  ): Promise<E | undefined> {
    return this._processFetch(
      entityClass,
      (): Promise<E | undefined> => super.findOneBy(entityClass, where)
    );
  }

  override get<E extends Entity>(
    entityClass: EntityClass<E>,
    optionsOrId: FindOneOptions<E> | string
  ): Promise<E | undefined> {
    return this._processFetch(
      entityClass,
      (): Promise<E | undefined> => super.get(entityClass, optionsOrId)
    );
  }

  // findOneOrFail<E extends Entity>(entityTarget: EntityTarget<E>, options: FindOneOptions<E>): Promise<E> {
  //   return this._processFetch(entityTarget, (): Promise<E> => super.findOneOrFail(entityTarget, options));
  //
  // }
  //
  // findOneByOrFail<E extends Entity>(entityClass: EntityTarget<E>, where: FindOptionsWhere<E> | FindOptionsWhere<E>[]): Promise<E> {
  //   return this.em().then(em => em.findOneByOrFail(entityClass, where))
  // }
}
