import { EntityClass, Store, Entity, FindManyOptions, FindOneOptions, TypeormDatabaseOptions } from '@subsquid/typeorm-store';

import { EntityManager, FindOptionsOrder, FindOptionsRelations, FindOptionsWhere, In } from 'typeorm';
import { EntityTarget } from 'typeorm/common/EntityTarget';
import { ColumnMetadata } from 'typeorm/metadata/ColumnMetadata';
import assert from 'assert';
import { BatchContext } from '@subsquid/substrate-processor';

export { EntityClass, Entity, FindManyOptions, FindOneOptions, TypeormDatabase, FullTypeormDatabase, IsolationLevel } from '@subsquid/typeorm-store';

export type EntityClassConstructable = EntityClass<Entity>;

export type CacheEntityParams = EntityClassConstructable | [EntityClassConstructable, Record<keyof EntityClassConstructable, EntityClassConstructable>]; // Inherited from FindOneOptions['loadRelationIds']['relations']

export type CachedModel<T> = {
  [P in keyof T]: Exclude<T[P], null | undefined> extends Entity ? (null | undefined extends T[P] ? Entity | null | undefined : Entity) : T[P];
} & Entity;

export class StoreWithCache extends Store {
  private entityRelationsParams = new Map<EntityClassConstructable, Record<string, EntityClassConstructable> | null>();
  private cacheClassesMap = new Map<string, EntityClassConstructable>();
  private entities = new Map<EntityClassConstructable, Map<string, CachedModel<EntityClassConstructable>>>();
  private entitiesForFlush = new Map<EntityClassConstructable, Set<string>>();

  private deferredGetList = new Map<EntityClassConstructable, Set<string>>();
  private deferredFindWhereList = new Map<EntityClassConstructable, FindOptionsWhere<EntityClassConstructable>[]>();
  private deferredRemoveList = new Map<EntityClassConstructable, Set<string>>();

  constructor(private _em: () => Promise<EntityManager>) {
    super(_em);
  }

  cacheInit(entityRelationsParams: CacheEntityParams[]): void {
    for (const paramsItem of entityRelationsParams) {
      let entityClass = paramsItem as EntityClassConstructable;
      let relations = null;

      if (Array.isArray(paramsItem)) {
        entityClass = paramsItem[0];
        relations = paramsItem[1];
      }

      this.entityRelationsParams.set(entityClass, relations);
      this.cacheClassesMap.set(entityClass.name, entityClass);
      this.entities.set(entityClass, new Map<string, CachedModel<EntityClassConstructable>>());
      this.entitiesForFlush.set(entityClass, new Set<string>());
    }
  }

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
  deferredLoad<T extends Entity>(entityConstructor: EntityClass<T>, findOptions?: FindOptionsWhere<T> | FindOptionsWhere<T>[]): StoreWithCache;

  deferredLoad<T extends Entity>(entityConstructor: EntityClass<T>, opt?: string | string[] | FindOptionsWhere<T> | FindOptionsWhere<T>[]): StoreWithCache {
    if (!opt) {
      this.deferredGetList.set(entityConstructor, new Set<string>().add('*'));
      return this;
    } else if (typeof opt === 'string' || Array.isArray(opt)) {
      const idsList = this.deferredGetList.get(entityConstructor) || new Set();

      for (const idItem of Array.isArray(opt) ? opt : [opt]) {
        idsList.add(idItem as string);
      }
      this.deferredGetList.set(entityConstructor, idsList);
    } else {
      const whereOptions = Array.isArray(opt) ? opt : [opt];
      this.deferredFindWhereList.set(entityConstructor, [...(this.deferredFindWhereList.get(entityConstructor) || []), ...whereOptions]);
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
    if (isIntersection) this.entities.set(entityConstructor, cachedEntities);
    return this;
  }

  /**
   * Check by ID if entity is existing in cache
   */
  cacheHas<T extends Entity>(entityConstructor: EntityClass<T>, id: string): boolean {
    return (this.entities.get(entityConstructor) || new Map()).has(id);
  }

  /**
   * Get entity by id form cache
   */
  cacheGet<T extends Entity>(entityConstructor: EntityClass<T>, id: string): T | null {
    return (this.entities.get(entityConstructor) || new Map()).get(id) || null;
  }

  /**
   * Get all entities of specific class.
   * Returns a new iterator object that contains the values for
   * each element in the Map object in insertion order.
   */
  cacheValues<T extends Entity>(entityConstructor: EntityClass<T>): IterableIterator<T> | [] {
    return (this.entities.get(entityConstructor) || new Map()).values() || null;
  }

  /**
   * Returns full cache data
   */
  cacheEntries(): Map<EntityClassConstructable, Map<string, CachedModel<EntityClassConstructable>>> {
    return this.entities;
  }

  /**
   * Delete entity item from cache storage of the specific class
   */
  cacheDelete<T extends Entity>(entityConstructor: EntityClass<T>, id: string): void {
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

  private _upsert<T extends CachedModel<T>>(entityOrList: T | T[], setForFlush: boolean): void {
    if (Array.isArray(entityOrList) && entityOrList.length === 0) return;

    const entityClassConstructor = (Array.isArray(entityOrList) ? entityOrList[0] : entityOrList).constructor as EntityClass<T>;
    const existingEntities = this.entities.get(entityClassConstructor) || new Map<string, CachedModel<T>>();
    const existingEntitiesForFlush = this.entitiesForFlush.get(entityClassConstructor) || new Set<string>();

    for (let entity of Array.isArray(entityOrList) ? entityOrList : [entityOrList]) {
      let entityDecorated = entity;
      for (const entityFieldName in entity) {
        let fieldValue = entity[entityFieldName];

        if (typeof fieldValue === 'object' && fieldValue !== null && !Array.isArray(fieldValue)) {
          const fieldValueDecorated = fieldValue as unknown as Entity;
          if (!this.cacheClassesMap.has(fieldValueDecorated.constructor.name)) continue;

          const relationsClass = this.cacheClassesMap.get(fieldValueDecorated.constructor.name);
          assert(relationsClass);
          this._upsert(fieldValue as EntityClassConstructable[keyof EntityClassConstructable], false);
          entityDecorated[entityFieldName as keyof T] = {
            id: fieldValueDecorated.id
          } as unknown as T[keyof T];
        }
      }

      existingEntities.set(entityDecorated.id, entityDecorated);
      if (setForFlush) existingEntitiesForFlush.add(entity.id);
    }

    this.entities.set(entityClassConstructor, existingEntities);
    if (setForFlush) this.entitiesForFlush.set(entityClassConstructor, existingEntitiesForFlush);
  }

  /**
   * Set/update item in cache by id.
   * All items which are upserted by this method will be saved into DB during further execution of ".flush" method
   */
  cacheUpsert<T extends CachedModel<T>>(entities: T[]): void;
  cacheUpsert<T extends CachedModel<T>>(entity: T): void;
  cacheUpsert<T extends CachedModel<T>>(entityOrList: T | T[]): void {
    this._upsert(entityOrList, true);
  }

  /**
   * Load all deferred get from the db, clear deferredLoad and deferredFindWhereList items list,
   * set loaded items to cache storage.
   */
  async load(): Promise<void> {
    for (const [entityClass, findOptionsList] of this.deferredFindWhereList.entries()) {
      const entityRelationsOptions = this.entityRelationsParams.get(entityClass);

      const entitiesList = await super.find(entityClass, {
        where: findOptionsList,
        ...(!!entityRelationsOptions && {
          loadRelationIds: {
            relations: Object.keys(entityRelationsOptions || {}) || [],
            disableMixedMap: true
          }
        })
      });
      this._upsert(entitiesList, false);
    }

    for (const [entityClass, idsSet] of this.deferredGetList.entries()) {
      const entityRelationsOptions = this.entityRelationsParams.get(entityClass);

      /**
       * Fetch all available entities of iterated class.
       */
      if (idsSet.has('*')) {
        const entitiesList: CachedModel<typeof entityClass>[] = await super.find(entityClass, {
          where: {},
          ...(!!entityRelationsOptions && {
            loadRelationIds: {
              relations: Object.keys(entityRelationsOptions || {}) || [],
              disableMixedMap: true
            }
          })
        });

        this._upsert(entitiesList, false);
        continue;
      }

      /**
       * Filter items by "id" which are already fetched accordingly "deferredFindWhereList".
       * As result avoid duplicated fetch.
       */
      const filteredIds = [...idsSet.values()].filter(id => !(this.entities.get(entityClass) || new Set<string>()).has(id));

      if (!filteredIds || filteredIds.length === 0) continue;

      const entitiesList: CachedModel<typeof entityClass>[] = await super.find(entityClass, {
        where: { id: In(filteredIds) },
        ...(!!entityRelationsOptions && {
          loadRelationIds: {
            relations: Object.keys(entityRelationsOptions || {}) || [],
            disableMixedMap: true
          }
        })
      });

      this._upsert(entitiesList, false);
    }

    /**
     * Separate list of relations from all deferredLoad items for further load
     */
    const relationsEntitiesIdsMap = new Map<EntityClassConstructable, Set<string>>();

    /**
     * Collect entity relations IDs.
     */
    for (const [entityClass, entitiesMap] of this.entities.entries()) {
      const entityRelationsOptions = this.entityRelationsParams.get(entityClass);

      if (entitiesMap.size === 0 || !entityRelationsOptions) continue;

      for (const entityItem of entitiesMap.values()) {
        for (const relationName in entityRelationsOptions) {
          const relationEntityClass = this.cacheClassesMap.get(Object.getPrototypeOf(entityItem).constructor.name);
          if (!relationEntityClass) continue;

          /**
           * Relations entity value is loaded from DB in view {id: string} | null
           */
          const relationEntityId = entityItem[relationName as keyof CachedModel<EntityClassConstructable>] as unknown as { id: string } | null;

          if (!relationEntityId) continue;
          /**
           * If entity is already loaded, we need avoid extra fetch.
           */
          if ((this.entities.get(relationEntityClass) || new Map()).has(relationEntityId.id)) continue;

          relationsEntitiesIdsMap.set(relationEntityClass, (relationsEntitiesIdsMap.get(relationEntityClass) || new Set()).add(relationEntityId.id));
        }
      }
    }

    if (relationsEntitiesIdsMap.size > 0) {
      /**
       * Fetch relations in this load flow is ignored and only one level of relations are supported.
       */
      for (const [entityClass, idsSet] of relationsEntitiesIdsMap.entries()) {
        const entitiesList: CachedModel<typeof entityClass>[] = await super.find(entityClass, {
          where: { id: In([...idsSet.values()]) }
        });

        this._upsert(entitiesList, false);
      }
    }

    this.deferredGetList.clear();
    this.deferredFindWhereList.clear();
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
    for (const entityClass of this.entities.keys()) {
      await this._flushByClass(entityClass);
    }
  }

  private async _flushByClass<T extends Entity>(entityConstructor: EntityClass<T>): Promise<void> {
    if (this.entitiesForFlush.has(entityConstructor)) {
      const forFlush = this.entitiesForFlush.get(entityConstructor) || new Set<string>();

      const listForSave = [...(this.entities.get(entityConstructor) || new Map<string, CachedModel<T>>()).values()].filter(entity => forFlush.has(entity.id));

      await super.save(listForSave);
      this.entitiesForFlush.set(entityConstructor, new Set<string>());
    }

    if (!this.deferredRemoveList.has(entityConstructor)) return;
    await super.remove(entityConstructor, [...(this.deferredRemoveList.get(entityConstructor) || new Set<string>()).values()]);
    this.deferredRemoveList.set(entityConstructor, new Set<string>());
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
    return this.deferredGetList.size > 0 || this.deferredFindWhereList.size > 0;
  }

  private _processFetch<E extends Entity>(entityClass: EntityClass<E>, fetchCb: () => Promise<number>): Promise<number>;
  private _processFetch<E extends Entity>(entityClass: EntityClass<E>, fetchCb: () => Promise<E[]>): Promise<E[]>;
  private _processFetch<E extends Entity>(entityClass: EntityClass<E>, fetchCb: () => Promise<E | undefined>): Promise<E | undefined>;
  private async _processFetch<E extends Entity>(entityClass: EntityClass<E>, fetchCb: () => Promise<E[] | E | undefined | number>) {
    await this._flushByClass(entityClass);
    const response = await fetchCb();
    //@ts-ignore
    if (typeof response !== 'undefined' && typeof response !== 'number') this._upsert(response, false);
    return response; // TODO should be returned the same entity instance as located in local cache store
  }

  override count<E extends Entity>(entityClass: EntityClass<E>, options?: FindManyOptions<E>): Promise<number> {
    return this._processFetch(entityClass, (): Promise<number> => super.count(entityClass, options));
  }

  override countBy<E extends Entity>(entityClass: EntityClass<E>, where: FindOptionsWhere<E> | FindOptionsWhere<E>[]): Promise<number> {
    return this._processFetch(entityClass, (): Promise<number> => super.countBy(entityClass, where));
  }

  override find<E extends Entity>(entityClass: EntityClass<E>, options?: FindManyOptions<E>): Promise<E[]> {
    return this._processFetch(entityClass, (): Promise<E[]> => super.find(entityClass, options));
  }

  override findBy<E extends Entity>(entityClass: EntityClass<E>, where: FindOptionsWhere<E> | FindOptionsWhere<E>[]): Promise<E[]> {
    return this._processFetch(entityClass, (): Promise<E[]> => super.findBy(entityClass, where));
  }

  override findOne<E extends Entity>(entityClass: EntityClass<E>, options: FindOneOptions<E>): Promise<E | undefined> {
    return this._processFetch(entityClass, (): Promise<E | undefined> => super.findOne(entityClass, options));
  }
  override findOneBy<E extends Entity>(entityClass: EntityClass<E>, where: FindOptionsWhere<E> | FindOptionsWhere<E>[]): Promise<E | undefined> {
    return this._processFetch(entityClass, (): Promise<E | undefined> => super.findOneBy(entityClass, where));
  }

  override get<E extends Entity>(entityClass: EntityClass<E>, optionsOrId: FindOneOptions<E> | string): Promise<E | undefined> {
    return this._processFetch(entityClass, (): Promise<E | undefined> => super.get(entityClass, optionsOrId));
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
