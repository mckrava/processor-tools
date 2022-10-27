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
Object.defineProperty(exports, "__esModule", { value: true });
exports.generateListOfItems = exports.getItemIds = exports.getItems = exports.createStore = exports.getEntityManager = exports.useDatabase = exports.databaseDelete = exports.databaseInit = exports.db_config = void 0;
const dotenv = __importStar(require("dotenv"));
const typeorm_config_1 = require("@subsquid/typeorm-config");
const util_internal_1 = require("@subsquid/util-internal");
const pg_1 = require("pg");
const typeorm_1 = require("typeorm");
const store_1 = require("../store");
const model_1 = require("./lib/model");
const schemaMetadata_1 = require("../utils/schemaMetadata");
dotenv.config();
exports.db_config = {
    host: 'localhost',
    port: parseInt((0, util_internal_1.assertNotNull)(process.env.DB_PORT)),
    user: (0, util_internal_1.assertNotNull)(process.env.DB_USER),
    password: (0, util_internal_1.assertNotNull)(process.env.DB_PASS),
    database: (0, util_internal_1.assertNotNull)(process.env.DB_NAME)
};
async function withClient(block) {
    let client = new pg_1.Client(exports.db_config);
    await client.connect();
    try {
        await block(client);
    }
    finally {
        await client.end();
    }
}
function databaseInit(sql) {
    return withClient(async (client) => {
        for (let i = 0; i < sql.length; i++) {
            await client.query(sql[i]);
        }
    });
}
exports.databaseInit = databaseInit;
function databaseDelete() {
    return withClient(async (client) => {
        await client.query(`DROP SCHEMA IF EXISTS root CASCADE`);
        await client.query(`CREATE SCHEMA root`);
    });
}
exports.databaseDelete = databaseDelete;
function useDatabase(sql) {
    beforeEach(async () => {
        await databaseDelete();
        await databaseInit(sql);
    });
}
exports.useDatabase = useDatabase;
let connection;
function getEntityManager() {
    if (connection == null) {
        let cfg = (0, typeorm_config_1.createOrmConfig)({ projectDir: __dirname });
        connection = new typeorm_1.DataSource(cfg).initialize();
    }
    return connection.then(con => con.createEntityManager());
}
exports.getEntityManager = getEntityManager;
function createStore() {
    const schemaMetadata = new schemaMetadata_1.SchemaMetadata(__dirname);
    const cacheStorage = store_1.CacheStorage.getInstance();
    return new store_1.Store(getEntityManager, cacheStorage, schemaMetadata);
}
exports.createStore = createStore;
async function getItems() {
    let em = await getEntityManager();
    return em.find(model_1.Item);
}
exports.getItems = getItems;
function getItemIds() {
    return getItems().then(items => items.map(it => it.id).sort());
}
exports.getItemIds = getItemIds;
function generateListOfItems(count = 3) {
    let index = 1;
    const list = [];
    while (index <= count) {
        list.push(new model_1.Item(index.toString()));
        index++;
    }
    return list;
}
exports.generateListOfItems = generateListOfItems;
//# sourceMappingURL=util.js.map