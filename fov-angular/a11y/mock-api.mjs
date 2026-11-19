export const API_ORIGIN = 'http://localhost:4000';

const stream = (streamId, title, streamer, category, description = '') => ({
  streamId,
  trackCount: 2,
  tracks: [],
  title,
  description,
  visibility: 'public',
  category,
  viewers: 3,
  streamer,
  streamerUsername: streamer,
  avatarUrl: '',
  thumbnailUrl: '',
});

const profile = (username) => ({
  id: username === 'lucas' ? 1 : 2,
  username,
  email: `${username}@example.com`,
  bio: 'Streamer multi-flux',
  avatarUrl: '',
  bannerUrl: '',
  followersCount: 2,
  followingCount: 1,
  isFollowing: false,
});

const streams = [
  stream('u1', 'Le stream de lucas', 'lucas', 'Just Chatting', "C'est un super stream !"),
  stream('u2', 'Speedrun Mario', 'bob', 'Mario'),
];

const categories = [
  { name: 'Just Chatting', viewers: '120K', image: '/category.png' },
  { name: 'Mario', viewers: '4K', image: '/category.png' },
];

const streamSettings = {
  streamId: 'u1',
  title: 'Le stream de lucas',
  description: "C'est un super stream !",
  visibility: 'public',
  thumbnailUrl: '',
  categoryId: 1,
  category: 'Just Chatting',
  streamKey: 'fov_secret',
  isLive: true,
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
};

const ok = (body) => ({ status: 200, body });
const error = (status, message) => ({ status, body: { error: message } });

export function mockApi(url, method) {
  const path = new URL(url).pathname.replace(/^\/api/, '');

  if (path === '/auth/login') return error(401, 'Identifiants invalides');
  if (path === '/auth/register') return error(409, "Ce nom d'utilisateur est déjà pris");
  if (path === '/streams/available') return ok(streams);
  if (path.startsWith('/twitch/top-categories')) return ok(categories);
  if (path === '/categories') return ok([{ id: 1, name: 'Just Chatting' }, { id: 2, name: 'Mario' }]);
  if (path === '/users') return ok([{ username: 'lucas', avatarUrl: '' }, { username: 'bob', avatarUrl: '' }]);
  if (path === '/users/me/following') return ok([profile('lucas')]);
  if (path === '/users/me/password') return error(400, 'Mot de passe actuel incorrect');
  if (path === '/users/me') return ok(profile('lucas'));
  if (path === '/streams/me/stream-key/rotate') return ok({ streamKey: 'fov_rotated' });
  if (path === '/streams/me/stream-key') return ok({ streamKey: 'fov_secret' });
  if (path === '/streams/me') return ok(streamSettings);
  if (path.startsWith('/chat/')) return ok([]);
  if (/^\/streams\/[^/]+\/viewers/.test(path)) return ok({ total: 3, authenticated: 1, anonymous: 2 });
  if (/^\/users\/[^/]+\/follow$/.test(path)) return ok({ following: method === 'POST', followersCount: 3 });
  if (/^\/users\/[^/]+$/.test(path)) return ok(profile(decodeURIComponent(path.split('/')[2])));

  return error(404, 'Not mocked');
}
