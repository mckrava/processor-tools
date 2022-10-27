"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const util_internal_1 = require("@subsquid/util-internal");
const expect_1 = __importDefault(require("expect"));
const typeorm_1 = require("typeorm");
const model_1 = require("./lib/model");
const util_1 = require("./util");
describe('Store Deferred Methods', function () {
    describe('.save()', function () {
        (0, util_1.useDatabase)([`CREATE TABLE item (id text primary key , name text, foo text);`]);
        it('saving of a single entity', async function () {
            let store = (0, util_1.createStore)();
            await store.deferredUpsert(new model_1.Item('1', 'a', 'some')).flush();
            await (0, expect_1.default)((0, util_1.getItems)()).resolves.toEqual([{ id: '1', name: 'a', foo: 'some' }]);
        });
        it('saving of multiple entities', async function () {
            let store = (0, util_1.createStore)();
            await store.deferredUpsert([new model_1.Item('1', 'a'), new model_1.Item('2', 'b')]).flush();
            await (0, expect_1.default)((0, util_1.getItems)()).resolves.toEqual([
                { id: '1', name: 'a', foo: null },
                { id: '2', name: 'b', foo: null }
            ]);
        });
        it('saving a large amount of entities', async function () {
            let store = (0, util_1.createStore)();
            let items = [];
            for (let i = 0; i < 20000; i++) {
                items.push(new model_1.Item('' + i));
            }
            await store.deferredUpsert(items).flush();
            (0, expect_1.default)(await store.count(model_1.Item)).toEqual(items.length);
        });
        it('updates', async function () {
            let store = (0, util_1.createStore)();
            await store.deferredUpsert(new model_1.Item('1', 'a', 'some')).flush();
            await store.deferredUpsert([new model_1.Item('1', 'foo'), new model_1.Item('2', 'b')]).flush();
            // await store.save(new Item('1', 'a'));
            // await store.save([new Item('1', 'foo'), new Item('2', 'b')]);
            await (0, expect_1.default)((0, util_1.getItems)()).resolves.toEqual([
                { id: '1', name: 'foo', foo: 'some' },
                { id: '2', name: 'b', foo: null }
            ]);
        });
    });
    describe('.remove()', function () {
        (0, util_1.useDatabase)([
            `CREATE TABLE item (id text primary key , name text, foo text)`,
            `INSERT INTO item (id, name) values ('1', 'a')`,
            `INSERT INTO item (id, name) values ('2', 'b')`,
            `INSERT INTO item (id, name) values ('3', 'c')`
        ]);
        it('removal by passing an entity', async function () {
            let store = (0, util_1.createStore)();
            const item = new model_1.Item('1');
            store.deferredUpsert(item);
            store.deferredRemove(item);
            await store.flush();
            await (0, expect_1.default)((0, util_1.getItemIds)()).resolves.toEqual(['2', '3']);
        });
        it('removal by passing an array of entities', async function () {
            let store = (0, util_1.createStore)();
            const items = (0, util_1.generateListOfItems)(2);
            await store.deferredUpsert(items).deferredRemove(items).flush();
            await (0, expect_1.default)((0, util_1.getItemIds)()).resolves.toEqual(['3']);
        });
        it('removal by passing an id', async function () {
            let store = (0, util_1.createStore)();
            const item = new model_1.Item('1');
            store.deferredUpsert(item);
            store.deferredRemove(model_1.Item, '1');
            await store.flush();
            await (0, expect_1.default)((0, util_1.getItemIds)()).resolves.toEqual(['2', '3']);
        });
        it('removal by passing an array of ids', async function () {
            let store = (0, util_1.createStore)();
            const items = (0, util_1.generateListOfItems)(2);
            store.deferredUpsert(items);
            store.deferredRemove(model_1.Item, items.map(i => i.id));
            await store.flush();
            await (0, expect_1.default)((0, util_1.getItemIds)()).resolves.toEqual(['3']);
        });
    });
    describe('Update with un-fetched reference', function () {
        (0, util_1.useDatabase)([
            `CREATE TABLE item (id text primary key , name text, foo text)`,
            `CREATE TABLE "order" (id text primary key, item_id text REFERENCES item, qty int4)`,
            `INSERT INTO item (id, name) values ('1', 'a')`,
            `INSERT INTO "order" (id, item_id, qty) values ('1', '1', 3)`,
            `INSERT INTO item (id, name) values ('2', 'b')`,
            `INSERT INTO "order" (id, item_id, qty) values ('2', '2', 3)`
        ]);
        it(".save() doesn't clear reference (single row update)", async function () {
            let store = (0, util_1.createStore)();
            await store.deferredLoad(model_1.Order, '1').load();
            let order = (0, util_internal_1.assertNotNull)(await store.get(model_1.Order, '1', false));
            order.qty = 5;
            await store.deferredUpsert(order).flush();
            let newOrder = await store.findOneOrFail(model_1.Order, {
                where: { id: (0, typeorm_1.Equal)('1') }
            });
            (0, expect_1.default)(newOrder.qty).toEqual(5);
            (0, expect_1.default)(newOrder.item.id).toEqual('1');
        });
        it(".save() doesn't clear reference (multi row update)", async function () {
            let store = (0, util_1.createStore)();
            let orders = await store.find(model_1.Order, { order: { id: 'ASC' } });
            let items = await store.find(model_1.Item, { order: { id: 'ASC' } });
            orders[0].qty = 5;
            orders[1].qty = 1;
            orders[1].item = items[0];
            await store.deferredUpsert(orders).flush();
            let newOrders = await store.find(model_1.Order, {
                order: { id: 'ASC' }
            });
            (0, expect_1.default)(newOrders).toEqual([
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
//# sourceMappingURL=storeDeferredMethods.test.js.map