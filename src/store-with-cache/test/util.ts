import * as dotenv from 'dotenv';
import { createOrmConfig } from '@subsquid/typeorm-config';
import { assertNotNull } from '@subsquid/util-internal';
import { Client as PgClient, ClientBase } from 'pg';
import { DataSource, EntityManager } from 'typeorm';
import { CacheStorage, Store } from '../store';
import { Account, Item, Post, Space } from './lib/model';
import { SchemaMetadata } from '../utils/schemaMetadata';

dotenv.config();

export const db_config = {
  host: 'localhost',
  port: parseInt(assertNotNull(process.env.DB_PORT)),
  user: assertNotNull(process.env.DB_USER),
  password: assertNotNull(process.env.DB_PASS),
  database: assertNotNull(process.env.DB_NAME)
};

async function withClient(block: (client: ClientBase) => Promise<void>): Promise<void> {
  let client = new PgClient(db_config);
  await client.connect();
  try {
    await block(client);
  } finally {
    await client.end();
  }
}

export function databaseInit(sql: string[]): Promise<void> {
  return withClient(async client => {
    for (let i = 0; i < sql.length; i++) {
      await client.query(sql[i]);
    }
  });
}

export function databaseDelete(): Promise<void> {
  return withClient(async client => {
    await client.query(`DROP SCHEMA IF EXISTS root CASCADE`);
    await client.query(`CREATE SCHEMA root`);
  });
}

export function useDatabase(sql: string[]): void {
  beforeEach(async () => {
    await databaseDelete();
    await databaseInit(sql);
  });
}

let connection: Promise<DataSource> | undefined;

export function getEntityManager(): Promise<EntityManager> {
  if (connection == null) {
    let cfg = createOrmConfig({ projectDir: __dirname });
    connection = new DataSource(cfg).initialize();
  }
  return connection.then(con => con.createEntityManager());
}

export function createStore(): Store {
  const schemaMetadata = new SchemaMetadata(__dirname);
  const cacheStorage = CacheStorage.getInstance();
  cacheStorage.purgeCacheStorage()
  return new Store(getEntityManager, cacheStorage, schemaMetadata);
}

export async function getItems(): Promise<Item[]> {
  let em = await getEntityManager();
  return em.find(Item);
}

export function getItemIds(): Promise<string[]> {
  return getItems().then(items => items.map(it => it.id).sort());
}

export function generateListOfItems(count: number = 3): Item[] {
  let index = 1;
  const list: Item[] = [];
  while (index <= count) {
    list.push(new Item(index.toString()));
    index++;
  }
  return list;
}

export async function createSaveRelatedEntities(store: Store, withFlush: boolean = true): Promise<void> {
  const account = new Account({ id: '1' });
  const space = new Space({ id: '1', createdByAccount: account });
  account.profileSpace = space;

  const posts = [
    new Post({ id: '1', createdByAccount: account }),
    new Post({ id: '2', createdByAccount: account, space })
  ];
  store.deferredUpsert(posts);

  const comment = new Post({
    id: '2-1',
    createdByAccount: account,
    space,
    parentPost: await store.get(Post, '2', false)
  });
  if (withFlush) await store.deferredUpsert(account).deferredUpsert(space).deferredUpsert(comment).flush();
}
