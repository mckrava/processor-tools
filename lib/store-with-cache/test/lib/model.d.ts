export declare class Item {
    id: string;
    name?: string;
    foo?: string;
    constructor(id?: string, name?: string, foo?: string);
}
export declare class Order {
    id: string;
    item: Item;
    qty: number;
}
export declare class Account {
    constructor(props?: Partial<Account>);
    id: string;
    profileSpace: Space | undefined | null;
    posts: Post[];
    spacesCreated: Space[];
}
export declare class Post {
    constructor(props?: Partial<Post>);
    id: string;
    parentPost: Post | undefined | null;
    createdByAccount: Account;
    space: Space | undefined | null;
}
export declare class Space {
    constructor(props?: Partial<Space>);
    id: string;
    createdByAccount: Account;
    profileSpace: Account | undefined | null;
    posts: Post[];
}
//# sourceMappingURL=model.d.ts.map