import type { Connection as CallbackConnection, Pool as CallbackPool } from 'mysql2';
import { entityKind } from '~/entity.ts';
import type { Logger } from '~/logger.ts';
import { DefaultLogger } from '~/logger.ts';
import {
	createTableRelationsHelpers,
	extractTablesRelationalConfig,
	type RelationalSchemaConfig,
	type TablesRelationalConfig,
} from '~/relations.ts';
import { SingleStoreDatabase } from '~/singlestore-core/db.ts';
import { SingleStoreDialect } from '~/singlestore-core/dialect.ts';
import type { DrizzleConfig } from '~/utils.ts';
import type { SingleStore2Client, SingleStore2PreparedQueryHKT, SingleStore2QueryResultHKT } from './session.ts';
import { SingleStore2Session } from './session.ts';

export interface SingleStoreDriverOptions {
	logger?: Logger;
}

export class SingleStore2Driver {
	static readonly [entityKind]: string = 'SingleStore2Driver';

	constructor(
		private client: SingleStore2Client,
		private dialect: SingleStoreDialect,
		private options: SingleStoreDriverOptions = {},
	) {
	}

	createSession(
		schema: RelationalSchemaConfig<TablesRelationalConfig> | undefined,
	): SingleStore2Session<Record<string, unknown>, TablesRelationalConfig> {
		return new SingleStore2Session(this.client, this.dialect, schema, { logger: this.options.logger });
	}
}

export { SingleStoreDatabase } from '~/singlestore-core/db.ts';

export type SingleStore2Database<
	TSchema extends Record<string, unknown> = Record<string, never>,
> = SingleStoreDatabase<SingleStore2QueryResultHKT, SingleStore2PreparedQueryHKT, TSchema>;

export function drizzle<TSchema extends Record<string, unknown> = Record<string, never>>(
	client: SingleStore2Client | CallbackConnection | CallbackPool,
	config: DrizzleConfig<TSchema> = {},
): SingleStore2Database<TSchema> {
	const dialect = new SingleStoreDialect();
	let logger;
	if (config.logger === true) {
		logger = new DefaultLogger();
	} else if (config.logger !== false) {
		logger = config.logger;
	}
	if (isCallbackClient(client)) {
		client = client.promise();
	}

	let schema: RelationalSchemaConfig<TablesRelationalConfig> | undefined;
	if (config.schema) {
		const tablesConfig = extractTablesRelationalConfig(
			config.schema,
			createTableRelationsHelpers,
		);
		schema = {
			fullSchema: config.schema,
			schema: tablesConfig.tables,
			tableNamesMap: tablesConfig.tableNamesMap,
		};
	}

	const driver = new SingleStore2Driver(client as SingleStore2Client, dialect, { logger });
	const session = driver.createSession(schema);
	return new SingleStoreDatabase(dialect, session, schema) as SingleStore2Database<TSchema>;
}

interface CallbackClient {
	promise(): SingleStore2Client;
}

function isCallbackClient(client: any): client is CallbackClient {
	return typeof client.promise === 'function';
}
