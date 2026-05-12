import express from 'express';
import fetch from 'node-fetch';
const router = express.Router();

const CLIENT_ID = process.env.TWITCH_ID;
const CLIENT_SECRET = process.env.TWITCH_SECRET;

const TOKEN_URL = 'https://id.twitch.tv/oauth2/token';
const API_URL = 'https://api.twitch.tv/helix';

let accessToken = null;
let tokenExpiry = 0;
let tokenPromise = null;

// Get access token from Twitch
async function getAccessToken() {
    // Return cached token if still valid
    if (accessToken && Date.now() < tokenExpiry) {
        return accessToken;
    }

    // Return existing promise if token request is in progress
    if (tokenPromise) {
        return tokenPromise;
    }

    tokenPromise = (async () => {
        try {
            const body = new URLSearchParams();
            body.append('client_id', CLIENT_ID);
            body.append('client_secret', CLIENT_SECRET);
            body.append('grant_type', 'client_credentials');

            const response = await fetch(TOKEN_URL, {
                method: 'POST',
                body: body.toString(),
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
            });

            if (!response.ok) {
                throw new Error(`Token request failed: ${response.statusText}`);
            }

            const data = await response.json();
            accessToken = data.access_token;
            tokenExpiry = Date.now() + (data.expires_in - 300) * 1000;
            tokenPromise = null;
            return accessToken;
        } catch (error) {
            console.error('Error getting Twitch token:', error);
            tokenPromise = null;
            throw error;
        }
    })();

    return tokenPromise;
}

// GET /api/twitch/top-categories
router.get('/top-categories', async (req, res, next) => {
    try {
        const limit = req.query.limit || 30;
        const token = await getAccessToken();

        const response = await fetch(`${API_URL}/games/top?first=${limit}`, {
            headers: {
                'Client-ID': CLIENT_ID,
                'Authorization': `Bearer ${token}`
            }
        });

        if (!response.ok) {
            throw new Error(`Twitch API error: ${response.statusText}`);
        }

        const data = await response.json();
        const categories = data.data.map(game => ({
            name: game.name,
            viewers: '',
            image: game.box_art_url
                .replace('{width}', '285')
                .replace('{height}', '380')
        }));

        res.json(categories);
    } catch (error) {
        console.error('Error fetching top categories:', error);
        next(error);
    }
});

export function resetTokenCache() {
    accessToken = null;
    tokenExpiry = 0;
    tokenPromise = null;
}

export { getAccessToken };
export default router;
