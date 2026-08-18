const crypto = require('node:crypto');
const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, PutCommand, QueryCommand } = require('@aws-sdk/lib-dynamodb');

const TABLE_NAME = process.env.TABLE_NAME || '2048-leaderboard';
const SCORE_INDEX_NAME = process.env.SCORE_INDEX_NAME || 'ScoreIndex';
const GAME_TYPE = process.env.GAME_TYPE || 'classic';
const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN || 'https://play-2048.fozdigitalz.com';
const MAX_BODY_BYTES = 2048;
const MAX_SCORE = 100_000_000;

const client = new DynamoDBClient({});
const dynamodb = DynamoDBDocumentClient.from(client, {
    marshallOptions: { removeUndefinedValues: true }
});

function response(statusCode, body, extraHeaders = {}) {
    return {
        statusCode,
        headers: {
            'Content-Type': 'application/json; charset=utf-8',
            'Cache-Control': 'no-store',
            'Access-Control-Allow-Origin': ALLOWED_ORIGIN,
            'Access-Control-Allow-Headers': 'content-type,idempotency-key',
            'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
            'Vary': 'Origin',
            ...extraHeaders
        },
        body: JSON.stringify(body)
    };
}

function normalizeHeaders(headers = {}) {
    return Object.fromEntries(
        Object.entries(headers).map(([key, value]) => [key.toLowerCase(), value])
    );
}

function validateScoreSubmission(input) {
    if (!input || typeof input !== 'object' || Array.isArray(input)) {
        return { ok: false, error: 'Request body must be a JSON object' };
    }

    const playerName = typeof input.playerName === 'string'
        ? input.playerName.normalize('NFKC').trim()
        : '';
    const score = input.score;

    if (!playerName) {
        return { ok: false, error: 'Player name is required' };
    }

    if (playerName.length > 20 || !/^[\p{L}\p{N} _-]+$/u.test(playerName)) {
        return {
            ok: false,
            error: 'Player name must be 20 characters or fewer and contain only letters, numbers, spaces, hyphens, or underscores'
        };
    }

    if (typeof score !== 'number' || !Number.isSafeInteger(score) || score <= 0 || score > MAX_SCORE) {
        return { ok: false, error: `Score must be a whole number between 1 and ${MAX_SCORE}` };
    }

    return {
        ok: true,
        value: {
            playerName,
            score,
            isPersonalBest: input.isPersonalBest === true
        }
    };
}

function createSubmissionId(idempotencyKey) {
    const safeKey = typeof idempotencyKey === 'string'
        && idempotencyKey.length >= 16
        && idempotencyKey.length <= 128
        ? idempotencyKey
        : crypto.randomUUID();

    return `submission-${crypto.createHash('sha256').update(safeKey).digest('hex')}`;
}

async function getLeaderboard() {
    const result = await dynamodb.send(new QueryCommand({
        TableName: TABLE_NAME,
        IndexName: SCORE_INDEX_NAME,
        KeyConditionExpression: 'game_type = :gameType',
        ExpressionAttributeValues: { ':gameType': GAME_TYPE },
        ProjectionExpression: 'id, playerName, score, #ts',
        ExpressionAttributeNames: { '#ts': 'timestamp' },
        ScanIndexForward: false,
        Limit: 10
    }));

    return result.Items || [];
}

exports.handler = async (event) => {
    const requestId = event.requestContext?.requestId || crypto.randomUUID();
    const httpMethod = event.requestContext?.http?.method || event.httpMethod;
    const path = event.rawPath || event.path || '';

    console.log(JSON.stringify({
        level: 'INFO',
        message: 'Leaderboard request received',
        requestId,
        httpMethod,
        path
    }));

    try {
        if (httpMethod === 'OPTIONS') {
            return response(204, {});
        }

        if (httpMethod === 'GET' && path.endsWith('/leaderboard')) {
            const leaderboard = await getLeaderboard();
            const publicLeaderboard = leaderboard.map(({ playerName, score }) => ({
                playerName,
                score
            }));
            return response(200, publicLeaderboard, {
                'Cache-Control': 'public, max-age=15'
            });
        }

        if (httpMethod === 'POST' && path.endsWith('/score')) {
            const rawBody = event.body || '';
            if (Buffer.byteLength(rawBody, 'utf8') > MAX_BODY_BYTES) {
                return response(413, { error: 'Request body is too large' });
            }

            let parsedBody;
            try {
                parsedBody = JSON.parse(rawBody || '{}');
            } catch {
                return response(400, { error: 'Request body must contain valid JSON' });
            }

            const validation = validateScoreSubmission(parsedBody);
            if (!validation.ok) {
                return response(400, { error: validation.error });
            }

            const headers = normalizeHeaders(event.headers);
            const id = createSubmissionId(headers['idempotency-key']);
            const timestamp = new Date().toISOString();

            try {
                await dynamodb.send(new PutCommand({
                    TableName: TABLE_NAME,
                    Item: {
                        id,
                        ...validation.value,
                        game_type: GAME_TYPE,
                        timestamp
                    },
                    ConditionExpression: 'attribute_not_exists(id)'
                }));
            } catch (error) {
                if (error.name !== 'ConditionalCheckFailedException') {
                    throw error;
                }
            }

            const leaderboard = await getLeaderboard();
            const rankIndex = leaderboard.findIndex((entry) => entry.id === id);
            const rank = rankIndex >= 0 ? rankIndex + 1 : null;

            return response(rank ? 201 : 202, {
                saved: true,
                added: rank !== null,
                rank,
                message: rank
                    ? `Score saved at leaderboard rank ${rank}`
                    : 'Score saved but is not currently in the top 10'
            });
        }

        return response(404, { error: 'Not found' });
    } catch (error) {
        console.error(JSON.stringify({
            level: 'ERROR',
            message: 'Leaderboard request failed',
            requestId,
            errorName: error.name,
            errorMessage: error.message
        }));

        return response(500, { error: 'Internal server error', requestId });
    }
};

exports.validateScoreSubmission = validateScoreSubmission;
exports.createSubmissionId = createSubmissionId;
