import expect from 'expect';
import { Account } from '../lib/model';
import { createSaveRelatedEntities, createStore, useDatabase } from '../util';
import sqlQueries from '../lib/queries';

describe('Store Deferred Methods :: Cache Storage Purge', function () {
  describe('purge cache', function () {
    useDatabase(sqlQueries.deferredMethods.cyclicRel);

    it('purge cache', async function () {
      let store = createStore();
      await createSaveRelatedEntities(store);

      store.purge();

      expect([...store.entries]).toEqual([]);
      expect(store.ready).toBeTruthy();
      expect(store.isDirty).toBeFalsy();
      await expect(store.get(Account, '1', false)).resolves.toBeNull();
    });
  });
});
