import { pgTable, integer, varchar, uuid, timestamp, jsonb } from "drizzle-orm/pg-core";

export const rooms = pgTable("rooms", {
  id: uuid("id").defaultRandom().primaryKey(),
  code: varchar("code", { length: 12 }).notNull().unique(),
  name: varchar("name", { length: 50 }).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  lastActiveAt: timestamp("last_active_at").defaultNow().notNull(),
});

export const strokes = pgTable("strokes", {
  id: uuid("id").defaultRandom().primaryKey(),
  roomId: uuid("room_id").references(() => rooms.id, { onDelete: "cascade" }).notNull(),
  points: jsonb("points").notNull(),
  color: varchar("color", { length: 7 }).notNull(),
  thickness: integer("thickness").notNull(),
  authorId: uuid("author_id"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const stickyNotes = pgTable("sticky_notes", {
  id: uuid("id").defaultRandom().primaryKey(),
  roomId: uuid("room_id").references(() => rooms.id, { onDelete: "cascade" }).notNull(),
  x: integer("x").notNull(),
  y: integer("y").notNull(),
  text: varchar("text", { length: 280 }).notNull(),
  color: varchar("color", { length: 7 }).notNull(),
  authorId: uuid("author_id"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});