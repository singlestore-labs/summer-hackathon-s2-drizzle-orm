import { any, boolean, enum as enumType, literal, object, record, string, TypeOf, union } from 'zod';
import { mapValues, originUUID, snapshotVersion } from '../global';

// ------- V3 --------
const index = object({
	name: string(),
	columns: string().array(),
	isUnique: boolean(),
	using: enumType(['btree', 'hash']).optional(),
	algorithm: enumType(['default', 'inplace', 'copy']).optional(),
	lock: enumType(['default', 'none', 'shared', 'exclusive']).optional(),
}).strict();

const fk = object({
	name: string(),
	tableFrom: string(),
	columnsFrom: string().array(),
	tableTo: string(),
	columnsTo: string().array(),
	onUpdate: string().optional(),
	onDelete: string().optional(),
}).strict();

const column = object({
	name: string(),
	type: string(),
	primaryKey: boolean(),
	notNull: boolean(),
	autoincrement: boolean().optional(),
	default: any().optional(),
	onUpdate: any().optional(),
	generated: object({
		type: enumType(['stored', 'virtual']),
		as: string(),
	}).optional(),
}).strict();

const compositePK = object({
	name: string(),
	columns: string().array(),
}).strict();

const uniqueConstraint = object({
	name: string(),
	columns: string().array(),
}).strict();

const table = object({
	name: string(),
	columns: record(string(), column),
	indexes: record(string(), index),
	compositePrimaryKeys: record(string(), compositePK),
	uniqueConstraints: record(string(), uniqueConstraint).default({}),
}).strict();

export const kitInternals = object({
	tables: record(
		string(),
		object({
			columns: record(
				string(),
				object({ isDefaultAnExpression: boolean().optional() }).optional(),
			),
		}).optional(),
	).optional(),
	indexes: record(
		string(),
		object({
			columns: record(
				string(),
				object({ isExpression: boolean().optional() }).optional(),
			),
		}).optional(),
	).optional(),
}).optional();

// use main dialect
const dialect = literal('singlestore');

const schemaHash = object({
	id: string(),
	prevId: string(),
});

export const schemaInternal = object({
	version: literal('1'),
	dialect: dialect,
	tables: record(string(), table),
	_meta: object({
		tables: record(string(), string()),
		columns: record(string(), string()),
	}),
	internal: kitInternals,
}).strict();

export const schema = schemaInternal.merge(schemaHash);

const tableSquashed = object({
	name: string(),
	columns: record(string(), column),
	indexes: record(string(), string()),
	compositePrimaryKeys: record(string(), string()),
	uniqueConstraints: record(string(), string()).default({}),
}).strict();

export const schemaSquashed = object({
	version: literal('1'),
	dialect: dialect,
	tables: record(string(), tableSquashed),
}).strict();

export type Dialect = TypeOf<typeof dialect>;
export type Column = TypeOf<typeof column>;
export type Table = TypeOf<typeof table>;
export type SingleStoreSchema = TypeOf<typeof schema>;
export type SingleStoreSchemaInternal = TypeOf<typeof schemaInternal>;
export type SingleStoreKitInternals = TypeOf<typeof kitInternals>;
export type SingleStoreSchemaSquashed = TypeOf<typeof schemaSquashed>;
export type Index = TypeOf<typeof index>;
export type PrimaryKey = TypeOf<typeof compositePK>;
export type UniqueConstraint = TypeOf<typeof uniqueConstraint>;

export const SingleStoreSquasher = {
	squashIdx: (idx: Index) => {
		index.parse(idx);
		return `${idx.name};${idx.columns.join(',')};${idx.isUnique};${idx.using ?? ''};${idx.algorithm ?? ''};${
			idx.lock ?? ''
		}`;
	},
	unsquashIdx: (input: string): Index => {
		const [name, columnsString, isUnique, using, algorithm, lock] = input.split(';');
		const destructed = {
			name,
			columns: columnsString.split(','),
			isUnique: isUnique === 'true',
			using: using ? using : undefined,
			algorithm: algorithm ? algorithm : undefined,
			lock: lock ? lock : undefined,
		};
		return index.parse(destructed);
	},
	squashPK: (pk: PrimaryKey) => {
		return `${pk.name};${pk.columns.join(',')}`;
	},
	unsquashPK: (pk: string): PrimaryKey => {
		const splitted = pk.split(';');
		return { name: splitted[0], columns: splitted[1].split(',') };
	},
	squashUnique: (unq: UniqueConstraint) => {
		return `${unq.name};${unq.columns.join(',')}`;
	},
	unsquashUnique: (unq: string): UniqueConstraint => {
		const [name, columns] = unq.split(';');
		return { name, columns: columns.split(',') };
	},
};

export const squashSingleStoreScheme = (json: SingleStoreSchema): SingleStoreSchemaSquashed => {
	const mappedTables = Object.fromEntries(
		Object.entries(json.tables).map((it) => {
			const squashedIndexes = mapValues(it[1].indexes, (index) => {
				return SingleStoreSquasher.squashIdx(index);
			});

			const squashedPKs = mapValues(it[1].compositePrimaryKeys, (pk) => {
				return SingleStoreSquasher.squashPK(pk);
			});

			const squashedUniqueConstraints = mapValues(
				it[1].uniqueConstraints,
				(unq) => {
					return SingleStoreSquasher.squashUnique(unq);
				},
			);

			return [
				it[0],
				{
					name: it[1].name,
					columns: it[1].columns,
					indexes: squashedIndexes,
					compositePrimaryKeys: squashedPKs,
					uniqueConstraints: squashedUniqueConstraints,
				},
			];
		}),
	);
	return {
		version: '1',
		dialect: json.dialect,
		tables: mappedTables,
	};
};

export const singlestoreSchema = schema;
export const singlestoreSchemaSquashed = schemaSquashed;

// no prev version
export const backwardCompatibleSingleStoreSchema = union([singlestoreSchema, schema]);

export const drySingleStore = singlestoreSchema.parse({
	version: '1',
	dialect: 'singlestore',
	id: originUUID,
	prevId: '',
	tables: {},
	schemas: {},
	_meta: {
		schemas: {},
		tables: {},
		columns: {},
	},
});
