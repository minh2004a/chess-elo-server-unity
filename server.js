require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { pool, initSchema } = require('./db');
const { computeElo } = require('./elo');

const app = express();
app.use(cors());
app.use(express.json());

const PLAYER_COLS = 'id, display_name, rating, games, wins, losses, draws';

// Health check (Render pings this).
app.get('/health', (req, res) => res.json({ ok: true }));

// ── Anonymous login: find-or-create a player by device id ──────────────
app.post('/auth/anon', async (req, res) => {
  const { deviceId, displayName } = req.body || {};
  if (!deviceId || typeof deviceId !== 'string')
    return res.status(400).json({ error: 'deviceId required' });
  const name = (displayName && String(displayName).trim()) || 'Player';

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const found = await client.query(
      'SELECT player_id FROM auth_identities WHERE provider=$1 AND external_id=$2',
      ['device', deviceId]
    );

    let playerId;
    if (found.rows.length === 0) {
      const ins = await client.query(
        'INSERT INTO players(display_name) VALUES($1) RETURNING id',
        [name]
      );
      playerId = ins.rows[0].id;
      await client.query(
        'INSERT INTO auth_identities(provider, external_id, player_id) VALUES($1,$2,$3)',
        ['device', deviceId, playerId]
      );
    } else {
      playerId = found.rows[0].player_id;
      await client.query(
        'UPDATE players SET display_name=$1, updated_at=now() WHERE id=$2',
        [name, playerId]
      );
    }

    const p = await client.query(`SELECT ${PLAYER_COLS} FROM players WHERE id=$1`, [playerId]);
    await client.query('COMMIT');
    res.json(p.rows[0]);
  } catch (e) {
    await client.query('ROLLBACK');
    console.error('[auth/anon]', e);
    res.status(500).json({ error: 'server error' });
  } finally {
    client.release();
  }
});

// ── Get a single player ────────────────────────────────────────────────
app.get('/player/:id', async (req, res) => {
  try {
    const r = await pool.query(`SELECT ${PLAYER_COLS} FROM players WHERE id=$1`, [req.params.id]);
    if (r.rows.length === 0) return res.status(404).json({ error: 'not found' });
    res.json(r.rows[0]);
  } catch (e) {
    console.error('[player]', e);
    res.status(500).json({ error: 'server error' });
  }
});

// ── Report a match: server computes ELO; idempotent by matchId ─────────
app.post('/match/report', async (req, res) => {
  const { matchId, whiteId, blackId, result } = req.body || {};
  if (!matchId || !whiteId || !blackId || !['white_win', 'black_win', 'draw'].includes(result))
    return res.status(400).json({ error: 'matchId, whiteId, blackId, valid result required' });
  if (whiteId === blackId)
    return res.status(400).json({ error: 'players must differ' });

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Already counted? (both clients may report the same match)
    const existing = await client.query('SELECT * FROM matches WHERE match_id=$1', [matchId]);
    if (existing.rows.length > 0) {
      await client.query('COMMIT');
      const m = existing.rows[0];
      return res.json({
        alreadyProcessed: true,
        white: { id: m.white_id, ratingAfter: m.white_rating_after },
        black: { id: m.black_id, ratingAfter: m.black_rating_after },
      });
    }

    // Lock both player rows to avoid races.
    const w = await client.query('SELECT * FROM players WHERE id=$1 FOR UPDATE', [whiteId]);
    const b = await client.query('SELECT * FROM players WHERE id=$1 FOR UPDATE', [blackId]);
    if (w.rows.length === 0 || b.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'player not found' });
    }
    const wp = w.rows[0], bp = b.rows[0];

    const { whiteAfter, blackAfter } =
      computeElo(wp.rating, bp.rating, wp.games, bp.games, result);

    const draw = result === 'draw';
    const wWin = result === 'white_win';
    const bWin = result === 'black_win';

    await client.query(
      `UPDATE players SET rating=$1, games=games+1,
         wins=wins+$2, losses=losses+$3, draws=draws+$4, updated_at=now() WHERE id=$5`,
      [whiteAfter, wWin ? 1 : 0, bWin ? 1 : 0, draw ? 1 : 0, whiteId]
    );
    await client.query(
      `UPDATE players SET rating=$1, games=games+1,
         wins=wins+$2, losses=losses+$3, draws=draws+$4, updated_at=now() WHERE id=$5`,
      [blackAfter, bWin ? 1 : 0, wWin ? 1 : 0, draw ? 1 : 0, blackId]
    );
    await client.query(
      `INSERT INTO matches(match_id, white_id, black_id, result,
         white_rating_before, black_rating_before, white_rating_after, black_rating_after)
       VALUES($1,$2,$3,$4,$5,$6,$7,$8)`,
      [matchId, whiteId, blackId, result, wp.rating, bp.rating, whiteAfter, blackAfter]
    );

    await client.query('COMMIT');
    res.json({
      white: { id: whiteId, ratingBefore: wp.rating, ratingAfter: whiteAfter },
      black: { id: blackId, ratingBefore: bp.rating, ratingAfter: blackAfter },
    });
  } catch (e) {
    await client.query('ROLLBACK');
    console.error('[match/report]', e);
    res.status(500).json({ error: 'server error' });
  } finally {
    client.release();
  }
});

// ── Leaderboard ────────────────────────────────────────────────────────
app.get('/leaderboard', async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit, 10) || 20, 100);
    const r = await pool.query(
      `SELECT ${PLAYER_COLS} FROM players ORDER BY rating DESC, games DESC LIMIT $1`,
      [limit]
    );
    res.json(r.rows);
  } catch (e) {
    console.error('[leaderboard]', e);
    res.status(500).json({ error: 'server error' });
  }
});

const PORT = process.env.PORT || 3000;
initSchema()
  .then(() => app.listen(PORT, () => console.log(`[server] listening on ${PORT}`)))
  .catch((err) => {
    console.error('[db] init failed:', err);
    process.exit(1);
  });
