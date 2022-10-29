import { assertNotNull } from '@subsquid/util-internal';
import expect from 'expect';
import { Equal } from 'typeorm';
import { Item, Order, Account, Post, Space } from '../lib/model';
import {
  createSaveRelatedEntities,
  createStore,
  generateListOfItems,
  getItemIds,
  getItems,
  useDatabase
} from '../util';
import sqlQueries from '../lib/queries';

describe('Store Deferred Methods :: Remove', function () {
  describe('remove cyclic relations', function () {
    useDatabase(sqlQueries.deferredMethods.cyclicRel);

    it('deferredRemove not fetched item by id', async function () {
      let store = createStore();
      await createSaveRelatedEntities(store);

      await expect(store.get(Post, '2-1')).resolves.not.toBeNull();

      store.purge();

      await store.deferredRemove(Post, '2-1').flush();
      await expect(store.get(Post, '2-1')).resolves.toBeNull();
    });
  });
});
