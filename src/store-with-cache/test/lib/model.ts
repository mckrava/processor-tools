import { Column, Entity, ManyToOne, PrimaryColumn } from 'typeorm';
import {Entity as Entity_, Column as Column_, Index as Index_, OneToMany as OneToMany_} from "typeorm"

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


@Entity_()
export class Account {
  constructor(props?: Partial<Account>) {
    Object.assign(this, props)
  }

  @PrimaryColumn()
  id!: string

  @ManyToOne(() => Space, {nullable: true})
  profileSpace!: Space | undefined | null

  @OneToMany_(() => Post, e => e.createdByAccount)
  posts!: Post[]

  @OneToMany_(() => Space, e => e.createdByAccount)
  spacesCreated!: Space[]

}

@Entity_()
export class Post {
  constructor(props?: Partial<Post>) {
    Object.assign(this, props)
  }

  @PrimaryColumn()
  id!: string

  @ManyToOne(() => Post, {nullable: true})
  parentPost!: Post | undefined | null

  @ManyToOne(() => Account, {nullable: false})
  createdByAccount!: Account

  @ManyToOne(() => Space, {nullable: true})
  space!: Space | undefined | null
}

@Entity_()
export class Space {
  constructor(props?: Partial<Space>) {
    Object.assign(this, props)
  }

  @PrimaryColumn()
  id!: string

  @ManyToOne(() => Account, {nullable: false})
  createdByAccount!: Account

  @ManyToOne(() => Account, {nullable: true})
  profileSpace!: Account | undefined | null

  @OneToMany_(() => Post, e => e.space)
  posts!: Post[]
}


