import Docker from 'dockerode';
import mysql2 from 'mysql2/promise';
import { v4 as uuid } from 'uuid';
import getPort from 'get-port';
import retry from 'async-retry';
import { drizzle } from 'drizzle-orm/singlestore';

const ENABLE_LOGGING = false;
let db;
let client;

async function createDockerDB() {
    const docker = new Docker();
    const port = await getPort({ port: 3306 });
    const image = 'ghcr.io/singlestore-labs/singlestoredb-dev:latest';

    const pullStream = await docker.pull(image);
    await new Promise((resolve, reject) =>
        docker.modem.followProgress(pullStream, (err) => (err ? reject(err) : resolve()))
    );

    const singlestoreContainer = await docker.createContainer({
        Image: image,
        Env: ['ROOT_PASSWORD=singlestore'],
        name: `drizzle-integration-tests-${uuid()}`,
        HostConfig: {
            AutoRemove: true,
            PortBindings: {
                '3306/tcp': [{ HostPort: `${port}` }],
            },
        },
    });

    await singlestoreContainer.start();
    await new Promise((resolve) => setTimeout(resolve, 5000)); // Delay to ensure container is ready

    return {
        connectionString: `mysql://root:singlestore@localhost:${port}/`,
        container: singlestoreContainer,
    };
}

async function runTest() {
    let connectionString;
	let container;
    if (process.env['SINGLESTORE_CONNECTION_STRING']) {
        connectionString = process.env['SINGLESTORE_CONNECTION_STRING'];
    } else {
        const { connectionString: conStr, container: con } = await createDockerDB();
        connectionString = conStr;
		container = con;
    }

    try {
        // Establish initial connection to create the database
        client = await retry(async () => {
            client = await mysql2.createConnection(connectionString);
            await client.connect();
            return client;
        }, {
            retries: 20,
            factor: 1,
            minTimeout: 250,
            maxTimeout: 250,
            randomize: false,
            onRetry() {
                client?.end();
            },
        });

        // Create the database if it does not exist
        await client.query(`CREATE DATABASE IF NOT EXISTS drizzle;`);
        console.log('Database "drizzle" created or already exists.');

        // Reconnect to the specific database
        await client.changeUser({ database: 'drizzle' });
        console.log('Switched to database "drizzle".');

        db = drizzle(client, { logger: ENABLE_LOGGING });
        console.log('Test run: Database connection established.');

        await client?.end();
		await container?.stop().catch(console.error);
        console.log('Test run: Connection closed.');
        return true;
    } catch (error) {
		await container?.stop().catch(console.error);
        console.error('Test run: An error occurred:', error);
        return false;
    }
}

async function main() {
    const results = { success: 0, failure: 0 };

    for (let i = 0; i < 10; i++) {
        console.log(`Running test iteration ${i + 1}...`);
        const result = await runTest();
        if (result) {
            results.success += 1;
            console.log(`Iteration ${i + 1}: Success`);
        } else {
            results.failure += 1;
            console.log(`Iteration ${i + 1}: Failure`);
        }
    }

    console.log(`Test results: ${results.success} succeeded, ${results.failure} failed.`);
}

main().catch((error) => {
    console.error('An error occurred during the test run:', error);
});
