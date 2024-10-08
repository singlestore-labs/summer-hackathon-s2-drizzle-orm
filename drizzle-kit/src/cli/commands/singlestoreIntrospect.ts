import { renderWithTask } from 'hanji';
import { Minimatch } from 'minimatch';
import { originUUID } from '../../global';
import type { SingleStoreSchema } from '../../serializer/singlestoreSchema';
import { fromDatabase } from '../../serializer/singlestoreSerializer';
import type { DB } from '../../utils';
import { ProgressView } from '../views';

export const singlestorePushIntrospect = async (
	db: DB,
	databaseName: string,
	filters: string[],
) => {
	const matchers = filters.map((it) => {
		return new Minimatch(it);
	});

	const filter = (tableName: string) => {
		if (matchers.length === 0) return true;

		let flags: boolean[] = [];

		for (let matcher of matchers) {
			if (matcher.negate) {
				if (!matcher.match(tableName)) {
					flags.push(false);
				}
			}

			if (matcher.match(tableName)) {
				flags.push(true);
			}
		}

		if (flags.length > 0) {
			return flags.every(Boolean);
		}
		return false;
	};

	const progress = new ProgressView(
		'Pulling schema from database...',
		'Pulling schema from database...',
	);
	const res = await renderWithTask(
		progress,
		fromDatabase(db, databaseName, filter),
	);

	const schema = { id: originUUID, prevId: '', ...res } as SingleStoreSchema;
	const { internal, ...schemaWithoutInternals } = schema;
	return { schema: schemaWithoutInternals };
};
