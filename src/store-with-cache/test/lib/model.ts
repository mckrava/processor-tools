import { Column, Entity, ManyToOne, PrimaryColumn } from 'typeorm';

@Entity()
export class Item {
  @PrimaryColumn()
  id!: string;

  @Column()
  name?: string;

  @Column()
  foo?: string;

  constructor(id?: string, name?: string, foo?: string) {
    if (id != null) {
      this.id = id;
      this.name = name;
      this.foo = foo;
    }
  }
}

@Entity()
export class Order {
  @PrimaryColumn()
  id!: string;

  @ManyToOne(() => Item, { nullable: true })
  item!: Item;

  @Column({ nullable: false })
  qty!: number;
}
