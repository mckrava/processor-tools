import { TypeormDatabase } from '@subsquid/typeorm-store';
import { StoreWithCache } from './store';
import { SchemeMetadata } from './utils/schemaMetadata';
export { TypeormDatabaseOptions, IsolationLevel, FullTypeormDatabase } from '@subsquid/typeorm-store';
export declare class TypeormDatabaseWithCache extends TypeormDatabase {
    schemaMetadata: SchemeMetadata;
    constructor();
    protected runTransaction(from: number, to: number, cb: (store: StoreWithCache) => Promise<void>): Promise<void>;
    transact(from: number, to: number, cb: (store: StoreWithCache) => Promise<void>): Promise<void>;
}
//# sourceMappingURL=database.d.ts.map