const cyclicRel = [
  `CREATE TABLE "account" (
        "id" text PRIMARY KEY, 
        "profile_space_id" text
      )`,

  `CREATE TABLE "post" (
        "id" text PRIMARY KEY, 
        "parent_post_id" text, 
        "created_by_account_id" text NOT NULL, 
        "space_id" text
      )`,

  `CREATE TABLE "space" (
        "id" text PRIMARY KEY, 
        "created_by_account_id" text NOT NULL, 
        "profile_space_id" text
      )`,

  `ALTER TABLE "account" ADD CONSTRAINT "fk_account_space" FOREIGN KEY ("profile_space_id") REFERENCES "space"("id")`,
  `ALTER TABLE "post" ADD CONSTRAINT "fk_post_post" FOREIGN KEY ("parent_post_id") REFERENCES "post"("id")`,
  `ALTER TABLE "post" ADD CONSTRAINT "fk_post_space" FOREIGN KEY ("space_id") REFERENCES "space"("id")`,
  `ALTER TABLE "space" ADD CONSTRAINT "fk_space_created_by_account" FOREIGN KEY ("created_by_account_id") REFERENCES "account"("id")`,
  `ALTER TABLE "space" ADD CONSTRAINT "fk_space_profile_space" FOREIGN KEY ("profile_space_id") REFERENCES "account"("id")`
];

const simpleItemOrderOneToManyRel = [
  `CREATE TABLE item (id text primary key , name text, foo text)`,
  `CREATE TABLE "order" (id text primary key, item_id text REFERENCES item, qty int4)`,
  `INSERT INTO item (id, name) values ('1', 'a')`,
  `INSERT INTO "order" (id, item_id, qty) values ('1', '1', 3)`,
  `INSERT INTO item (id, name) values ('2', 'b')`,
  `INSERT INTO "order" (id, item_id, qty) values ('2', '2', 3)`
];

const itemsList = [
  `CREATE TABLE item (id text primary key , name text, foo text)`,
  `INSERT INTO item (id, name) values ('1', 'a')`,
  `INSERT INTO item (id, name) values ('2', 'b')`,
  `INSERT INTO item (id, name) values ('3', 'c')`
];

export default {
  deferredMethods: {
    itemsList,
    cyclicRel,
    simpleItemOrderOneToManyRel
  }
};
