const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, PutCommand, QueryCommand } = require('@aws-sdk/lib-dynamodb');

const client = new DynamoDBClient({});
const dynamodb = DynamoDBDocumentClient.from(client);

exports.handler = async (event) => {
    const headers = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS'
    };

    try {
        // Handle both API Gateway v1 and v2 formats
        const httpMethod = event.httpMethod || event.requestContext?.http?.method;
        const path = event.path || event.rawPath || event.routeKey;
        
        console.log('Event:', JSON.stringify(event, null, 2));
        console.log('Method:', httpMethod, 'Path:', path);

        if (httpMethod === 'OPTIONS') {
            return { statusCode: 200, headers };
        }

        if (httpMethod === 'GET' && (path === '/leaderboard' || path?.endsWith('/leaderboard'))) {
            // Get top 10 scores
            const params = {
                TableName: '2048-leaderboard',
                IndexName: 'ScoreIndex',
                KeyConditionExpression: 'game_type = :gt',
                ExpressionAttributeValues: {
                    ':gt': 'classic'
                },
                ScanIndexForward: false,
                Limit: 10
            };

            const result = await dynamodb.send(new QueryCommand(params));
            return {
                statusCode: 200,
                headers,
                body: JSON.stringify(result.Items)
            };
        }

        if (httpMethod === 'POST' && (path === '/score' || path?.endsWith('/score'))) {
            // Submit new score
            const requestBody = event.body || '{}';
            const body = JSON.parse(requestBody);
            const { playerName, score, isPersonalBest } = body;

            console.log('Parsed body:', body);

            if (!playerName || !score) {
                return {
                    statusCode: 400,
                    headers,
                    body: JSON.stringify({ error: 'Missing playerName or score' })
                };
            }

            const scoreValue = parseInt(score);
            const playerNameStr = playerName.toString();

            // For personal bests, always save
            if (isPersonalBest) {
                const params = {
                    TableName: '2048-leaderboard',
                    Item: {
                        id: Date.now().toString() + '-' + Math.random().toString(36).substr(2, 9),
                        playerName: playerNameStr,
                        score: scoreValue,
                        game_type: 'classic',
                        timestamp: new Date().toISOString(),
                        isPersonalBest: true
                    }
                };
                await dynamodb.send(new PutCommand(params));
                return {
                    statusCode: 201,
                    headers,
                    body: JSON.stringify({ message: 'Personal best saved successfully', added: true })
                };
            }

            // For manual submissions, check if score qualifies for leaderboard
            const leaderboardParams = {
                TableName: '2048-leaderboard',
                IndexName: 'ScoreIndex',
                KeyConditionExpression: 'game_type = :gt',
                ExpressionAttributeValues: {
                    ':gt': 'classic'
                },
                ScanIndexForward: false,
                Limit: 10
            };

            const leaderboard = await dynamodb.send(new QueryCommand(leaderboardParams));
            const currentScores = leaderboard.Items || [];
            
            // Check if score qualifies (top 10 or better than lowest)
            let shouldAdd = false;
            let rank = 1;
            
            if (currentScores.length < 10) {
                shouldAdd = true;
                rank = currentScores.filter(item => item.score > scoreValue).length + 1;
            } else {
                const lowestScore = currentScores[currentScores.length - 1].score;
                if (scoreValue > lowestScore) {
                    shouldAdd = true;
                    rank = currentScores.filter(item => item.score > scoreValue).length + 1;
                }
            }

            if (shouldAdd) {
                const params = {
                    TableName: '2048-leaderboard',
                    Item: {
                        id: Date.now().toString() + '-' + Math.random().toString(36).substr(2, 9),
                        playerName: playerNameStr,
                        score: scoreValue,
                        game_type: 'classic',
                        timestamp: new Date().toISOString(),
                        isPersonalBest: false
                    }
                };
                await dynamodb.send(new PutCommand(params));
                return {
                    statusCode: 201,
                    headers,
                    body: JSON.stringify({ 
                        message: 'Score submitted successfully', 
                        added: true, 
                        rank: rank 
                    })
                };
            } else {
                return {
                    statusCode: 200,
                    headers,
                    body: JSON.stringify({ 
                        message: 'Score received but not high enough for leaderboard', 
                        added: false 
                    })
                };
            }
        }

        return {
            statusCode: 404,
            headers,
            body: JSON.stringify({ error: 'Not found' })
        };

    } catch (error) {
        console.error('Error:', error);
        return {
            statusCode: 500,
            headers,
            body: JSON.stringify({ error: 'Internal server error' })
        };
    }
};