// Standard ELO. Score: win = 1, draw = 0.5, loss = 0.

function expectedScore(ratingA, ratingB) {
  return 1 / (1 + Math.pow(10, (ratingB - ratingA) / 400));
}

// Higher K while a player is new (provisional), then settle.
function kFactor(games) {
  return games < 20 ? 32 : 16;
}

// result: 'white_win' | 'black_win' | 'draw'
// Returns { whiteAfter, blackAfter } as integers.
function computeElo(whiteRating, blackRating, whiteGames, blackGames, result) {
  const sWhite = result === 'white_win' ? 1 : result === 'draw' ? 0.5 : 0;
  const sBlack = 1 - sWhite;

  const eWhite = expectedScore(whiteRating, blackRating);
  const eBlack = expectedScore(blackRating, whiteRating);

  const whiteAfter = Math.round(whiteRating + kFactor(whiteGames) * (sWhite - eWhite));
  const blackAfter = Math.round(blackRating + kFactor(blackGames) * (sBlack - eBlack));

  return { whiteAfter, blackAfter };
}

module.exports = { computeElo, expectedScore, kFactor };
