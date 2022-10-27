import { assertNotNull } from '@subsquid/util-internal';
import expect from 'expect';
import { Equal } from 'typeorm';
import { Item, Order } from './lib/model';
import { createStore, generateListOfItems, getItemIds, getItems, useDatabase } from './util';

describe('Store Deferred Methods', function () {
  describe('.save()', function () {
    useDatabase([`CREATE TABLE item (id text primary key , name text, foo text);`]);

    it('saving of a single entity', async function () {
      let store = createStore();
      await store.deferredUpsert(new Item('1', 'a', 'some')).flush();

      await expect(getItems()).resolves.toEqual([{ id: '1', name: 'a', foo: 'some' }]);
    });

    it('saving of multiple entities', async function () {
      let store = createStore();
      await store.deferredUpsert([new Item('1', 'a'), new Item('2', 'b')]).flush();
      await expect(getItems()).resolves.toEqual([
        { id: '1', name: 'a', foo: null },
        { id: '2', name: 'b', foo: null }
      ]);
    });

    it('saving a large amount of entities', async function () {
      let store = createStore();
      let items: Item[] = [];
      for (let i = 0; i < 20000; i++) {
        items.push(new Item('' + i));
      }
      await store.deferredUpsert(items).flush();
      expect(await store.count(Item)).toEqual(items.length);
    });

    it('updates', async function () {
      let store = createStore();
      await store.deferredUpsert(new Item('1', 'a', 'some')).flush();
      await store.deferredUpsert([new Item('1', 'foo'), new Item('2', 'b')]).flush();

      await expect(getItems()).resolves.toEqual([
        { id: '1', name: 'foo', foo: 'some' },
        { id: '2', name: 'b', foo: null }
      ]);
    });
  });

  describe('.remove()', function () {
    useDatabase([
      `CREATE TABLE item (id text primary key , name text, foo text)`,
      `INSERT INTO item (id, name) values ('1', 'a')`,
      `INSERT INTO item (id, name) values ('2', 'b')`,
      `INSERT INTO item (id, name) values ('3', 'c')`
    ]);

    it('removal by passing an entity', async function () {
      let store = createStore();
      const item = new Item('1');
      store.deferredUpsert(item);
      store.deferredRemove(item);
      await store.flush();
      await expect(getItemIds()).resolves.toEqual(['2', '3']);
    });

    it('removal by passing an array of entities', async function () {
      let store = createStore();
      const items = generateListOfItems(2);
      await store.deferredUpsert(items).deferredRemove(items).flush();
      await expect(getItemIds()).resolves.toEqual(['3']);
    });

    it('removal by passing an id', async function () {
      let store = createStore();
      const item = new Item('1');
      store.deferredUpsert(item);
      store.deferredRemove(Item, '1');
      await store.flush();
      await expect(getItemIds()).resolves.toEqual(['2', '3']);
    });

    it('removal by passing an array of ids', async function () {
      let store = createStore();
      const items = generateListOfItems(2);
      store.deferredUpsert(items);
      store.deferredRemove(
        Item,
        items.map(i => i.id)
      );
      await store.flush();
      await expect(getItemIds()).resolves.toEqual(['3']);
    });
  });

  describe('Update with un-fetched reference', function () {
    useDatabase([
      `CREATE TABLE item (id text primary key , name text, foo text)`,
      `CREATE TABLE "order" (id text primary key, item_id text REFERENCES item, qty int4)`,
      `INSERT INTO item (id, name) values ('1', 'a')`,
      `INSERT INTO "order" (id, item_id, qty) values ('1', '1', 3)`,
      `INSERT INTO item (id, name) values ('2', 'b')`,
      `INSERT INTO "order" (id, item_id, qty) values ('2', '2', 3)`
    ]);

    it(".save() doesn't clear reference (single row update)", async function () {
      let store = createStore();
      await store.deferredLoad(Order, '1').load();
      let order = assertNotNull(await store.get(Order, '1', false));
      order.qty = 5;
      await store.deferredUpsert(order).flush();
      let newOrder = await store.findOneOrFail(Order, {
        where: { id: Equal('1') }
      });
      expect(newOrder.qty).toEqual(5);
      expect(newOrder.item.id).toEqual('1');
    });

    it(".save() doesn't clear reference (multi row update)", async function () {
      let store = createStore();
      let orders = await store.find(Order, { order: { id: 'ASC' } });
      let items = await store.find(Item, { order: { id: 'ASC' } });

      orders[0].qty = 5;
      orders[1].qty = 1;
      orders[1].item = items[0];
      await store.deferredUpsert(orders).flush();

      let newOrders = await store.find(Order, {
        order: { id: 'ASC' }
      });

      expect(newOrders).toEqual([
        {
          id: '1',
          item: {
            id: '1'
          },
          qty: 5
        },
        {
          id: '2',
          item: {
            id: '1'
          },
          qty: 1
        }
      ]);
    });
  });
  
});
