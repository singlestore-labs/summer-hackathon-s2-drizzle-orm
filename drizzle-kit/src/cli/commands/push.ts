import chalk from 'chalk';
import { render } from 'hanji';
import { fromJson } from '../../sqlgenerator';
import { Select } from '../selector-ui';
import type { MysqlCredentials } from '../validations/mysql';
import { withStyle } from '../validations/outputs';
import type { PostgresCredentials } from '../validations/postgres';
import { SingleStoreCredentials } from '../validations/singlestore';
import type { SqliteCredentials } from '../validations/sqlite';
import {
	filterStatements as mySqlFilterStatements,
	logSuggestionsAndReturn as mySqlLogSuggestionsAndReturn,
} from './mysqlPushUtils';
import { pgSuggestions } from './pgPushUtils';
import {
	filterStatements as singleStoreFilterStatements,
	logSuggestionsAndReturn as singleStoreLogSuggestionsAndReturn,
} from './singlestorePushUtils';
import { logSuggestionsAndReturn as sqliteSuggestions } from './sqlitePushUtils';

export const mysqlPush = async (
	schemaPath: string | string[],
	credentials: MysqlCredentials,
	tablesFilter: string[],
	strict: boolean,
	verbose: boolean,
	force: boolean,
) => {
	const { connectToMySQL } = await import('../connections');
	const { mysqlPushIntrospect } = await import('./mysqlIntrospect');

	const { db, database } = await connectToMySQL(credentials);

	const { schema } = await mysqlPushIntrospect(db, database, tablesFilter);
	const { prepareMySQLPush } = await import('./migrate');

	const statements = await prepareMySQLPush(schemaPath, schema);

	const filteredStatements = mySqlFilterStatements(
		statements.statements ?? [],
		statements.validatedCur,
		statements.validatedPrev,
	);

	try {
		if (filteredStatements.length === 0) {
			render(`[${chalk.blue('i')}] No changes detected`);
		} else {
			const {
				shouldAskForApprove,
				statementsToExecute,
				columnsToRemove,
				tablesToRemove,
				tablesToTruncate,
				infoToPrint,
			} = await mySqlLogSuggestionsAndReturn(
				db,
				filteredStatements,
				statements.validatedCur,
			);

			const filteredSqlStatements = fromJson(filteredStatements, 'mysql');

			const uniqueSqlStatementsToExecute: string[] = [];
			statementsToExecute.forEach((ss) => {
				if (!uniqueSqlStatementsToExecute.includes(ss)) {
					uniqueSqlStatementsToExecute.push(ss);
				}
			});
			const uniqueFilteredSqlStatements: string[] = [];
			filteredSqlStatements.forEach((ss) => {
				if (!uniqueFilteredSqlStatements.includes(ss)) {
					uniqueFilteredSqlStatements.push(ss);
				}
			});

			if (verbose) {
				console.log();
				console.log(
					withStyle.warning('You are about to execute current statements:'),
				);
				console.log();
				console.log(
					[...uniqueSqlStatementsToExecute, ...uniqueFilteredSqlStatements]
						.map((s) => chalk.blue(s))
						.join('\n'),
				);
				console.log();
			}

			if (!force && strict) {
				if (!shouldAskForApprove) {
					const { status, data } = await render(
						new Select(['No, abort', `Yes, I want to execute all statements`]),
					);
					if (data?.index === 0) {
						render(`[${chalk.red('x')}] All changes were aborted`);
						process.exit(0);
					}
				}
			}

			if (!force && shouldAskForApprove) {
				console.log(withStyle.warning('Found data-loss statements:'));
				console.log(infoToPrint.join('\n'));
				console.log();
				console.log(
					chalk.red.bold(
						'THIS ACTION WILL CAUSE DATA LOSS AND CANNOT BE REVERTED\n',
					),
				);

				console.log(chalk.white('Do you still want to push changes?'));

				const { status, data } = await render(
					new Select([
						'No, abort',
						`Yes, I want to${
							tablesToRemove.length > 0
								? ` remove ${tablesToRemove.length} ${tablesToRemove.length > 1 ? 'tables' : 'table'},`
								: ' '
						}${
							columnsToRemove.length > 0
								? ` remove ${columnsToRemove.length} ${columnsToRemove.length > 1 ? 'columns' : 'column'},`
								: ' '
						}${
							tablesToTruncate.length > 0
								? ` truncate ${tablesToTruncate.length} ${tablesToTruncate.length > 1 ? 'tables' : 'table'}`
								: ''
						}`
							.replace(/(^,)|(,$)/g, '')
							.replace(/ +(?= )/g, ''),
					]),
				);
				if (data?.index === 0) {
					render(`[${chalk.red('x')}] All changes were aborted`);
					process.exit(0);
				}
			}

			for (const dStmnt of uniqueSqlStatementsToExecute) {
				await db.query(dStmnt);
			}

			for (const statement of uniqueFilteredSqlStatements) {
				await db.query(statement);
			}
			if (filteredStatements.length > 0) {
				render(`[${chalk.green('✓')}] Changes applied`);
			} else {
				render(`[${chalk.blue('i')}] No changes detected`);
			}
		}
	} catch (e) {
		console.log(e);
	}
};

export const singlestorePush = async (
	schemaPath: string | string[],
	credentials: SingleStoreCredentials,
	tablesFilter: string[],
	strict: boolean,
	verbose: boolean,
	force: boolean,
) => {
	const { connectToSingleStore } = await import('../connections');
	const { singlestorePushIntrospect } = await import('./singlestoreIntrospect');

	const { db, database } = await connectToSingleStore(credentials);

	const { schema } = await singlestorePushIntrospect(db, database, tablesFilter);
	const { prepareSingleStorePush } = await import('./migrate');

	const statements = await prepareSingleStorePush(schemaPath, schema);

	const filteredStatements = singleStoreFilterStatements(
		statements.statements ?? [],
		statements.validatedCur,
		statements.validatedPrev,
	);

	try {
		if (filteredStatements.length === 0) {
			render(`[${chalk.blue('i')}] No changes detected`);
		} else {
			const {
				shouldAskForApprove,
				statementsToExecute,
				columnsToRemove,
				tablesToRemove,
				tablesToTruncate,
				infoToPrint,
				schemasToRemove,
			} = await singleStoreLogSuggestionsAndReturn(
				db,
				filteredStatements,
				statements.validatedCur,
			);

			const filteredSqlStatements = fromJson(filteredStatements, 'singlestore');

			const uniqueSqlStatementsToExecute: string[] = [];
			statementsToExecute.forEach((ss) => {
				if (!uniqueSqlStatementsToExecute.includes(ss)) {
					uniqueSqlStatementsToExecute.push(ss);
				}
			});
			const uniqueFilteredSqlStatements: string[] = [];
			filteredSqlStatements.forEach((ss) => {
				if (!uniqueFilteredSqlStatements.includes(ss)) {
					uniqueFilteredSqlStatements.push(ss);
				}
			});

			if (verbose) {
				console.log();
				// console.log(chalk.gray('Verbose logs:'));
				console.log(
					withStyle.warning('You are about to execute current statements:'),
				);
				console.log();
				console.log(
					[...uniqueSqlStatementsToExecute, ...uniqueFilteredSqlStatements]
						.map((s) => chalk.blue(s))
						.join('\n'),
				);
				console.log();
			}

			if (!force && strict) {
				if (!shouldAskForApprove) {
					const { status, data } = await render(
						new Select(['No, abort', `Yes, I want to execute all statements`]),
					);
					if (data?.index === 0) {
						render(`[${chalk.red('x')}] All changes were aborted`);
						process.exit(0);
					}
				}
			}

			if (!force && shouldAskForApprove) {
				console.log(withStyle.warning('Found data-loss statements:'));
				console.log(infoToPrint.join('\n'));
				console.log();
				console.log(
					chalk.red.bold(
						'THIS ACTION WILL CAUSE DATA LOSS AND CANNOT BE REVERTED\n',
					),
				);

				console.log(chalk.white('Do you still want to push changes?'));

				const { status, data } = await render(
					new Select([
						'No, abort',
						`Yes, I want to${
							tablesToRemove.length > 0
								? ` remove ${tablesToRemove.length} ${tablesToRemove.length > 1 ? 'tables' : 'table'},`
								: ' '
						}${
							columnsToRemove.length > 0
								? ` remove ${columnsToRemove.length} ${columnsToRemove.length > 1 ? 'columns' : 'column'},`
								: ' '
						}${
							tablesToTruncate.length > 0
								? ` truncate ${tablesToTruncate.length} ${tablesToTruncate.length > 1 ? 'tables' : 'table'}`
								: ''
						}`
							.replace(/(^,)|(,$)/g, '')
							.replace(/ +(?= )/g, ''),
					]),
				);
				if (data?.index === 0) {
					render(`[${chalk.red('x')}] All changes were aborted`);
					process.exit(0);
				}
			}

			for (const dStmnt of uniqueSqlStatementsToExecute) {
				await db.query(dStmnt);
			}

			for (const statement of uniqueFilteredSqlStatements) {
				await db.query(statement);
			}
			if (filteredStatements.length > 0) {
				render(`[${chalk.green('✓')}] Changes applied`);
			} else {
				render(`[${chalk.blue('i')}] No changes detected`);
			}
		}
	} catch (e) {
		console.log(e);
	}
};

export const pgPush = async (
	schemaPath: string | string[],
	verbose: boolean,
	strict: boolean,
	credentials: PostgresCredentials,
	tablesFilter: string[],
	schemasFilter: string[],
	force: boolean,
) => {
	const { preparePostgresDB } = await import('../connections');
	const { pgPushIntrospect } = await import('./pgIntrospect');

	const db = await preparePostgresDB(credentials);
	const { schema } = await pgPushIntrospect(db, tablesFilter, schemasFilter);

	const { preparePgPush } = await import('./migrate');

	const statements = await preparePgPush(schemaPath, schema, schemasFilter);

	try {
		if (statements.sqlStatements.length === 0) {
			render(`[${chalk.blue('i')}] No changes detected`);
		} else {
			// const filteredStatements = filterStatements(statements.statements);
			const {
				shouldAskForApprove,
				statementsToExecute,
				columnsToRemove,
				tablesToRemove,
				tablesToTruncate,
				infoToPrint,
				schemasToRemove,
			} = await pgSuggestions(db, statements.statements);

			if (verbose) {
				console.log();
				// console.log(chalk.gray('Verbose logs:'));
				console.log(
					withStyle.warning('You are about to execute current statements:'),
				);
				console.log();
				console.log(statementsToExecute.map((s) => chalk.blue(s)).join('\n'));
				console.log();
			}

			if (!force && strict) {
				if (!shouldAskForApprove) {
					const { status, data } = await render(
						new Select(['No, abort', `Yes, I want to execute all statements`]),
					);
					if (data?.index === 0) {
						render(`[${chalk.red('x')}] All changes were aborted`);
						process.exit(0);
					}
				}
			}

			if (!force && shouldAskForApprove) {
				console.log(withStyle.warning('Found data-loss statements:'));
				console.log(infoToPrint.join('\n'));
				console.log();
				console.log(
					chalk.red.bold(
						'THIS ACTION WILL CAUSE DATA LOSS AND CANNOT BE REVERTED\n',
					),
				);

				console.log(chalk.white('Do you still want to push changes?'));

				const { status, data } = await render(
					new Select([
						'No, abort',
						`Yes, I want to${
							tablesToRemove.length > 0
								? ` remove ${tablesToRemove.length} ${tablesToRemove.length > 1 ? 'tables' : 'table'},`
								: ' '
						}${
							columnsToRemove.length > 0
								? ` remove ${columnsToRemove.length} ${columnsToRemove.length > 1 ? 'columns' : 'column'},`
								: ' '
						}${
							tablesToTruncate.length > 0
								? ` truncate ${tablesToTruncate.length} ${tablesToTruncate.length > 1 ? 'tables' : 'table'}`
								: ''
						}`
							.replace(/(^,)|(,$)/g, '')
							.replace(/ +(?= )/g, ''),
					]),
				);
				if (data?.index === 0) {
					render(`[${chalk.red('x')}] All changes were aborted`);
					process.exit(0);
				}
			}

			for (const dStmnt of statementsToExecute) {
				await db.query(dStmnt);
			}

			if (statements.statements.length > 0) {
				render(`[${chalk.green('✓')}] Changes applied`);
			} else {
				render(`[${chalk.blue('i')}] No changes detected`);
			}
		}
	} catch (e) {
		console.error(e);
	}
};

export const sqlitePush = async (
	schemaPath: string | string[],
	verbose: boolean,
	strict: boolean,
	credentials: SqliteCredentials,
	tablesFilter: string[],
	force: boolean,
) => {
	const { connectToSQLite } = await import('../connections');
	const { sqlitePushIntrospect } = await import('./sqliteIntrospect');

	const db = await connectToSQLite(credentials);
	const { schema } = await sqlitePushIntrospect(db, tablesFilter);
	const { prepareSQLitePush } = await import('./migrate');

	const statements = await prepareSQLitePush(schemaPath, schema);

	if (statements.sqlStatements.length === 0) {
		render(`\n[${chalk.blue('i')}] No changes detected`);
	} else {
		const {
			shouldAskForApprove,
			statementsToExecute,
			columnsToRemove,
			tablesToRemove,
			tablesToTruncate,
			infoToPrint,
		} = await sqliteSuggestions(
			db,
			statements.statements,
			statements.squashedCur,
			statements.squashedPrev,
			statements.meta!,
		);

		if (verbose && statementsToExecute.length > 0) {
			console.log();
			console.log(
				withStyle.warning('You are about to execute current statements:'),
			);
			console.log();
			console.log(statementsToExecute.map((s) => chalk.blue(s)).join('\n'));
			console.log();
		}

		if (!force && strict) {
			if (!shouldAskForApprove) {
				const { status, data } = await render(
					new Select(['No, abort', `Yes, I want to execute all statements`]),
				);
				if (data?.index === 0) {
					render(`[${chalk.red('x')}] All changes were aborted`);
					process.exit(0);
				}
			}
		}

		if (!force && shouldAskForApprove) {
			console.log(withStyle.warning('Found data-loss statements:'));
			console.log(infoToPrint.join('\n'));
			console.log();
			console.log(
				chalk.red.bold(
					'THIS ACTION WILL CAUSE DATA LOSS AND CANNOT BE REVERTED\n',
				),
			);

			console.log(chalk.white('Do you still want to push changes?'));

			const { status, data } = await render(
				new Select([
					'No, abort',
					`Yes, I want to${
						tablesToRemove.length > 0
							? ` remove ${tablesToRemove.length} ${tablesToRemove.length > 1 ? 'tables' : 'table'},`
							: ' '
					}${
						columnsToRemove.length > 0
							? ` remove ${columnsToRemove.length} ${columnsToRemove.length > 1 ? 'columns' : 'column'},`
							: ' '
					}${
						tablesToTruncate.length > 0
							? ` truncate ${tablesToTruncate.length} ${tablesToTruncate.length > 1 ? 'tables' : 'table'}`
							: ''
					}`
						.trimEnd()
						.replace(/(^,)|(,$)/g, '')
						.replace(/ +(?= )/g, ''),
				]),
			);
			if (data?.index === 0) {
				render(`[${chalk.red('x')}] All changes were aborted`);
				process.exit(0);
			}
		}

		if (statementsToExecute.length === 0) {
			render(`\n[${chalk.blue('i')}] No changes detected`);
		} else {
			if (!('driver' in credentials)) {
				await db.query('begin');
				try {
					for (const dStmnt of statementsToExecute) {
						await db.query(dStmnt);
					}
					await db.query('commit');
				} catch (e) {
					console.error(e);
					await db.query('rollback');
					process.exit(1);
				}
			} else if (credentials.driver === 'turso') {
				await db.batch!(statementsToExecute.map((it) => ({ query: it })));
			}
			render(`[${chalk.green('✓')}] Changes applied`);
		}
	}
};
