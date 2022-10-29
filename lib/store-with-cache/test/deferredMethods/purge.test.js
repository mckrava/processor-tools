"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const expect_1 = __importDefault(require("expect"));
const model_1 = require("../lib/model");
const util_1 = require("../util");
const queries_1 = __importDefault(require("../lib/queries"));
describe('Store Deferred Methods :: Cache Storage Purge', function () {
    describe('purge cache', function () {
        (0, util_1.useDatabase)(queries_1.default.deferredMethods.cyclicRel);
        it('purge cache', async function () {
            let store = (0, util_1.createStore)();
            await (0, util_1.createSaveRelatedEntities)(store);
            store.purge();
            (0, expect_1.default)([...store.entries]).toEqual([]);
            (0, expect_1.default)(store.ready).toBeTruthy();
            (0, expect_1.default)(store.isDirty).toBeFalsy();
            await (0, expect_1.default)(store.get(model_1.Account, '1', false)).resolves.toBeNull();
        });
    });
});
//# sourceMappingURL=purge.test.js.map