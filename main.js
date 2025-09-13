// Taken from one of the nuzlocke.app files
const LegacyDamageClassMap = {
  "normal": "physical", "fighting": "physical", "flying": "physical", "poison": "physical", "ground": "physical", "rock": "physical", "bug": "physical", "ghost": "physical", "steel": "physical",
  "fire": "special", "water": "special", "grass": "special", "electric": "special", "psychic": "special", "ice": "special", "dragon": "special", "dark": "special",
}

const parentDir = __dirname + "\\..";

const fs = require('fs');
const path = require('path');

// Various directories we need
const dataDir = `${parentDir}\\nuzlocke.data`;
const staticDir = `${parentDir}\\nuzlocke.app\\src\\routes\\assets\\data`;
const pokemonPath = `${parentDir}\\nuzlocke.app\\src\\routes\\api\\pokemon.json\\_pokemon.json`

const gameFileDir = `${parentDir}\\nuzlocke.app\\src\\lib\\data`;
const gamesPath = path.join(gameFileDir, 'games.json');

// Parse games.json into an array
const rawGames = JSON.parse(fs.readFileSync(gamesPath, 'utf-8'));
const games = Object.values(rawGames.games || rawGames);

const leaguesDir = path.join(dataDir, 'leagues');
const outputPath = path.join(dataDir, 'league.json');
const tempPath = path.join(dataDir, 'tempLeague.json');

const parseLeaderHeader = (line) => {
  const [index, name, specialty = '', imageInfo = ''] = line.split('|'); // Default specialty to empty string
  const [img, creditName, creditUrl] = imageInfo.split('#')[0].split('@');
  return {
    key: `${index.replace('--', '').trim()}`,
    name: name.trim(),
    specialty: specialty.trim(),
    img: img.trim().split('#')[0],
    imgAuthor: creditName?.trim(),
    imgLink: creditUrl?.trim()
  };
};

// Double battles, items, etc.
const parseOptions = (line) => {
  if (!line || !line.startsWith("==")) return {};
  return line.split('|').reduce((acc, entry) => {

    if (entry.startsWith("=="))
      entry = entry.substring(2);

    const [key, value] = entry.includes("=") ? entry.split('=') : entry.split(":");

    var updatedKey = key.trim();
    if (key == "double") updatedKey = "doubleBattle";
    if (key == "tag") updatedKey = "tagBattle";

    var updatedValue = value.trim();
    if (updatedKey == "doubleBattle" || updatedKey == "tagBattle") updatedValue = value.includes("true");

    acc[updatedKey] = updatedValue;
    return acc;
  }, {});
};

const parsePokemonLine = (line) => {
  let hasEVs = line.includes('@');
  let [namePart, levelPart, moves, ability = '', held, starter, tera] = line.split('|');

  let [name, sprite] = namePart.split('>');
  let level = levelPart.includes('@') ? levelPart.split('@')[0] : levelPart;
  let evs = levelPart.includes('@') ? levelPart.split('@')[1].split(',') : undefined;

  return {
    name: name.trim(),
    level: level.trim(),
    moves: moves.split(',').map(m => m.trim()),
    ...(ability ? { ability: ability.split('/')[0].trim() } : {}),
    ...(tera ? { tera: tera.trim() } : {}),
    ...(held ? { held: held.trim() } : {}),
    ...(sprite ? { sprite: sprite.trim() } : {}),
    ...(starter ? { starter: starter.trim() } : {}),
    ...(hasEVs ? { evs: evs.map(e => parseInt(e.trim(), 10)) } : {})
  };
};

const parseLeagueFile = (content) => {
  const blocks = [];
  let currentBlock = [];

  const lines = content.split('\n');

  if (content.startsWith("### DEV ###"))
    return {};

  lines.forEach(line => {
    line = line.trim();

    // Ignore comment lines
    if (line.startsWith('#') || line === '') {
      return;
    }

    // Start a new block when a line starts with '--'
    if (line.startsWith('--')) {
      // If there's an existing block, push it to the blocks array
      if (currentBlock.length > 0) {
        blocks.push(currentBlock);
        currentBlock = [];
      }
    }

    currentBlock.push(line);
  });

  // Trailing block to add
  if (currentBlock.length > 0) {
    blocks.push(currentBlock);
  }

  const output = {};

  for (const block of blocks) {

    var [leaderLine, optionLine, ...pokemonLines] = block;
    const leader = parseLeaderHeader(leaderLine);

    var options = {};
    var pokemon = [];

    if (optionLine && optionLine.startsWith("==")) {
      options = parseOptions(optionLine);
      pokemon = pokemonLines.map(parsePokemonLine);
    } else if (optionLine) {
      pokemonLines = [optionLine, ...pokemonLines];
      pokemon = pokemonLines.map(parsePokemonLine);
    }

    output[leader.key] = {
      name: leader.name.split('#')[0],
      speciality: leader.specialty,
      ...(leader.img ? { img: leader.img } : {}),
      ...(leader.imgAuthor && leader.imgLink ? {
        img: {
          src: leader.img,
          author: leader.imgAuthor,
          link: leader.imgLink
        }
      } : {}),
      pokemon,
      ...options
    };
  }

  return output;
};

const leagueFiles = fs.readdirSync(leaguesDir).filter(f => f.endsWith('.txt') || f.endsWith('.league'));

let finalOutput = {};

for (const file of leagueFiles) {
  const fullPath = path.join(leaguesDir, file);
  const content = fs.readFileSync(fullPath, 'utf-8');
  const parsed = parseLeagueFile(content);

  if (parsed == {})
    continue;

  const fileKey = path.basename(file, path.extname(file));
  finalOutput[fileKey] = parsed;
}

// Up to this point matches league.json

// Load augmenting data
const patches = JSON.parse(fs.readFileSync(path.join(dataDir, 'patches.json'), 'utf8'));
const basePokemon = Object.values(JSON.parse(fs.readFileSync(pokemonPath, 'utf8')));
const baseItems = JSON.parse(fs.readFileSync(path.join(staticDir, 'items.json'), 'utf8'));
const baseAbilities = Object.values(JSON.parse(fs.readFileSync(path.join(staticDir, 'abilities.json'), 'utf8')));
const rawMovesData = Object.values(JSON.parse(fs.readFileSync(path.join(staticDir, 'moves.json'), 'utf8')));

// Merge helpers
const getPokemonData = (league, name) => {
  if (patches[league]?.fakemon[name]) return patches[league].fakemon[name];

  const patch = patches[league]?.pokemon[name] || {};
  const base = basePokemon.find(x => x.alias == name) || {};
  return { ...base, ...patch };
};

const getItemData = (league, slug) => {
  if (!slug) return null;

  const patch = patches[league]?.item?.[slug] || {};
  const base = baseItems[slug];
  const combined = { ...(base || {}), ...patch };

  if (!combined.name) return null;

  return {
    ...(combined.sprite ? { sprite: combined.sprite } : {}),
    name: combined.name,
    effect: combined.description || ""
  };
};

const getAbilityData = (league, slug) => {
  if (!slug) return null;

  const patch = patches[league]?.ability?.[slug] || {};
  const base = baseAbilities.find(a => a.slug === slug);
  const combined = { ...(base || {}), ...patch };

  if (!combined.name) {
    let cleanName = slug.replace('-', ' ').replace(/\w\S*/g, function(txt){
        return txt.charAt(0).toUpperCase() + txt.substr(1).toLowerCase();
    });

    return { name: cleanName };
  }

  return {
    name: combined.name,
    effect: combined.description || ""
  };
};

const enrichMove = (league, slug, prePhysicalSpecialSplit) => {
  const globalMove = rawMovesData.find(m => m.slug === slug);
  const leaguePatch = patches[league]?.move?.[slug] || {};

  // Combine data sources: patch overrides global
  const move = {
    ...(globalMove || {}),
    ...leaguePatch
  };

  if (!globalMove && !Object.keys(leaguePatch).length) {
    console.warn(`ERROR: Move not found in moves.json or patches for league '${league}': ${slug}`);
    return {
      name: slug.replace(/-/g, ' '),
      type: "unknown",
      power: null,
      damage_class: "unknown",
      effect: "",
    };
  }

  let damage_class = move.category?.toLowerCase() ?? "unknown";
  if (move.category?.toLowerCase() != "status" && prePhysicalSpecialSplit) {
    damage_class = LegacyDamageClassMap[move.type.toLowerCase()] || "unknown";
  }

  return {
    ...((move.basePower && move.basePower > 0) ? { power: move.basePower } : {}),
    type: move.type?.toLowerCase() || "unknown",
    damage_class: damage_class,
    name: move.name || slug,
    effect: move.shortDesc || move.desc || "",
    ...(move.priority != 0 ? { priority: move.priority } : {})
  };
};

// Enrich each Pokémon
for (const leagueKey in finalOutput) {
  const league = finalOutput[leagueKey];
  const gameMetadata = games.find(x => x.lid == leagueKey || x.pid == leagueKey);

  const patchId = gameMetadata?.patchId;
  const prePhysicalSpecialSplit = gameMetadata?.filter?.physicalSpecialSplit ?? false;

  console.log(`Enriching league ${leagueKey}`);

  for (const leaderKey in league) {
    const leader = league[leaderKey];
    leader.pokemon = leader.pokemon.map(p => {
      const enrichedMoves = p.moves.map(m => enrichMove(patchId, m, prePhysicalSpecialSplit));

      const ability = getAbilityData(patchId, p?.ability?.toLowerCase());
      const item = getItemData(patchId, p?.held?.toLowerCase().replace(/-/g, ''));
      const pokeData = getPokemonData(patchId, p.name);

      return {
        ...p,
        moves: enrichedMoves,
        ...(ability ? { ability: ability } : {}),
        ...(item ? { held: item } : {}),
        ...(pokeData.name ? { name: pokeData.name.replace(/\W+/gu, '-').toLowerCase()} : { name: p.name.toLowerCase() }),
        ...(pokeData.imgId ? { sprite: `${pokeData.imgId}` } : {}),
        ...(pokeData.types ? { types: pokeData.types.map(x => x.toLowerCase()) } : {}),
        ...(pokeData.stats ? { stats: pokeData.stats } :
          pokeData.baseStats ? { stats: pokeData.baseStats } : {})
      };
    });
  }
}

// Save final enriched league data
fs.writeFileSync(outputPath, JSON.stringify(finalOutput, null, 2));
console.log(`Enriched league data written to ${outputPath}`);

const finalDir = path.join(dataDir, 'final');
if (!fs.existsSync(finalDir)) fs.mkdirSync(finalDir);

function getDifficulties(diffArray) {
  if (!diffArray || diffArray.length === 0) return [{ title: '', suffix: '' }];

  return diffArray.map(entry => {
    const [title, suffix = ''] = entry.split(':');
    return { title: title.trim(), suffix: suffix.trim() };
  });
}

function isMatchKey(key, suffix, allSuffixes) {
  if (!suffix) {
    // Must not end in any known suffix
    return !allSuffixes.some(s => s && key.endsWith(s));
  } else {
    return key.endsWith(suffix);
  }
}

function filterPokemonByStarter(pokemon, starter) {
  return pokemon.filter(p =>
    !('starter' in p) || !p.starter || p.starter.trim() === starter
  );
}

function writeLeagueFile(pid, suffix, starter, data) {
  let fileName = `${pid}${suffix}`;
  if (starter) {
    fileName = fileName + `.${starter}`;
  }
  fileName += ".json";
  const outputPath = path.join(finalDir, fileName);
  fs.writeFileSync(outputPath, JSON.stringify(data, null, 2));
  console.log(`Wrote ${outputPath}`);
}

for (const leagueKey of Object.keys(finalOutput)) {
  const league = finalOutput[leagueKey];
  const matchingGames = games.filter(g => g.lid === leagueKey);

  for (const game of matchingGames) {
    const difficulties = getDifficulties(game.difficulty);
    const allSuffixes = difficulties.map(d => d.suffix).filter(Boolean);

    for (const { title, suffix } of difficulties) {
      const matchedKeys = Object.keys(league).filter(key =>
        isMatchKey(key, suffix, allSuffixes)
      );

      let starters = [];
      for (const key of matchedKeys) {
        for (const p of league[key].pokemon) {
          if (p.starter?.trim()) starters.push(p.starter.trim());
        }
      }

      // Always include empty starter as default
      starters.push('');

      for (const starter of starters) {
        const outputSubset = {};

        for (const key of matchedKeys) {
          const boss = league[key];
          const filteredPokemon = filterPokemonByStarter(boss.pokemon, starter);
          if (filteredPokemon.length > 0) {
            outputSubset[key] = { ...boss, pokemon: filteredPokemon };
          }
        }

        if (Object.keys(outputSubset).length > 0) {
          writeLeagueFile(game.pid, suffix, starter, outputSubset);
        }
      }
    }
  }
}