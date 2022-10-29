"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const expect_1 = __importDefault(require("expect"));
const model_1 = require("../lib/model");
const util_1 = require("../util");
const queries_1 = __importDefault(require("../lib/queries"));
describe('Store Deferred Methods :: Remove', function () {
    describe('remove cyclic relations', function () {
        (0, util_1.useDatabase)(queries_1.default.deferredMethods.cyclicRel);
        it('deferredRemove not fetched item by id', async function () {
            let store = (0, util_1.createStore)();
            await (0, util_1.createSaveRelatedEntities)(store);
            await (0, expect_1.default)(store.get(model_1.Post, '2-1')).resolves.not.toBeNull();
            store.purge();
            await store.deferredRemove(model_1.Post, '2-1').flush();
            await (0, expect_1.default)(store.get(model_1.Post, '2-1')).resolves.toBeNull();
        });
    });
});
//# sourceMappingURL=remove.test.js.map