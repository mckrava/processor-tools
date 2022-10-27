"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.FullTypeormDatabase = exports.TypeormDatabase = void 0;
const dotenv = __importStar(require("dotenv"));
const typeorm_config_1 = require("@subsquid/typeorm-config");
const util_internal_1 = require("@subsquid/util-internal");
const assert_1 = __importDefault(require("assert"));
const typeorm_1 = require("typeorm");
const store_1 = require("./store");
const tx_1 = require("./tx");
const schemaMetadata_1 = require("./utils/schemaMetadata");
dotenv.config();
class BaseDatabase {
    constructor(options) {
        this.lastCommitted = -1;
        this.statusSchema = options?.stateSchema ? `"${options.stateSchema}"` : 'squid_processor';
        this.isolationLevel = 'SERIALIZABLE';
    }
    async connect() {
        if (this.con != null) {
            throw new Error('Already connected');
        }
        let cfg = (0, typeorm_config_1.createOrmConfig)();
        let con = new typeorm_1.DataSource(cfg);
        await con.initialize();
        try {
            let height = await con.transaction('SERIALIZABLE', async (em) => {
                await em.query(`CREATE SCHEMA IF NOT EXISTS ${this.statusSchema}`);
                await em.query(`
                    CREATE TABLE IF NOT EXISTS ${this.statusSchema}.status (
                        id int primary key,
                        height int not null
                    )
                `);
                let status = await em.query(`SELECT height FROM ${this.statusSchema}.status WHERE id = 0`);
                if (status.length == 0) {
                    await em.query(`INSERT INTO ${this.statusSchema}.status (id, height) VALUES (0, -1)`);
                    return -1;
                }
                else {
                    return status[0].height;
                }
            });
            this.con = con;
            return height;
        }
        catch (e) {
            await con.destroy().catch(() => { }); // ignore error
            throw e;
        }
    }
    async close() {
        let con = this.con;
        this.con = undefined;
        this.lastCommitted = -1;
        if (con) {
            await con.destroy();
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
    async runTransaction(from, to, cb) {
        throw new Error('Not implemented');
    }
    async updateHeight(em, from, to) {
        return em
            .query(`UPDATE ${this.statusSchema}.status SET height = $2 WHERE id = 0 AND height < $1`, [from, to])
            .then((result) => {
            let rowsChanged = result[1];
            assert_1.default.strictEqual(rowsChanged, 1, 'status table was updated by foreign process, make sure no other processor is running');
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
class TypeormDatabase extends BaseDatabase {
    constructor(options) {
        super(options);
        this.schemaMetadata = new schemaMetadata_1.SchemaMetadata(process.env.PROJECT_DIR);
        this.cacheStorage = store_1.CacheStorage.getInstance();
    }
    async runTransaction(from, to, cb) {
        let tx;
        let open = true;
        let store = new store_1.Store(() => {
            (0, assert_1.default)(open, `Transaction was already closed`);
            tx = tx || this.createTx(from, to);
            return tx.then(tx => tx.em);
        }, this.cacheStorage, this.schemaMetadata);
        try {
            await cb(store);
            await store.flush();
            store.purge();
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
    async createTx(from, to) {
        let con = (0, util_internal_1.assertNotNull)(this.con, 'not connected');
        let tx = await (0, tx_1.createTransaction)(con, this.isolationLevel);
        try {
            await this.updateHeight(tx.em, from, to);
            return tx;
        }
        catch (e) {
            await tx.rollback().catch(() => { });
            throw e;
        }
    }
    async advance(height) {
        if (this.lastCommitted == height)
            return;
        let tx = await this.createTx(height, height);
        await tx.commit();
    }
}
exports.TypeormDatabase = TypeormDatabase;
/**
 * Provides full TypeORM {@link EntityManager} to data handlers.
 *
 * Prefer using {@link TypeormDatabase} instead of this class when possible.
 *
 * Instances of this class should be considered to be completely opaque.
 */
class FullTypeormDatabase extends BaseDatabase {
    async runTransaction(from, to, cb) {
        let con = (0, util_internal_1.assertNotNull)(this.con, 'not connected');
        await con.transaction(this.isolationLevel, async (em) => {
            await this.updateHeight(em, from, to);
            await cb(em);
        });
        this.lastCommitted = to;
    }
    async advance(height) {
        if (this.lastCommitted == height)
            return;
        return this.runTransaction(height, height, async () => { });
    }
}
exports.FullTypeormDatabase = FullTypeormDatabase;
//# sourceMappingURL=database.js.map