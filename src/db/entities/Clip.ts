import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
} from "typeorm";
import { Channel } from "./Channel";

@Entity()
export class Clip {
  @PrimaryGeneratedColumn()
  id!: number;

  @ManyToOne(() => Channel, { eager: true })
  @JoinColumn({ name: "channelId" })
  channel!: Channel;

  @Column()
  channelId!: number; // numeric FK

  @Column()
  provider!: string;

  @Column()
  chatId!: string;

  @Column()
  clipName!: string;

  @Column()
  liveVideoId!: string;

  @Column()
  offsetSeconds!: string;

  @Column()
  clippedBy!: string;

  @Column({ nullable: true })
  thumbnailUrl?: string;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}
