import { mysqlTable, int, varchar, timestamp, date, mysqlEnum, boolean } from 'drizzle-orm/mysql-core';

export const users = mysqlTable('users', {
  id: int('id').autoincrement().primaryKey(),
  email: varchar('email', { length: 255 }).notNull().unique(),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});

export const authTokens = mysqlTable('auth_tokens', {
  id: int('id').autoincrement().primaryKey(),
  userId: int('user_id').notNull().references(() => users.id),
  tokenHash: varchar('token_hash', { length: 64 }).notNull(),
  expiresAt: timestamp('expires_at').notNull(),
  usedAt: timestamp('used_at'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});

export const trips = mysqlTable('trips', {
  id: int('id').autoincrement().primaryKey(),
  publicId: varchar('public_id', { length: 21 }).notNull().unique(),
  name: varchar('name', { length: 255 }).notNull(),
  destination: varchar('destination', { length: 255 }).notNull(),
  startDate: date('start_date', { mode: 'string' }).notNull(),
  endDate: date('end_date', { mode: 'string' }).notNull(),
  creatorUserId: int('creator_user_id').notNull().references(() => users.id),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow().onUpdateNow(),
});

export const tripMembers = mysqlTable('trip_members', {
  id: int('id').autoincrement().primaryKey(),
  tripId: int('trip_id').notNull().references(() => trips.id),
  name: varchar('name', { length: 255 }).notNull(),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});

export const subTrips = mysqlTable('sub_trips', {
  id: int('id').autoincrement().primaryKey(),
  tripId: int('trip_id').notNull().references(() => trips.id),
  name: varchar('name', { length: 255 }).notNull(),
  category: mysqlEnum('category', ['makan', 'transport', 'nginap', 'tiket_wisata', 'lainnya']).notNull(),
  date: date('date', { mode: 'string' }).notNull(),
  payerMemberId: int('payer_member_id').notNull().references(() => tripMembers.id),
  amount: int('amount').notNull(),
  payerParticipates: boolean('payer_participates').notNull().default(true),
  createdByMemberId: int('created_by_member_id').notNull().references(() => tripMembers.id),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedByMemberId: int('updated_by_member_id'),
  updatedAt: timestamp('updated_at').notNull().defaultNow().onUpdateNow(),
});

export const debts = mysqlTable('debts', {
  id: int('id').autoincrement().primaryKey(),
  subTripId: int('sub_trip_id').notNull().references(() => subTrips.id),
  memberId: int('member_id').notNull().references(() => tripMembers.id),
  amount: int('amount').notNull(),
  settled: boolean('settled').notNull().default(false),
  settledAt: timestamp('settled_at'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});
