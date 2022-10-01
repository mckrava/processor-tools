import { EntityTarget } from 'typeorm/common/EntityTarget';
import { ColumnMetadata } from 'typeorm/metadata/ColumnMetadata';
import {
  TypeormDatabaseOptions,
  IsolationLevel,
  FullTypeormDatabase,
  TypeormDatabase
} from '@subsquid/typeorm-store';
import assert from 'assert';
import { assertNotNull } from '@subsquid/util-internal';
import { StoreWithCache } from './store';
import { createTransaction, Tx } from '@subsquid/typeorm-store/src/tx';
import { getSchemaMetadata, SchemeMetadata } from './utils/schemaMetadata';
import { Model } from '@subsquid/openreader/src/model';

export {
  TypeormDatabaseOptions,
  IsolationLevel,
  FullTypeormDatabase
} from '@subsquid/typeorm-store';

export class TypeormDatabaseWithCache extends TypeormDatabase {
  schemaMetadata: SchemeMetadata;
  constructor() {
    super();
    this.schemaMetadata = getSchemaMetadata();
  }

  //@ts-ignore
  protected override async runTransaction(
    from: number,
    to: number,
    cb: (store: StoreWithCache) => Promise<void>
  ): Promise<void> {
    let tx: Promise<Tx> | undefined;
    let open = true;

    let store = new StoreWithCache(() => {
      assert(open, `Transaction was already closed`);
      //@ts-ignore
      tx = tx || this.createTx(from, to); // TODO createTx must be PROTECTED but not PRIVATE
      //@ts-ignore
      return tx.then(tx => tx.em);
    }, this.schemaMetadata);

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

  override async transact(
    from: number,
    to: number,
    cb: (store: StoreWithCache) => Promise<void>
  ): Promise<void> {
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
}
