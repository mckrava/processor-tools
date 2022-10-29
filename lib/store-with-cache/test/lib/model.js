"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var Post_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.Space = exports.Post = exports.Account = exports.Order = exports.Item = void 0;
const typeorm_1 = require("typeorm");
const typeorm_2 = require("typeorm");
let Item = class Item {
    constructor(id, name, foo) {
        if (id != null) {
            this.id = id;
            this.name = name;
            this.foo = foo;
        }
    }
};
__decorate([
    (0, typeorm_1.PrimaryColumn)(),
    __metadata("design:type", String)
], Item.prototype, "id", void 0);
__decorate([
    (0, typeorm_1.Column)(),
    __metadata("design:type", String)
], Item.prototype, "name", void 0);
__decorate([
    (0, typeorm_1.Column)(),
    __metadata("design:type", String)
], Item.prototype, "foo", void 0);
Item = __decorate([
    (0, typeorm_1.Entity)(),
    __metadata("design:paramtypes", [String, String, String])
], Item);
exports.Item = Item;
let Order = class Order {
};
__decorate([
    (0, typeorm_1.PrimaryColumn)(),
    __metadata("design:type", String)
], Order.prototype, "id", void 0);
__decorate([
    (0, typeorm_1.ManyToOne)(() => Item, { nullable: true }),
    __metadata("design:type", Item)
], Order.prototype, "item", void 0);
__decorate([
    (0, typeorm_1.Column)({ nullable: false }),
    __metadata("design:type", Number)
], Order.prototype, "qty", void 0);
Order = __decorate([
    (0, typeorm_1.Entity)()
], Order);
exports.Order = Order;
let Account = class Account {
    constructor(props) {
        Object.assign(this, props);
    }
};
__decorate([
    (0, typeorm_1.PrimaryColumn)(),
    __metadata("design:type", String)
], Account.prototype, "id", void 0);
__decorate([
    (0, typeorm_1.ManyToOne)(() => Space, { nullable: true }),
    __metadata("design:type", Object)
], Account.prototype, "profileSpace", void 0);
__decorate([
    (0, typeorm_2.OneToMany)(() => Post, e => e.createdByAccount),
    __metadata("design:type", Array)
], Account.prototype, "posts", void 0);
__decorate([
    (0, typeorm_2.OneToMany)(() => Space, e => e.createdByAccount),
    __metadata("design:type", Array)
], Account.prototype, "spacesCreated", void 0);
Account = __decorate([
    (0, typeorm_2.Entity)(),
    __metadata("design:paramtypes", [Object])
], Account);
exports.Account = Account;
let Post = Post_1 = class Post {
    constructor(props) {
        Object.assign(this, props);
    }
};
__decorate([
    (0, typeorm_1.PrimaryColumn)(),
    __metadata("design:type", String)
], Post.prototype, "id", void 0);
__decorate([
    (0, typeorm_1.ManyToOne)(() => Post_1, { nullable: true }),
    __metadata("design:type", Object)
], Post.prototype, "parentPost", void 0);
__decorate([
    (0, typeorm_1.ManyToOne)(() => Account, { nullable: false }),
    __metadata("design:type", Account)
], Post.prototype, "createdByAccount", void 0);
__decorate([
    (0, typeorm_1.ManyToOne)(() => Space, { nullable: true }),
    __metadata("design:type", Object)
], Post.prototype, "space", void 0);
Post = Post_1 = __decorate([
    (0, typeorm_2.Entity)(),
    __metadata("design:paramtypes", [Object])
], Post);
exports.Post = Post;
let Space = class Space {
    constructor(props) {
        Object.assign(this, props);
    }
};
__decorate([
    (0, typeorm_1.PrimaryColumn)(),
    __metadata("design:type", String)
], Space.prototype, "id", void 0);
__decorate([
    (0, typeorm_1.ManyToOne)(() => Account, { nullable: false }),
    __metadata("design:type", Account)
], Space.prototype, "createdByAccount", void 0);
__decorate([
    (0, typeorm_1.ManyToOne)(() => Account, { nullable: true }),
    __metadata("design:type", Object)
], Space.prototype, "profileSpace", void 0);
__decorate([
    (0, typeorm_2.OneToMany)(() => Post, e => e.space),
    __metadata("design:type", Array)
], Space.prototype, "posts", void 0);
Space = __decorate([
    (0, typeorm_2.Entity)(),
    __metadata("design:paramtypes", [Object])
], Space);
exports.Space = Space;
//# sourceMappingURL=model.js.map