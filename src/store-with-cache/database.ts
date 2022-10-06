import { createOrmConfig } from '@subsquid/typeorm-config';
import { assertNotNull } from '@subsquid/util-internal';
import assert from 'assert';
import { DataSource, EntityManager } from 'typeorm';
import { StoreWithCache, CacheStorage } from './store';
import { createTransaction, Tx } from './tx';
import { SchemaMetadata } from './utils/schemaMetadata';

export type IsolationLevel = 'SERIALIZABLE' | 'READ COMMITTED' | 'REPEATABLE READ';

export interface TypeormDatabaseOptions {
  stateSchema?: string;
  isolationLevel?: IsolationLevel;
}

class BaseDatabase<S> {
  protected statusSchema: string;
  protected isolationLevel: IsolationLevel;
  protected con?: DataSource;
  protected lastCommitted = -1;

  constructor(options?: TypeormDatabaseOptions) {
    this.statusSchema = options?.stateSchema ? `"${options.stateSchema}"` : 'squid_processor';
    this.isolationLevel = options?.isolationLevel || 'SERIALIZABLE';
  }

  async connect(): Promise<number> {
    if (this.con != null) {
      throw new Error('Already connected');
    }
    let cfg = createOrmConfig();
    let con = new DataSource(cfg);
    await con.initialize();
    try {
      let height = await con.transaction('SERIALIZABLE', async em => {
        await em.query(`CREATE SCHEMA IF NOT EXISTS ${this.statusSchema}`);
        await em.query(`
                    CREATE TABLE IF NOT EXISTS ${this.statusSchema}.status (
                        id int primary key,
                        height int not null
                    )
                `);
        let status: { height: number }[] = await em.query(
          `SELECT height FROM ${this.statusSchema}.status WHERE id = 0`
        );
        if (status.length == 0) {
          await em.query(`INSERT INTO ${this.statusSchema}.status (id, height) VALUES (0, -1)`);
          return -1;
        } else {
          return status[0].height;
        }
      });
      this.con = con;
      return height;
    } catch (e: any) {
      await con.destroy().catch(() => {}); // ignore error
      throw e;
    }
  }

  async close(): Promise<void> {
    let con = this.con;
    this.con = undefined;
    this.lastCommitted = -1;
    if (con) {
      await con.destroy();
    }
  }

  async transact(from: number, to: number, cb: (store: S) => Promise<void>): Promise<void> {
    let retries = 3;
    while (true) {
      try {
        return await this.runTransaction(from, to, cb);
      } catch (e: any) {
        if (e.code == '40001' && retries) {
          retries -= 1;
        } else {
          throw e;
        }
      }
    }
  }

  protected async runTransaction(from: number, to: number, cb: (store: S) => Promise<void>): Promise<void> {
    throw new Error('Not implemented');
  }

  protected async updateHeight(em: EntityManager, from: number, to: number): Promise<void> {
    return em
      .query(`UPDATE ${this.statusSchema}.status SET height = $2 WHERE id = 0 AND height < $1`, [from, to])
      .then((result: [data: any[], rowsChanged: number]) => {
        let rowsChanged = result[1];
        assert.strictEqual(
          rowsChanged,
          1,
          'status table was updated by foreign process, make sure no other processor is running'
        );
      });
  }
}

/**
 * Provides restrictive and lazy version of TypeORM EntityManager
 * to data handlers.
 *
 * Lazy here means that no database transaction is opened until an
 * actual database operation is requested by some data handler,
 * which allows more efficient data filtering within handlers.
 *
 * `TypeormDatabase` supports only primitive DML operations
 * without cascades, relations and other ORM goodies in return
 * for performance and exciting new features yet to be implemented :).
 *
 * Instances of this class should be considered to be completely opaque.
 */
export class TypeormDatabaseWithCache extends BaseDatabase<StoreWithCache> {
  schemaMetadata: SchemaMetadata;
  cacheStorage: CacheStorage;

  constructor() {
    super();
    this.schemaMetadata = new SchemaMetadata();
    this.cacheStorage = CacheStorage.getInstance();
  }
  protected async runTransaction(
    from: number,
    to: number,
    cb: (store: StoreWithCache) => Promise<void>
  ): Promise<void> {
    let tx: Promise<Tx> | undefined;
    let open = true;

    let store = new StoreWithCache(
      () => {
        assert(open, `Transaction was already closed`);
        tx = tx || this.createTx(from, to);
        return tx.then(tx => tx.em);
      },
      this.cacheStorage,
      this.schemaMetadata
    );
    try {
      await cb(store);
    } catch (e: any) {
      open = false;
      if (tx) {
        await tx.then(t => t.rollback()).catch(err => null);
      }
      throw e;
    }

    open = false;
    if (tx) {
      await tx.then(t => t.commit());
      this.lastCommitted = to;
    }
  }

  private async createTx(from: number, to: number): Promise<Tx> {
    let con = assertNotNull(this.con, 'not connected');
    let tx = await createTransaction(con, this.isolationLevel);
    try {
      await this.updateHeight(tx.em, from, to);
      return tx;
    } catch (e: any) {
      await tx.rollback().catch(() => {});
      throw e;
    }
  }

  async advance(height: number): Promise<void> {
    if (this.lastCommitted == height) return;
    let tx = await this.createTx(height, height);
    await tx.commit();
  }
}

/**
 * Provides full TypeORM {@link EntityManager} to data handlers.
 *
 * Prefer using {@link TypeormDatabase} instead of this class when possible.
 *
 * Instances of this class should be considered to be completely opaque.
 */
export class FullTypeormDatabase extends BaseDatabase<EntityManager> {
  protected async runTransaction(from: number, to: number, cb: (store: EntityManager) => Promise<void>): Promise<void> {
    let con = assertNotNull(this.con, 'not connected');
    await con.transaction(this.isolationLevel, async em => {
      await this.updateHeight(em, from, to);
      await cb(em);
    });
    this.lastCommitted = to;
  }

  async advance(height: number): Promise<void> {
    if (this.lastCommitted == height) return;
    return this.runTransaction(height, height, async () => {});
  }
}

// import { EntityTarget } from 'typeorm/common/EntityTarget';
// import { ColumnMetadata } from 'typeorm/metadata/ColumnMetadata';
// import {
//   TypeormDatabaseOptions,
//   IsolationLevel,
//   FullTypeormDatabase,
//   TypeormDatabase
// } from '@subsquid/typeorm-store';
// import assert from 'assert';
// import { assertNotNull } from '@subsquid/util-internal';
// import { StoreWithCache } from './store';
// import { createTransaction, Tx } from '@subsquid/typeorm-store/src/tx';
// import { getSchemaMetadata, SchemeMetadata } from './utils/schemaMetadata';
// import { Model } from '@subsquid/openreader/src/model';
//
// export {
//   TypeormDatabaseOptions,
//   IsolationLevel,
//   FullTypeormDatabase
// } from '@subsquid/typeorm-store';
//
// export class TypeormDatabaseWithCache extends TypeormDatabase {
//   schemaMetadata: SchemeMetadata;
//   constructor() {
//     super();
//     this.schemaMetadata = getSchemaMetadata();
//   }
//
//   //@ts-ignore
//   protected override async runTransaction(
//     from: number,
//     to: number,
//     cb: (store: StoreWithCache) => Promise<void>
//   ): Promise<void> {
//     let tx: Promise<Tx> | undefined;
//     let open = true;
//
//     let store = new StoreWithCache(() => {
//       assert(open, `Transaction was already closed`);
//       //@ts-ignore
//       tx = tx || this.createTx(from, to); // TODO createTx must be PROTECTED but not PRIVATE
//       //@ts-ignore
//       return tx.then(tx => tx.em);
//     }, this.schemaMetadata);
//
//     try {
//       await cb(store);
//     } catch (e: any) {
//       open = false;
//       if (tx) {
//         await tx.then(t => t.rollback()).catch(err => null);
//       }
//       throw e;
//     }
//
//     open = false;
//     if (tx) {
//       await tx.then(t => t.commit());
//       this.lastCommitted = to;
//     }
//   }
//
//   override async transact(
//     from: number,
//     to: number,
//     cb: (store: StoreWithCache) => Promise<void>
//   ): Promise<void> {
//     let retries = 3;
//     while (true) {
//       try {
//         return await this.runTransaction(from, to, cb);
//       } catch (e: any) {
//         if (e.code == '40001' && retries) {
//           retries -= 1;
//         } else {
//           throw e;
//         }
//       }
//     }
//   }
// }
