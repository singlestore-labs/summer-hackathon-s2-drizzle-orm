import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Consolidated list of test names to skip
const testsToSkip = [
    // Nested Scalar Subselects in Project List
    "[Find Many] Get users with posts + limit posts",
    "[Find Many] Get users with posts + limit posts and users",
    "[Find Many] Get users with posts + custom fields + limits",
    "[Find Many] Get users with posts + orderBy",
    "[Find One] Get users with posts + limit posts",
    "[Find One] Get users with posts + limit posts and users",
    "[Find One] Get users with posts + custom fields + limits",
    "[Find One] Get users with posts + orderBy",
    "Get user with invitee",
    "Get user + limit with invitee",
    "Get user with invitee and custom fields",
    "Get user with invitee and custom fields + limits",
    "Get user with invitee + order by",
    "Get user with invitee + where",
    "Get user with invitee + where + partial",
    "Get user with invitee + where + partial. Did not select users id, but used it in where",
    "Get user with invitee + where + partial(true+false)",
    "Get user with invitee + where + partial(false)",
    "Get user with invitee and posts",
    "Get user with invitee and posts + limit posts and users",
    "Get user with invitee and posts + limits + custom fields in each",
    "Get user with invitee and posts + custom fields in each",
    "Get user with invitee and posts + orderBy",
    "Get user with invitee and posts + where",
    "Get user with invitee and posts + limit posts and users + where",
    "Get user with invitee and posts + orderBy + where + custom",
    "Get user with invitee and posts + orderBy + where + partial + custom",
    "[Find Many] Get users with posts + prepared limit",
    "[Find Many] Get users with posts + prepared limit + offset",
    "[Find Many] Get users with posts + prepared + limit + offset + where",
    "[Find One] Get users with posts",
    "[Find One] Get users with posts + limit posts and users",
    "[Find One] Get users with posts + custom fields",
    "[Find One] Get users with posts + orderBy",

    // Subselect in Aggregate Functions
    "Get user with posts and posts with comments",
    "Get user with posts and posts with comments and comments with owner",
    "Get user with posts and posts with comments and comments with owner where exists",
    "[Find Many] Get users with groups",
    "[Find Many] Get groups with users",
    "[Find Many] Get users with groups + limit",
    "[Find Many] Get groups with users + limit",
    "[Find Many] Get users with groups + limit + where",
    "[Find Many] Get groups with users + limit + where",
    "[Find Many] Get users with groups + where",
    "[Find Many] Get groups with users + where",
    "[Find Many] Get users with groups + orderBy",
    "[Find Many] Get groups with users + orderBy",
    "[Find Many] Get users with groups + orderBy + limit",
    "[Find One] Get users with groups",
    "[Find One] Get groups with users",
    "[Find One] Get users with groups + limit",
    "[Find One] Get groups with users + limit",
    "[Find One] Get users with groups + limit + where",
    "[Find One] Get groups with users + limit + where",
    "[Find One] Get users with groups + where",
    "[Find One] Get groups with users + where",
    "[Find One] Get users with groups + orderBy",
    "[Find One] Get groups with users + orderBy",
    "[Find One] Get users with groups + orderBy + limit",
    "Get groups with users + orderBy + limit",
    "Get users with groups + custom",
    "Get groups with users + custom",
];

// Remove duplicate test names, if any
const uniqueTestsToSkip = [...new Set(testsToSkip)];

// List of test files to process
const testFiles = [
    'singlestore.test.ts',
    // Add other test files if necessary
];

// Function to escape RegExp special characters
function escapeRegExp(string) {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

testFiles.forEach(file => {
    const filePath = path.join(__dirname, file);
    fs.readFile(filePath, 'utf8', (err, data) => {
        if (err) {
            console.error(`Error reading ${filePath}:`, err);
            return;
        }

        let modifiedData = data;

        uniqueTestsToSkip.forEach(testName => {
            // Create regex to match test or it with exact test name
            // This regex matches lines like: test('Test Name', () => { ... })
            // or it('Test Name', () => { ... })
            const regex = new RegExp(`(test|it)\\(['"\`]${escapeRegExp(testName)}['"\`],`, 'g');
            const replacement = `$1.skip('${testName}',`;
            modifiedData = modifiedData.replace(regex, replacement);
        });

        fs.writeFile(filePath, modifiedData, 'utf8', err => {
            if (err) {
                console.error(`Error writing ${filePath}:`, err);
                return;
            }
            console.log(`Skipped ${uniqueTestsToSkip.length} tests in ${file}`);
        });
    });
});