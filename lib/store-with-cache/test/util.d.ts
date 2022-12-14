import { EntityManager } from 'typeorm';
import { Store } from '../store';
import { Item } from './lib/model';
export declare const db_config: {
    host: string;
    port: number;
    user: string;
    password: string;
    database: string;
};
export declare function databaseInit(sql: string[]): Promise<void>;
export declare function databaseDelete(): Promise<void>;
export declare function useDatabase(sql: string[]): void;
export declare function getEntityManager(): Promise<EntityManager>;
export declare function createStore(): Store;
export declare function getItems(): Promise<Item[]>;
export declare function getItemIds(): Promise<string[]>;
export declare function generateListOfItems(count?: number): Item[];
export declare function createSaveRelatedEntities(store: Store, withFlush?: boolean): Promise<void>;
//# sourceMappingURL=util.d.ts.map