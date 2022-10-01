"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.TypeormDatabaseWithCache = exports.FullTypeormDatabase = void 0;
const typeorm_store_1 = require("@subsquid/typeorm-store");
const assert_1 = __importDefault(require("assert"));
const store_1 = require("./store");
const schemaMetadata_1 = require("./utils/schemaMetadata");
var typeorm_store_2 = require("@subsquid/typeorm-store");
Object.defineProperty(exports, "FullTypeormDatabase", { enumerable: true, get: function () { return typeorm_store_2.FullTypeormDatabase; } });
class TypeormDatabaseWithCache extends typeorm_store_1.TypeormDatabase {
    constructor() {
        super();
        this.schemaMetadata = (0, schemaMetadata_1.getSchemaMetadata)();
    }
    //@ts-ignore
    async runTransaction(from, to, cb) {
        let tx;
        let open = true;
        let store = new store_1.StoreWithCache(() => {
            (0, assert_1.default)(open, `Transaction was already closed`);
            //@ts-ignore
            tx = tx || this.createTx(from, to); // TODO createTx must be PROTECTED but not PRIVATE
            //@ts-ignore
            return tx.then(tx => tx.em);
        }, this.schemaMetadata);
        try {
            await cb(store);
        }
        catch (e) {
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
    async transact(from, to, cb) {
        let retries = 3;
        while (true) {
            try {
                return await this.runTransaction(from, to, cb);
            }
            catch (e) {
                if (e.code == '40001' && retries) {
                    retries -= 1;
                }
                else {
                    throw e;
                }
            }
        }
    }
}
exports.TypeormDatabaseWithCache = TypeormDatabaseWithCache;
//# sourceMappingURL=database.js.map