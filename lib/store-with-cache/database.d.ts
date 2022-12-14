import { DataSource, EntityManager } from 'typeorm';
import { Store, CacheStorage } from './store';
import { SchemaMetadata } from './utils/schemaMetadata';
export declare type IsolationLevel = 'SERIALIZABLE' | 'READ COMMITTED' | 'REPEATABLE READ';
export interface TypeormDatabaseOptions {
    stateSchema?: string;
    isolationLevel?: IsolationLevel;
    disableAutoFlush?: boolean;
    disableAutoTxCommit?: boolean;
    disableAutoHeightUpdate?: boolean;
    saveBatchSize?: number;
}
declare class BaseDatabase<S> {
    protected statusSchema: string;
    protected isolationLevel: IsolationLevel;
    protected con?: DataSource;
    protected lastCommitted: number;
    constructor(options?: TypeormDatabaseOptions);
    connect(): Promise<number>;
    close(): Promise<void>;
    transact(from: number, to: number, cb: (store: S) => Promise<void>): Promise<void>;
    protected runTransaction(from: number, to: number, cb: (store: S) => Promise<void>): Promise<void>;
    protected updateHeight(em: EntityManager, from: number, to: number): Promise<void>;
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
export declare class TypeormDatabase extends BaseDatabase<Store> {
    schemaMetadata: SchemaMetadata;
    cacheStorage: CacheStorage;
    disableAutoFlush: boolean;
    disableAutoTxCommit: boolean;
    disableAutoHeightUpdate: boolean;
    saveBatchSize: number;
    constructor(options?: TypeormDatabaseOptions);
    protected runTransaction(from: number, to: number, cb: (store: Store) => Promise<void>): Promise<void>;
    private createTx;
    advance(height: number): Promise<void>;
}
/**
 * Provides full TypeORM {@link EntityManager} to data handlers.
 *
 * Prefer using {@link TypeormDatabase} instead of this class when possible.
 *
 * Instances of this class should be considered to be completely opaque.
 */
export declare class FullTypeormDatabase extends BaseDatabase<EntityManager> {
    protected runTransaction(from: number, to: number, cb: (store: EntityManager) => Promise<void>): Promise<void>;
    advance(height: number): Promise<void>;
}
export {};
//# sourceMappingURL=database.d.ts.map