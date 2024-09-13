import { relations, sql } from 'drizzle-orm';
import { boolean, date, index, int, singlestoreEnum, singlestoreTable, serial, timestamp, varchar } from 'drizzle-orm/singlestore-core';

export const artists = singlestoreTable(
	'artists',
	{
		id: serial('id').primaryKey(),
		createdAt: timestamp('created_at')
			.notNull()
			.default(sql`CURRENT_TIMESTAMP`),
		updatedAt: timestamp('updated_at')
			.notNull()
			.default(sql`CURRENT_TIMESTAMP`),
		nameEn: varchar('name_en', { length: 50 }).notNull(),
		nameKr: varchar('name_kr', { length: 50 }).notNull(),
		debut: date('debut').notNull(),
		companyId: int('company_id').notNull(),
		isGroup: boolean('is_group').notNull().default(true),
		image: varchar('image', { length: 255 }).notNull(),
		twitter: varchar('twitter', { length: 255 }).notNull(),
		instagram: varchar('instagram', { length: 255 }).notNull(),
		youtube: varchar('youtube', { length: 255 }).notNull(),
		website: varchar('website', { length: 255 }).notNull(),
		spotifyId: varchar('spotify_id', { length: 32 }),
	},
	(table) => ({
		nameEnIndex: index('artists__name_en__idx').on(table.nameEn),
	}),
);

export const members = singlestoreTable('members', {
	id: serial('id').primaryKey(),
	createdAt: timestamp('created_at')
		.notNull()
		.default(sql`CURRENT_TIMESTAMP`),
	updatedAt: timestamp('updated_at')
		.notNull()
		.default(sql`CURRENT_TIMESTAMP`),
	nameEn: varchar('name_en', { length: 50 }).notNull(),
	nameKr: varchar('name_kr', { length: 50 }).notNull(),
	stageNameEn: varchar('stage_name_en', { length: 50 }).notNull(),
	stageNameKr: varchar('stage_name_kr', { length: 50 }).notNull(),
	image: varchar('image', { length: 255 }).notNull(),
	instagram: varchar('instagram', { length: 255 }).notNull(),
});

export const artistsToMembers = singlestoreTable(
	'artist_to_member',
	{
		id: serial('id').primaryKey(),
		memberId: int('member_id').notNull(),
		artistId: int('artist_id').notNull(),
	},
	(table) => ({
		memberArtistIndex: index('artist_to_member__artist_id__member_id__idx').on(
			table.memberId,
			table.artistId,
		),
	}),
);

export const albums = singlestoreTable(
	'albums',
	{
		id: serial('id').primaryKey(),
		createdAt: timestamp('created_at')
			.notNull()
			.default(sql`CURRENT_TIMESTAMP`),
		updatedAt: timestamp('updated_at')
			.notNull()
			.default(sql`CURRENT_TIMESTAMP`),
		artistId: int('artist_id').notNull(),
		name: varchar('name', { length: 50 }).notNull(),
		region: singlestoreEnum('region', ['en', 'kr', 'jp', 'other']).notNull(),
		releaseDate: date('release_date').notNull(),
		image: varchar('image', { length: 255 }).notNull(),
		spotifyId: varchar('spotify_id', { length: 32 }),
	},
	(table) => ({
		artistIndex: index('albums__artist_id__idx').on(table.artistId),
		nameIndex: index('albums__name__idx').on(table.name),
	}),
);

// relations
export const artistRelations = relations(artists, ({ many }) => ({
	albums: many(albums),
	members: many(artistsToMembers),
}));

export const albumRelations = relations(albums, ({ one }) => ({
	artist: one(artists, {
		fields: [albums.artistId],
		references: [artists.id],
	}),
}));

export const memberRelations = relations(members, ({ many }) => ({
	artists: many(artistsToMembers),
}));

export const artistsToMembersRelations = relations(artistsToMembers, ({ one }) => ({
	artist: one(artists, {
		fields: [artistsToMembers.artistId],
		references: [artists.id],
	}),
	member: one(members, {
		fields: [artistsToMembers.memberId],
		references: [members.id],
	}),
}));
