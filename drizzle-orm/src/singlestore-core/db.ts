import type { ResultSetHeader } from 'mysql2/promise';
import { entityKind } from '~/entity.ts';
import type { TypedQueryBuilder } from '~/query-builders/query-builder.ts';
import type { ExtractTablesWithRelations, RelationalSchemaConfig, TablesRelationalConfig } from '~/relations.ts';
import { SelectionProxyHandler } from '~/selection-proxy.ts';
import type { ColumnsSelection, SQLWrapper } from '~/sql/sql.ts';
import { WithSubquery } from '~/subquery.ts';
import type { DrizzleTypeError } from '~/utils.ts';
import type { SingleStoreDialect } from './dialect.ts';
import { SingleStoreAttachBase } from './query-builders/attach.ts';
import { SingleStoreBranchBase } from './query-builders/branch.ts';
import { SingleStoreCreateMilestoneBase } from './query-builders/createMilestone.ts';
import { SingleStoreDetachBase } from './query-builders/detach.ts';
import { SingleStoreDropMilestoneBase } from './query-builders/dropMilestone.ts';
import {
	QueryBuilder,
	SingleStoreDeleteBase,
	SingleStoreInsertBuilder,
	SingleStoreSelectBuilder,
	SingleStoreUpdateBuilder,
} from './query-builders/index.ts';
import { SingleStoreOptimizeTableBase } from './query-builders/optimizeTable.ts';
import type { OptimizeTableArgument } from './query-builders/optimizeTable.types.ts';
import { RelationalQueryBuilder } from './query-builders/query.ts';
import type { SelectedFields } from './query-builders/select.types.ts';
import type {
	PreparedQueryHKTBase,
	SingleStoreQueryResultHKT,
	SingleStoreQueryResultKind,
	SingleStoreSession,
	SingleStoreTransaction,
	SingleStoreTransactionConfig,
} from './session.ts';
import type { WithSubqueryWithSelection } from './subquery.ts';
import type { SingleStoreTable } from './table.ts';

export class SingleStoreDatabase<
	TQueryResult extends SingleStoreQueryResultHKT,
	TPreparedQueryHKT extends PreparedQueryHKTBase,
	TFullSchema extends Record<string, unknown> = {},
	TSchema extends TablesRelationalConfig = ExtractTablesWithRelations<TFullSchema>,
> {
	static readonly [entityKind]: string = 'SingleStoreDatabase';

	declare readonly _: {
		readonly schema: TSchema | undefined;
		readonly fullSchema: TFullSchema;
		readonly tableNamesMap: Record<string, string>;
	};

	query: TFullSchema extends Record<string, never>
		? DrizzleTypeError<'Seems like the schema generic is missing - did you forget to add it to your DB type?'>
		: {
			[K in keyof TSchema]: RelationalQueryBuilder<TPreparedQueryHKT, TSchema, TSchema[K]>;
		};

	constructor(
		/** @internal */
		readonly dialect: SingleStoreDialect,
		/** @internal */
		readonly session: SingleStoreSession<any, any, any, any>,
		schema: RelationalSchemaConfig<TSchema> | undefined,
	) {
		this._ = schema
			? {
				schema: schema.schema,
				fullSchema: schema.fullSchema as TFullSchema,
				tableNamesMap: schema.tableNamesMap,
			}
			: {
				schema: undefined,
				fullSchema: {} as TFullSchema,
				tableNamesMap: {},
			};
		this.query = {} as typeof this['query'];
		if (this._.schema) {
			for (const [tableName, columns] of Object.entries(this._.schema)) {
				(this.query as SingleStoreDatabase<TQueryResult, TPreparedQueryHKT, Record<string, any>>['query'])[tableName] =
					new RelationalQueryBuilder(
						schema!.fullSchema,
						this._.schema,
						this._.tableNamesMap,
						schema!.fullSchema[tableName] as SingleStoreTable,
						columns,
						dialect,
						session,
					);
			}
		}
	}

	/**
	 * Creates a subquery that defines a temporary named result set as a CTE.
	 *
	 * It is useful for breaking down complex queries into simpler parts and for reusing the result set in subsequent parts of the query.
	 *
	 * See docs: {@link https://orm.drizzle.team/docs/select#with-clause}
	 *
	 * @param alias The alias for the subquery.
	 *
	 * Failure to provide an alias will result in a DrizzleTypeError, preventing the subquery from being referenced in other queries.
	 *
	 * @example
	 *
	 * ```ts
	 * // Create a subquery with alias 'sq' and use it in the select query
	 * const sq = db.$with('sq').as(db.select().from(users).where(eq(users.id, 42)));
	 *
	 * const result = await db.with(sq).select().from(sq);
	 * ```
	 *
	 * To select arbitrary SQL values as fields in a CTE and reference them in other CTEs or in the main query, you need to add aliases to them:
	 *
	 * ```ts
	 * // Select an arbitrary SQL value as a field in a CTE and reference it in the main query
	 * const sq = db.$with('sq').as(db.select({
	 *   name: sql<string>`upper(${users.name})`.as('name'),
	 * })
	 * .from(users));
	 *
	 * const result = await db.with(sq).select({ name: sq.name }).from(sq);
	 * ```
	 */
	$with<TAlias extends string>(alias: TAlias) {
		return {
			as<TSelection extends ColumnsSelection>(
				qb: TypedQueryBuilder<TSelection> | ((qb: QueryBuilder) => TypedQueryBuilder<TSelection>),
			): WithSubqueryWithSelection<TSelection, TAlias> {
				if (typeof qb === 'function') {
					qb = qb(new QueryBuilder());
				}

				return new Proxy(
					new WithSubquery(qb.getSQL(), qb.getSelectedFields() as SelectedFields, alias, true),
					new SelectionProxyHandler({ alias, sqlAliasedBehavior: 'alias', sqlBehavior: 'error' }),
				) as WithSubqueryWithSelection<TSelection, TAlias>;
			},
		};
	}

	/**
	 * Incorporates a previously defined CTE (using `$with`) into the main query.
	 *
	 * This method allows the main query to reference a temporary named result set.
	 *
	 * See docs: {@link https://orm.drizzle.team/docs/select#with-clause}
	 *
	 * @param queries The CTEs to incorporate into the main query.
	 *
	 * @example
	 *
	 * ```ts
	 * // Define a subquery 'sq' as a CTE using $with
	 * const sq = db.$with('sq').as(db.select().from(users).where(eq(users.id, 42)));
	 *
	 * // Incorporate the CTE 'sq' into the main query and select from it
	 * const result = await db.with(sq).select().from(sq);
	 * ```
	 */
	with(...queries: WithSubquery[]) {
		const self = this;

		/**
		 * Creates a select query.
		 *
		 * Calling this method with no arguments will select all columns from the table. Pass a selection object to specify the columns you want to select.
		 *
		 * Use `.from()` method to specify which table to select from.
		 *
		 * See docs: {@link https://orm.drizzle.team/docs/select}
		 *
		 * @param fields The selection object.
		 *
		 * @example
		 *
		 * ```ts
		 * // Select all columns and all rows from the 'cars' table
		 * const allCars: Car[] = await db.select().from(cars);
		 *
		 * // Select specific columns and all rows from the 'cars' table
		 * const carsIdsAndBrands: { id: number; brand: string }[] = await db.select({
		 *   id: cars.id,
		 *   brand: cars.brand
		 * })
		 *   .from(cars);
		 * ```
		 *
		 * Like in SQL, you can use arbitrary expressions as selection fields, not just table columns:
		 *
		 * ```ts
		 * // Select specific columns along with expression and all rows from the 'cars' table
		 * const carsIdsAndLowerNames: { id: number; lowerBrand: string }[] = await db.select({
		 *   id: cars.id,
		 *   lowerBrand: sql<string>`lower(${cars.brand})`,
		 * })
		 *   .from(cars);
		 * ```
		 */
		function select(): SingleStoreSelectBuilder<undefined, TPreparedQueryHKT>;
		function select<TSelection extends SelectedFields>(
			fields: TSelection,
		): SingleStoreSelectBuilder<TSelection, TPreparedQueryHKT>;
		function select(fields?: SelectedFields): SingleStoreSelectBuilder<SelectedFields | undefined, TPreparedQueryHKT> {
			return new SingleStoreSelectBuilder({
				fields: fields ?? undefined,
				session: self.session,
				dialect: self.dialect,
				withList: queries,
			});
		}

		/**
		 * Adds `distinct` expression to the select query.
		 *
		 * Calling this method will return only unique values. When multiple columns are selected, it returns rows with unique combinations of values in these columns.
		 *
		 * Use `.from()` method to specify which table to select from.
		 *
		 * See docs: {@link https://orm.drizzle.team/docs/select#distinct}
		 *
		 * @param fields The selection object.
		 *
		 * @example
		 * ```ts
		 * // Select all unique rows from the 'cars' table
		 * await db.selectDistinct()
		 *   .from(cars)
		 *   .orderBy(cars.id, cars.brand, cars.color);
		 *
		 * // Select all unique brands from the 'cars' table
		 * await db.selectDistinct({ brand: cars.brand })
		 *   .from(cars)
		 *   .orderBy(cars.brand);
		 * ```
		 */
		function selectDistinct(): SingleStoreSelectBuilder<undefined, TPreparedQueryHKT>;
		function selectDistinct<TSelection extends SelectedFields>(
			fields: TSelection,
		): SingleStoreSelectBuilder<TSelection, TPreparedQueryHKT>;
		function selectDistinct(
			fields?: SelectedFields,
		): SingleStoreSelectBuilder<SelectedFields | undefined, TPreparedQueryHKT> {
			return new SingleStoreSelectBuilder({
				fields: fields ?? undefined,
				session: self.session,
				dialect: self.dialect,
				withList: queries,
				distinct: true,
			});
		}

		/**
		 * Creates an update query.
		 *
		 * Calling this method without `.where()` clause will update all rows in a table. The `.where()` clause specifies which rows should be updated.
		 *
		 * Use `.set()` method to specify which values to update.
		 *
		 * See docs: {@link https://orm.drizzle.team/docs/update}
		 *
		 * @param table The table to update.
		 *
		 * @example
		 *
		 * ```ts
		 * // Update all rows in the 'cars' table
		 * await db.update(cars).set({ color: 'red' });
		 *
		 * // Update rows with filters and conditions
		 * await db.update(cars).set({ color: 'red' }).where(eq(cars.brand, 'BMW'));
		 * ```
		 */
		function update<TTable extends SingleStoreTable>(
			table: TTable,
		): SingleStoreUpdateBuilder<TTable, TQueryResult, TPreparedQueryHKT> {
			return new SingleStoreUpdateBuilder(table, self.session, self.dialect, queries);
		}

		/**
		 * Creates a delete query.
		 *
		 * Calling this method without `.where()` clause will delete all rows in a table. The `.where()` clause specifies which rows should be deleted.
		 *
		 * See docs: {@link https://orm.drizzle.team/docs/delete}
		 *
		 * @param table The table to delete from.
		 *
		 * @example
		 *
		 * ```ts
		 * // Delete all rows in the 'cars' table
		 * await db.delete(cars);
		 *
		 * // Delete rows with filters and conditions
		 * await db.delete(cars).where(eq(cars.color, 'green'));
		 * ```
		 */
		function delete_<TTable extends SingleStoreTable>(
			table: TTable,
		): SingleStoreDeleteBase<TTable, TQueryResult, TPreparedQueryHKT> {
			return new SingleStoreDeleteBase(table, self.session, self.dialect, queries);
		}

		return { select, selectDistinct, update, delete: delete_ };
	}

	/**
	 * Creates a select query.
	 *
	 * Calling this method with no arguments will select all columns from the table. Pass a selection object to specify the columns you want to select.
	 *
	 * Use `.from()` method to specify which table to select from.
	 *
	 * See docs: {@link https://orm.drizzle.team/docs/select}
	 *
	 * @param fields The selection object.
	 *
	 * @example
	 *
	 * ```ts
	 * // Select all columns and all rows from the 'cars' table
	 * const allCars: Car[] = await db.select().from(cars);
	 *
	 * // Select specific columns and all rows from the 'cars' table
	 * const carsIdsAndBrands: { id: number; brand: string }[] = await db.select({
	 *   id: cars.id,
	 *   brand: cars.brand
	 * })
	 *   .from(cars);
	 * ```
	 *
	 * Like in SQL, you can use arbitrary expressions as selection fields, not just table columns:
	 *
	 * ```ts
	 * // Select specific columns along with expression and all rows from the 'cars' table
	 * const carsIdsAndLowerNames: { id: number; lowerBrand: string }[] = await db.select({
	 *   id: cars.id,
	 *   lowerBrand: sql<string>`lower(${cars.brand})`,
	 * })
	 *   .from(cars);
	 * ```
	 */
	select(): SingleStoreSelectBuilder<undefined, TPreparedQueryHKT>;
	select<TSelection extends SelectedFields>(
		fields: TSelection,
	): SingleStoreSelectBuilder<TSelection, TPreparedQueryHKT>;
	select(fields?: SelectedFields): SingleStoreSelectBuilder<SelectedFields | undefined, TPreparedQueryHKT> {
		return new SingleStoreSelectBuilder({ fields: fields ?? undefined, session: this.session, dialect: this.dialect });
	}

	/**
	 * Adds `distinct` expression to the select query.
	 *
	 * Calling this method will return only unique values. When multiple columns are selected, it returns rows with unique combinations of values in these columns.
	 *
	 * Use `.from()` method to specify which table to select from.
	 *
	 * See docs: {@link https://orm.drizzle.team/docs/select#distinct}
	 *
	 * @param fields The selection object.
	 *
	 * @example
	 * ```ts
	 * // Select all unique rows from the 'cars' table
	 * await db.selectDistinct()
	 *   .from(cars)
	 *   .orderBy(cars.id, cars.brand, cars.color);
	 *
	 * // Select all unique brands from the 'cars' table
	 * await db.selectDistinct({ brand: cars.brand })
	 *   .from(cars)
	 *   .orderBy(cars.brand);
	 * ```
	 */
	selectDistinct(): SingleStoreSelectBuilder<undefined, TPreparedQueryHKT>;
	selectDistinct<TSelection extends SelectedFields>(
		fields: TSelection,
	): SingleStoreSelectBuilder<TSelection, TPreparedQueryHKT>;
	selectDistinct(fields?: SelectedFields): SingleStoreSelectBuilder<SelectedFields | undefined, TPreparedQueryHKT> {
		return new SingleStoreSelectBuilder({
			fields: fields ?? undefined,
			session: this.session,
			dialect: this.dialect,
			distinct: true,
		});
	}

	/**
	 * Creates an update query.
	 *
	 * Calling this method without `.where()` clause will update all rows in a table. The `.where()` clause specifies which rows should be updated.
	 *
	 * Use `.set()` method to specify which values to update.
	 *
	 * See docs: {@link https://orm.drizzle.team/docs/update}
	 *
	 * @param table The table to update.
	 *
	 * @example
	 *
	 * ```ts
	 * // Update all rows in the 'cars' table
	 * await db.update(cars).set({ color: 'red' });
	 *
	 * // Update rows with filters and conditions
	 * await db.update(cars).set({ color: 'red' }).where(eq(cars.brand, 'BMW'));
	 * ```
	 */
	update<TTable extends SingleStoreTable>(
		table: TTable,
	): SingleStoreUpdateBuilder<TTable, TQueryResult, TPreparedQueryHKT> {
		return new SingleStoreUpdateBuilder(table, this.session, this.dialect);
	}

	/**
	 * Creates an insert query.
	 *
	 * Calling this method will create new rows in a table. Use `.values()` method to specify which values to insert.
	 *
	 * See docs: {@link https://orm.drizzle.team/docs/insert}
	 *
	 * @param table The table to insert into.
	 *
	 * @example
	 *
	 * ```ts
	 * // Insert one row
	 * await db.insert(cars).values({ brand: 'BMW' });
	 *
	 * // Insert multiple rows
	 * await db.insert(cars).values([{ brand: 'BMW' }, { brand: 'Porsche' }]);
	 * ```
	 */
	insert<TTable extends SingleStoreTable>(
		table: TTable,
	): SingleStoreInsertBuilder<TTable, TQueryResult, TPreparedQueryHKT> {
		return new SingleStoreInsertBuilder(table, this.session, this.dialect);
	}

	/**
	 * Creates a delete query.
	 *
	 * Calling this method without `.where()` clause will delete all rows in a table. The `.where()` clause specifies which rows should be deleted.
	 *
	 * See docs: {@link https://orm.drizzle.team/docs/delete}
	 *
	 * @param table The table to delete from.
	 *
	 * @example
	 *
	 * ```ts
	 * // Delete all rows in the 'cars' table
	 * await db.delete(cars);
	 *
	 * // Delete rows with filters and conditions
	 * await db.delete(cars).where(eq(cars.color, 'green'));
	 * ```
	 */
	delete<TTable extends SingleStoreTable>(
		table: TTable,
	): SingleStoreDeleteBase<TTable, TQueryResult, TPreparedQueryHKT> {
		return new SingleStoreDeleteBase(table, this.session, this.dialect);
	}

	execute<T extends { [column: string]: any } = ResultSetHeader>(
		query: SQLWrapper,
	): Promise<SingleStoreQueryResultKind<TQueryResult, T>> {
		return this.session.execute(query.getSQL());
	}

	transaction<T>(
		transaction: (
			tx: SingleStoreTransaction<TQueryResult, TPreparedQueryHKT, TFullSchema, TSchema>,
			config?: SingleStoreTransactionConfig,
		) => Promise<T>,
		config?: SingleStoreTransactionConfig,
	): Promise<T> {
		return this.session.transaction(transaction, config);
	}

	detach<TDatabase extends string>(
		database: TDatabase,
	): SingleStoreDetachBase<TDatabase, TQueryResult, TPreparedQueryHKT> {
		return new SingleStoreDetachBase(database, this.session, this.dialect);
	}

	attach<TDatabase extends string>(
		database: TDatabase,
	): SingleStoreAttachBase<TDatabase, TQueryResult, TPreparedQueryHKT> {
		return new SingleStoreAttachBase(database, this.session, this.dialect);
	}

	branch<TDatabase extends string>(
		database: TDatabase,
		branchName: string,
	): SingleStoreBranchBase<TDatabase, TQueryResult, TPreparedQueryHKT> {
		return new SingleStoreBranchBase(database, branchName, this.session, this.dialect);
	}

	createMilestone<TMilestone extends string>(
		milestone: TMilestone,
	): SingleStoreCreateMilestoneBase<TMilestone, TQueryResult, TPreparedQueryHKT> {
		return new SingleStoreCreateMilestoneBase(milestone, this.session, this.dialect);
	}

	dropMilestone<TMilestone extends string>(
		milestone: TMilestone,
	): SingleStoreDropMilestoneBase<TMilestone, TQueryResult, TPreparedQueryHKT> {
		return new SingleStoreDropMilestoneBase(milestone, this.session, this.dialect);
	}

	optimizeTable<
		TTable extends SingleStoreTable,
		TArg extends OptimizeTableArgument,
	>(
		table: TTable,
		arg: TArg | undefined = undefined,
	): SingleStoreOptimizeTableBase<TTable, TArg, TQueryResult, TPreparedQueryHKT> {
		return new SingleStoreOptimizeTableBase(table, arg, this.session, this.dialect);
	}
}

export type SingleStoreWithReplicas<Q> = Q & { $primary: Q };

export const withReplicas = <
	HKT extends SingleStoreQueryResultHKT,
	TPreparedQueryHKT extends PreparedQueryHKTBase,
	TFullSchema extends Record<string, unknown>,
	TSchema extends TablesRelationalConfig,
	Q extends SingleStoreDatabase<
		HKT,
		TPreparedQueryHKT,
		TFullSchema,
		TSchema extends Record<string, unknown> ? ExtractTablesWithRelations<TFullSchema> : TSchema
	>,
>(
	primary: Q,
	replicas: [Q, ...Q[]],
	getReplica: (replicas: Q[]) => Q = () => replicas[Math.floor(Math.random() * replicas.length)]!,
): SingleStoreWithReplicas<Q> => {
	const select: Q['select'] = (...args: []) => getReplica(replicas).select(...args);
	const selectDistinct: Q['selectDistinct'] = (...args: []) => getReplica(replicas).selectDistinct(...args);
	const $with: Q['with'] = (...args: []) => getReplica(replicas).with(...args);

	const update: Q['update'] = (...args: [any]) => primary.update(...args);
	const insert: Q['insert'] = (...args: [any]) => primary.insert(...args);
	const $delete: Q['delete'] = (...args: [any]) => primary.delete(...args);
	const execute: Q['execute'] = (...args: [any]) => primary.execute(...args);
	const transaction: Q['transaction'] = (...args: [any, any]) => primary.transaction(...args);

	return {
		...primary,
		update,
		insert,
		delete: $delete,
		execute,
		transaction,
		$primary: primary,
		select,
		selectDistinct,
		with: $with,
		get query() {
			return getReplica(replicas).query;
		},
	};
};
