import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
  OneToMany,
} from "typeorm";
import { Channel } from "./Channel";
import { LinkedAccount } from "./LinkedAccount";

export type GoogleYoutubeChannel = {
  id: string;
  name: string;
  imageUrl: string;
  handle?: string;
  hasAccess?: boolean;
};

@Entity({ name: "users" })
export class User {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ unique: true })
  googleId!: string;

  @Column()
  email!: string;

  @Column()
  name!: string;

  @Column({ nullable: true })
  picture?: string;

  @Column({ type: "jsonb", nullable: true })
  googleYoutubeChannels?: GoogleYoutubeChannel[] | null;

  @OneToMany(() => Channel, (channel) => channel.owner)
  channels!: Channel[];

  @OneToMany(() => LinkedAccount, (account) => account.user)
  linkedAccounts!: LinkedAccount[];

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}
